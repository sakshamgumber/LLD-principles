# Creational Patterns: Reference for LLD

Use this file only when the LLD is considering a creational pattern, after checking `pattern-selection-guide.md`. Creational patterns control how objects are created. Most object creation needs no pattern at all: a constructor or a plain function is the right default.

Examples use TypeScript, but the ideas apply to any language. When writing the LLD, express them in the codebase's own language and style, and follow whatever creation conventions the codebase already uses (DI framework, module-level instances, factory functions).

## Contents

- [How to use this file](#how-to-use-this-file)
- [Try these first](#try-these-first)
- [Singleton](#singleton)
- [Factory Method](#factory-method)
- [Abstract Factory](#abstract-factory)
- [Builder](#builder)
- [Prototype](#prototype)
- [Choosing between them](#choosing-between-them)
- [Quick decision table](#quick-decision-table)
- [Writing pattern justifications in an LLD](#writing-pattern-justifications-in-an-lld)

---

## How to use this file

Pick a creational pattern only when you can name the creation problem it solves. If you can't, use a constructor.

| Pattern | Trigger question |
|---|---|
| **Singleton** | Must there be exactly one instance, shared process-wide, for a real technical reason? |
| **Factory Method** | Does the caller need an object whose concrete type is decided at runtime? |
| **Abstract Factory** | Must several related objects be created together, and always from the same family? |
| **Builder** | Is the object complex to construct, with many optional parts or validation across fields? |
| **Prototype** | Is creating from scratch expensive or complex, while copying a configured instance is easy? |

---

## Try these first

Before choosing a pattern, check whether a simpler tool solves the problem.

| Need | Simpler option |
|---|---|
| Create an object | `new Thing(deps)` |
| One shared instance | Create it once at app startup (composition root) and inject it |
| Choose a type by key | A plain function with a `switch`, or a `Record<Key, () => Thing>` map |
| Many optional parameters | A typed options object with defaults: `new Thing({ ...defaults, ...opts })` |
| Copy an object | Spread / `structuredClone` / a `copyWith(changes)` method |
| Test data | A small factory function: `makeEmployee({ overrides })` |

If one of these works, use it and don't mention a pattern in the LLD.

---

## Singleton

**Intent:** Guarantee one instance of a class and provide global access to it.

### The problem it solves

Some resources must be shared and created once: a database connection pool, a configuration loaded at startup, a metrics client. Creating several would waste resources or cause conflicts.

### Example

**Classic Singleton (usually not recommended):**

```ts
class ConnectionPool {
  private static instance: ConnectionPool;
  private constructor(private config: DbConfig) {}

  static getInstance(): ConnectionPool {
    if (!this.instance) {
      this.instance = new ConnectionPool(loadConfig());
    }
    return this.instance;
  }
}

// anywhere in the code
const pool = ConnectionPool.getInstance();
```

**Preferred:** one instance, created at the composition root and injected.

```ts
// main.ts (composition root)
const pool = new ConnectionPool(loadConfig());
const employeeRepo = new EmployeeRepository(pool);
const payrollRepo = new PayrollRepository(pool);
```

"Exactly one instance" is a decision about how the app is wired, not something the class itself needs to enforce.

### Use when
- A real technical constraint requires one instance (connection pools, hardware handles, a process-wide cache), and
- The codebase has no composition root or DI container to manage it, or a framework requires it.

### Avoid when
- It's used to avoid passing dependencies around. That's hidden global state.
- The object holds per-request, per-tenant, or per-user data. This causes data leaks between tenants in multi-tenant systems.
- You'll need different instances in tests.

### Common mistakes
- **Hidden dependencies:** `getInstance()` calls buried in business logic, so the class's real dependencies aren't visible in its constructor.
- **Hard-to-test code:** tests can't swap the instance and share state between runs.
- **Mutable global state** that different requests modify concurrently.
- **Lazy initialization races** in multi-threaded languages (Java, Go, C#) if not implemented carefully.
- **Module-level singletons hiding config:** `export const client = new Client(process.env.KEY)` runs at import time and is hard to override in tests.

---

## Factory Method

**Intent:** Delegate the choice of which concrete class to instantiate to a dedicated method, so callers depend on an interface, not a concrete type.

### The problem it solves

The caller needs "a payroll calculator" or "an exporter," and the right concrete type depends on runtime data (country, format, provider). Without a factory, that selection logic is repeated wherever objects are created.

### Example

**Simple factory function (usually enough):**

```ts
interface TaxCalculator {
  calculate(gross: number, emp: Employee): TaxResult;
}

function createTaxCalculator(country: CountryCode): TaxCalculator {
  switch (country) {
    case "US": return new UsTaxCalculator();
    case "IN": return new IndiaTaxCalculator();
    case "CA": return new CanadaTaxCalculator();
    default: throw new UnsupportedCountryError(country);
  }
}
```

**Classic Factory Method (subclasses decide what to create):**

```ts
abstract class PayrollProcessor {
  protected abstract createTaxCalculator(): TaxCalculator;

  run(emp: Employee) {
    const gross = this.grossPay(emp);
    const tax = this.createTaxCalculator().calculate(gross, emp);
    return this.buildPayslip(emp, gross, tax);
  }
}

class UsPayrollProcessor extends PayrollProcessor {
  protected createTaxCalculator() {
    return new UsTaxCalculator();
  }
}
```

Prefer the simple factory function unless the codebase already uses class hierarchies where subclasses customize creation.

### Use when
- The concrete type depends on runtime input (config, user choice, request data).
- The same selection logic would otherwise be duplicated in several places.
- Creation involves setup the caller shouldn't know about (wiring dependencies, reading config).

### Avoid when
- There's only one concrete type. Just call the constructor.
- The selection happens in exactly one place. Inline `switch` is fine there.

### Common mistakes
- `FooFactory` for every class, each containing only `return new Foo()`.
- Factories that grow huge `switch` statements mixing unrelated types. Split by concept, or use a registry map (see OCP in `solid-principles.md`).
- Returning `null` for unknown keys instead of throwing a clear error.
- Factories hiding expensive side effects (network calls, DB connections) that callers don't expect from a "create" call.

---

## Abstract Factory

**Intent:** Create families of related objects that must be used together, without callers specifying concrete classes.

### The problem it solves

Some objects only work correctly in matching sets. Mixing them causes subtle bugs. For example, each payroll provider needs its own client, data mapper, and webhook validator, and using Provider A's mapper with Provider B's client produces corrupt data.

### Example

```ts
interface PayrollProviderFactory {
  createClient(): PayrollClient;
  createMapper(): PayrollDataMapper;
  createWebhookValidator(): WebhookValidator;
}

class AdpFactory implements PayrollProviderFactory {
  createClient() { return new AdpClient(); }
  createMapper() { return new AdpMapper(); }
  createWebhookValidator() { return new AdpWebhookValidator(); }
}

class GustoFactory implements PayrollProviderFactory {
  createClient() { return new GustoClient(); }
  createMapper() { return new GustoMapper(); }
  createWebhookValidator() { return new GustoWebhookValidator(); }
}

class PayrollSyncService {
  constructor(private provider: PayrollProviderFactory) {}

  async sync() {
    const client = this.provider.createClient();
    const mapper = this.provider.createMapper();
    // client and mapper are guaranteed to match
  }
}
```

### Use when
- There are 2+ families today (not hypothetically), and
- Each family has 2+ related products that must match, and
- Mixing products across families would be a real bug.
- Typical cases: integration providers, database dialects, UI themes, cloud providers.

### Avoid when
- There's only one family. Use direct construction.
- Products are independent and can be mixed safely. Use separate factory functions or plain injection.
- A single adapter class per provider would do the job. Often one `AdpAdapter` implements `PayrollProvider` is simpler than three classes plus a factory.

### Common mistakes
- Building it for an imagined second provider. That's YAGNI.
- Adding a new product type requires changing every factory. Expect this cost; it's acceptable only when families are stable and products change rarely.
- Factories that also hold business logic. Factories create; they shouldn't process.

---

## Builder

**Intent:** Construct a complex object step by step, separating construction from its final representation, and validating before the object is created.

### The problem it solves

Some objects have many optional parts, ordering rules, or validation that depends on multiple fields together. Constructors with 10+ parameters are error-prone, and partially built objects can end up in an invalid state.

### Example

**Before: a constructor that's easy to misuse.**

```ts
new PayrollReport(companyId, from, to, true, false, ["dept"], "pdf", undefined, true);
```

**Usually enough in TypeScript: a typed options object with defaults.**

```ts
interface PayrollReportOptions {
  companyId: string;
  period: { from: Date; to: Date };
  groupBy?: ("dept" | "location")[];
  includeContractors?: boolean;
  format?: "pdf" | "csv";
}

function createPayrollReport(opts: PayrollReportOptions): PayrollReport {
  const o = {
    groupBy: [],
    includeContractors: false,
    format: "pdf",
    ...opts,
  };
  if (o.period.from > o.period.to) throw new InvalidPeriodError();
  return new PayrollReport(o);
}
```

**Builder: worth it when construction is staged or cross-field rules matter.**

```ts
class PayrollRunBuilder {
  private employees: Employee[] = [];
  private adjustments: Adjustment[] = [];
  private period?: PayPeriod;

  forPeriod(p: PayPeriod) {
    this.period = p;
    return this;
  }

  addEmployee(e: Employee) {
    this.employees.push(e);
    return this;
  }

  addAdjustment(a: Adjustment) {
    this.adjustments.push(a);
    return this;
  }

  build(): PayrollRun {
    if (!this.period) throw new MissingPeriodError();
    if (this.employees.length === 0) throw new EmptyPayrollRunError();
    for (const a of this.adjustments) {
      if (!this.employees.some(e => e.id === a.employeeId)) {
        throw new OrphanAdjustmentError(a);
      }
    }
    return new PayrollRun(this.period, [...this.employees], [...this.adjustments]);
  }
}
```

### Use when
- The object is assembled incrementally (e.g., in a loop, or from several sources).
- There are validation rules across multiple fields that must be checked before creation.
- The result should be immutable, but building it needs several steps.
- Building test fixtures with many variations (test data builders).
- Generating structured output: queries, documents, request payloads.

### Avoid when
- An options object with defaults covers it. In TypeScript, JavaScript, Python (keyword arguments), and Kotlin (named/default parameters), this is usually the case.
- The object has only a few fields.

### Common mistakes
- Builders that just mirror setters with no validation in `build()`. That's an options object with more code.
- Returning the builder's internal arrays in the built object, so later builder calls mutate the "immutable" result. Copy on `build()`.
- Allowing `build()` to produce invalid objects and validating later.
- Builders for simple DTOs in languages with named parameters.

---

## Prototype

**Intent:** Create new objects by copying an existing, configured instance instead of building from scratch.

### The problem it solves

Some objects are expensive or complex to set up: a fully configured payroll template, a report definition with many settings, a document template. Users often want "a copy of this one, with a few changes."

### Example

```ts
class PayScheduleTemplate {
  constructor(
    readonly name: string,
    readonly frequency: "weekly" | "biweekly" | "monthly",
    readonly deductions: readonly Deduction[],
    readonly approvalSteps: readonly ApprovalStep[],
  ) {}

  copyWith(changes: Partial<PayScheduleTemplate>): PayScheduleTemplate {
    return new PayScheduleTemplate(
      changes.name ?? `${this.name} (copy)`,
      changes.frequency ?? this.frequency,
      (changes.deductions ?? this.deductions).map(d => ({ ...d })),
      (changes.approvalSteps ?? this.approvalSteps).map(s => ({ ...s })),
    );
  }
}

const unionTemplate = standardTemplate.copyWith({
  name: "Union crew – weekly",
  frequency: "weekly",
});
```

### Use when
- The product has a "duplicate" or "create from template" feature.
- Setting up an object from scratch is expensive (loaded from DB, computed, many steps) and copies are frequently needed.
- Objects are configured at runtime by users, so there's no class per variant.

### Avoid when
- Objects are cheap to construct. Use a constructor or factory function.
- The object holds resources that can't be meaningfully copied (open connections, file handles, locks).

### Common mistakes
- Shallow copies of nested mutable data, so the copy and the original share arrays or objects and editing one changes both. Decide and document deep vs. shallow for each field.
- Copying identity fields: the clone keeps the original's `id`, `createdAt`, or audit metadata. Reset these explicitly.
- Copying references to entities that shouldn't be shared (e.g., the copy pointing to the original's employee assignments).
- Relying on `structuredClone` for class instances. It drops methods and prototypes; use an explicit `copyWith` or `clone` method.

---

## Choosing between them

- **"I need one shared instance"** → Create it once at startup and inject it. Singleton only if there's no composition root and a real constraint.
- **"Which class to create depends on runtime data"** → Factory function. Factory Method only if subclasses already customize behavior.
- **"Several objects must match each other"** → Abstract Factory, but first check whether one adapter class per provider is simpler.
- **"Constructing it is complicated"** → Options object first; Builder if it's assembled in steps or needs cross-field validation.
- **"Users want to duplicate a configured thing"** → Prototype via an explicit `copyWith` / `clone` method.

These patterns can combine. A factory can return objects built by a builder; a prototype registry can act as a factory. Combine only when each part solves a named problem.

Overall precedence (matches `SKILL.md`): **user requirements → codebase conventions → simplicity (KISS/YAGNI) → SOLID and design principles → patterns**.

---

## Quick decision table

| Situation in the design | Pattern | Simpler alternative to check first |
|---|---|---|
| Shared connection pool / config / metrics client | Singleton (rarely) | Create at composition root, inject |
| Calculator or exporter chosen by country / format / provider | Factory Method | `switch` function or `Record` map |
| Provider-specific client + mapper + validator that must match | Abstract Factory | One adapter class per provider |
| Payroll run assembled from many inputs with cross-checks | Builder | Options object + validation function |
| Test fixtures with many variations | Builder (test data builder) | `makeX(overrides)` function |
| "Duplicate this template" feature | Prototype | Explicit `copyWith` method (often the same thing) |
| Simple object with a few fields | None | Constructor |

---

## Writing pattern justifications in an LLD

For each creational pattern in the LLD, state three things: the concrete problem, why the simpler alternative isn't enough, and the cost you're accepting.

**Good:**
> *PayrollRunBuilder (Builder): a payroll run is assembled from timesheets, manual adjustments, and reimbursements loaded separately, and adjustments must reference employees in the run. An options object can't enforce that before creation. Cost: one extra class (~60 lines) with unit tests for each validation rule.*

**Good (rejecting a pattern):**
> *Considered Abstract Factory for payroll providers. Rejected: only ADP is in scope, and the client, mapper, and validator can live in one AdpAdapter class. Revisit if a second provider is confirmed.*

**Weak:**
> *Used the Factory pattern to make object creation flexible and extensible.*

If construction is straightforward, don't mention creational patterns at all.
