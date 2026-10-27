# SOLID Principles: Reference for LLD

Use this file when an LLD adds classes, interfaces, modules, or dependencies. SOLID is a set of tools for managing change. It is not a checklist to satisfy. Apply a principle only when it solves a problem the design actually has.

Examples use TypeScript, but the ideas apply to any language. When writing the LLD, express them in the codebase's own language and style.

## Contents

- [How to use this file](#how-to-use-this-file)
- [S: Single Responsibility](#s-single-responsibility-principle-srp)
- [O: Open/Closed](#o-openclosed-principle-ocp)
- [L: Liskov Substitution](#l-liskov-substitution-principle-lsp)
- [I: Interface Segregation](#i-interface-segregation-principle-isp)
- [D: Dependency Inversion](#d-dependency-inversion-principle-dip)
- [When principles conflict](#when-principles-conflict)
- [Quick decision table](#quick-decision-table)
- [Writing SOLID justifications in an LLD](#writing-solid-justifications-in-an-lld)

---

## How to use this file

For each principle, ask the trigger question. If the answer is "no," skip the principle and don't mention it in the LLD.

| Principle | Trigger question |
|---|---|
| **SRP** | Will this unit change for more than one unrelated reason? |
| **OCP** | Do we have (or concretely expect) multiple variants of this behavior? |
| **LSP** | Are we creating a subtype or a second implementation of a contract? |
| **ISP** | Are clients forced to depend on methods they don't use? |
| **DIP** | Does high-level logic depend directly on I/O, a vendor, or something hard to test? |

The goal is code that's easy to change and test. Fewer files and fewer layers usually serve that goal better than more.

---

## S: Single Responsibility Principle (SRP)

A module should have one reason to change. "Reason to change" means one stakeholder or concern (business rules, persistence, formatting, transport), not "one method."

### Example

**Before:** one class mixes business rules, persistence, and notification.

```ts
class PayrollService {
  async runPayroll(employeeId: string) {
    const emp = await db.query("SELECT * FROM employees WHERE id = $1", [employeeId]);
    const gross = emp.hourlyRate * emp.hours;
    const tax = gross * 0.2;
    await db.query("INSERT INTO payslips ...", [emp.id, gross, tax]);
    await smtp.send(emp.email, `Your net pay: ${gross - tax}`);
  }
}
```

Tax rules, the database schema, and email wording all change for different reasons, and each change risks breaking the others.

**After:** split along those reasons.

```ts
class PayCalculator {                  // changes when pay/tax rules change
  calculate(emp: Employee): Payslip { /* pure logic */ }
}

class PayrollService {                 // orchestrates the use case
  constructor(
    private employees: EmployeeRepository,
    private payslips: PayslipRepository,
    private notifier: PayslipNotifier,
    private calculator: PayCalculator,
  ) {}

  async runPayroll(employeeId: string) {
    const emp = await this.employees.get(employeeId);
    const slip = this.calculator.calculate(emp);
    await this.payslips.save(slip);
    await this.notifier.notify(emp, slip);
  }
}
```

### Apply when
- One unit mixes business logic with I/O (DB, HTTP, files, email).
- Different people or teams would request changes to the same unit.
- A unit is hard to test because testing one behavior needs setup for another.
- The file keeps causing merge conflicts between unrelated features.

### Don't apply when
- The unit is small and its parts always change together.
- Splitting would create classes that are only ever used in one place and have no independent meaning (a "class per method" design).

### Common mistakes
- **Over-splitting:** `UserValidator`, `UserValidatorHelper`, `UserValidatorFactory` for 30 lines of logic. This scatters one idea across many files.
- **Confusing "one responsibility" with "one method."** A repository with `get`, `save`, and `delete` has one responsibility: persistence.
- **Splitting by technical layer only.** Moving code into `utils/` doesn't separate concerns; it hides them.

---

## O: Open/Closed Principle (OCP)

Code should be open for extension and closed for modification. Add new behavior by adding new code, not by editing stable, tested code.

### Example

**Before:** every new export format edits the same function.

```ts
function exportReport(report: Report, format: string): Buffer {
  if (format === "csv") { /* ... */ }
  else if (format === "pdf") { /* ... */ }
  else if (format === "xlsx") { /* ... */ }   // each new format touches this
  throw new Error("Unsupported format");
}
```

**After:** formats plug in through a small contract.

```ts
interface ReportExporter {
  format: string;
  export(report: Report): Buffer;
}

class ExportService {
  private exporters: Map<string, ReportExporter>;
  constructor(exporters: ReportExporter[]) {
    this.exporters = new Map(exporters.map(e => [e.format, e]));
  }
  export(report: Report, format: string): Buffer {
    const exporter = this.exporters.get(format);
    if (!exporter) throw new UnsupportedFormatError(format);
    return exporter.export(report);
  }
}
```

### Apply when
- There are already 3+ variants, or the requirements name upcoming ones.
- Variants are added often, or by different teams.
- The branching logic is duplicated in several places (the same switch on type appears in multiple functions).

### Don't apply when
- There are one or two variants and no concrete plans for more. A simple `if` or `switch` is clearer. Refactor when the third variant arrives.
- The "extension point" is speculative ("we might support other providers someday").

### Common mistakes
- **Plugin architectures for a single case.** A strategy interface with one implementation is extra indirection with no benefit.
- **Guessing the wrong axis of change.** Making formats pluggable when what actually changes is the report columns. Extend along the axis the requirements show, not the one you imagine.
- **Treating OCP as "never edit existing code."** Fixing bugs and simplifying code is still expected.

---

## L: Liskov Substitution Principle (LSP)

A subtype or implementation must be usable anywhere its base type is expected, without surprising the caller. It must accept at least what the base accepts, return what the base promises, and not add new failure modes callers can't handle.

### Example

**Violation:** an implementation that breaks the contract.

```ts
interface FileStorage {
  save(path: string, data: Buffer): Promise<void>;
  read(path: string): Promise<Buffer>;
}

class ReadOnlyArchiveStorage implements FileStorage {
  async save() { throw new Error("Not supported"); }  // callers expect save to work
  async read(path: string) { /* ... */ }
}
```

Any code that calls `save` on a `FileStorage` can now fail unexpectedly.

**Fix:** model the actual capabilities.

```ts
interface FileReader { read(path: string): Promise<Buffer>; }
interface FileWriter { save(path: string, data: Buffer): Promise<void>; }

class S3Storage implements FileReader, FileWriter { /* ... */ }
class ReadOnlyArchiveStorage implements FileReader { /* ... */ }
```

### Apply when
- Creating a subclass or a second implementation of an existing interface.
- Writing test doubles (fakes should honor the same contract as real implementations).
- Swapping providers (e.g., one payment gateway for another).

### Warning signs
- Implementations that throw `NotImplemented` / `Not supported`.
- Callers that check `instanceof` or a type flag before calling methods.
- An implementation that silently ignores input the contract says it handles.
- Stricter input requirements or weaker output guarantees than the base type.
- Different error types or side effects (one implementation retries, another doesn't, and callers depend on it).

### Common mistakes
- **Inheritance for code reuse** when the "is-a" relationship isn't real. Prefer composition.
- **Contracts that are only implied.** If an interface has rules (ordering, idempotency, null handling, which errors are thrown), document them in the LLD so every implementation can follow them.
- **Fakes that are more forgiving than production**, so tests pass and production fails.

---

## I: Interface Segregation Principle (ISP)

Clients shouldn't depend on methods they don't use. Prefer small, focused contracts shaped around what callers need.

### Example

**Before:** one large interface used by many different clients.

```ts
interface EmployeeService {
  getEmployee(id: string): Promise<Employee>;
  updateEmployee(e: Employee): Promise<void>;
  calculatePayroll(id: string): Promise<Payslip>;
  generateTaxForms(year: number): Promise<Buffer>;
  syncWithHRIS(): Promise<void>;
}
```

A timesheet screen that only reads employee names now depends on payroll, tax, and sync code, and its test doubles must stub all five methods.

**After:** split by client need.

```ts
interface EmployeeDirectory {
  getEmployee(id: string): Promise<Employee>;
}
interface PayrollRunner {
  calculatePayroll(id: string): Promise<Payslip>;
}
```

One class can still implement several of these interfaces. ISP is about what callers see, not necessarily how many classes exist.

### Apply when
- Different clients use clearly different subsets of an interface.
- Test doubles need to stub many methods that the test never calls.
- Changes to one method force rebuilds or redeploys of unrelated consumers.
- You're designing a public API or SDK that external code depends on.

### Don't apply when
- All clients use most of the methods.
- The interface is internal, small (a handful of methods), and cohesive.

### Common mistakes
- **One method per interface everywhere** (`IGetter`, `ISetter`), which makes it hard to see what a component actually does.
- **Splitting by implementation detail instead of client need.** Interfaces should be named for the role they play for the caller.

---

## D: Dependency Inversion Principle (DIP)

High-level policy shouldn't depend on low-level details. Both should depend on abstractions, and the abstraction belongs to the high-level side. In practice: business logic depends on a small interface it defines; the database, HTTP client, or vendor SDK implements it.

### Example

**Before:** business logic is tied to a vendor SDK.

```ts
import Stripe from "stripe";

class InvoiceService {
  private stripe = new Stripe(process.env.STRIPE_KEY!);
  async charge(invoice: Invoice) {
    await this.stripe.paymentIntents.create({ amount: invoice.total, currency: "usd" });
  }
}
```

This is hard to unit test, and changing provider means rewriting business logic.

**After:** the domain defines what it needs; an adapter supplies it.

```ts
// owned by the domain
interface PaymentGateway {
  charge(amountCents: number, currency: string, ref: string): Promise<ChargeResult>;
}

class InvoiceService {
  constructor(private payments: PaymentGateway) {}
  async charge(invoice: Invoice) {
    return this.payments.charge(invoice.totalCents, invoice.currency, invoice.id);
  }
}

// infrastructure layer
class StripePaymentGateway implements PaymentGateway { /* wraps Stripe SDK */ }
```

### Apply when
- Business logic touches I/O: databases, queues, HTTP, files, clocks, randomness.
- A third-party service or SDK might be replaced, or is slow/costly to call in tests.
- You need a test seam to make logic deterministic (inject a Clock, not `Date.now()`).

### Don't apply when
- The dependency is a stable, pure library (date formatting, lodash, a math library).
- The code is a thin script or glue layer with no real business logic to protect.
- The codebase has an established pattern (e.g., module-level mocking in tests) that already solves testability. Follow it instead of adding a new one.

### Common mistakes
- **Interfaces that mirror the vendor API** (`StripeLikeGateway` with every Stripe method). Define the interface in domain terms, with only what the domain needs.
- **Interface for every class.** Pure domain logic (calculators, validators) usually doesn't need an interface; inject the real thing.
- **Introducing a DI container into a codebase that uses plain constructor injection.** Constructor parameters are enough in most cases.
- **Leaking details through the abstraction:** returning ORM entities, SDK error types, or HTTP status codes from a domain interface.

---

## When principles conflict

- **SRP vs. simplicity:** If splitting creates classes with no independent meaning or reuse, keep them together and note it as a future split point.
- **OCP vs. YAGNI:** Use a `switch` until variants are real. The refactor to a strategy is cheap when the time comes.
- **DIP vs. codebase conventions:** Conventions win. Introducing a new injection style in one module makes the codebase inconsistent.
- **ISP vs. discoverability:** Fewer, well-named interfaces beat many tiny ones.

Overall precedence (matches `SKILL.md`): **user requirements → codebase conventions → simplicity → SOLID → patterns**.

---

## Quick decision table

| Situation in the design | Principle likely relevant | Typical outcome |
|---|---|---|
| Logic mixed with DB/HTTP/email | SRP, DIP | Separate domain logic; inject a repository/gateway |
| Growing if/else on a type, 3+ cases | OCP | Strategy map or polymorphism |
| Second implementation of an interface | LSP | Check contracts; document invariants |
| Stubs with many unused methods | ISP | Role-based interfaces |
| Hard to test due to vendor SDK / clock | DIP | Domain-owned interface + adapter |
| Small, cohesive, single-variant code | None | Leave it simple; don't mention SOLID |

---

## Writing SOLID justifications in an LLD

Only list principles that changed the design. For each one, name the concrete problem, not the principle in the abstract.

**Good:**
> *PaymentGateway interface (DIP): InvoiceService currently calls the Stripe SDK directly, which blocks unit testing and the planned move to Adyen. The interface has two methods, defined in domain terms.*

**Weak:**
> *Follows SOLID principles for maintainability and extensibility.*

If no principle changed the design, say nothing about SOLID. That's a sign the design is appropriately simple.
