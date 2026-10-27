# General Design Principles: Reference for LLD

Use this file when an LLD adds classes, modules, abstractions, or shared code. These principles help keep designs simple, readable, and safe to change. They are judgment tools, not rules to satisfy. Apply one only when it solves a problem the design actually has.

Examples use TypeScript, but the ideas apply to any language. When writing the LLD, express them in the codebase's own language and style.

## Contents

- [How to use this file](#how-to-use-this-file)
- [KISS: Keep It Simple](#kiss-keep-it-simple)
- [YAGNI: You Aren't Gonna Need It](#yagni-you-arent-gonna-need-it)
- [DRY: Don't Repeat Yourself](#dry-dont-repeat-yourself)
- [Encapsulation](#encapsulation)
- [Law of Demeter](#law-of-demeter-principle-of-least-knowledge)
- [Composition over Inheritance](#composition-over-inheritance)
- [When principles conflict](#when-principles-conflict)
- [Quick decision table](#quick-decision-table)
- [Writing justifications in an LLD](#writing-justifications-in-an-lld)

---

## How to use this file

KISS and YAGNI are the defaults. Check every design against them first. The others are applied only when their trigger question is answered "yes."

| Principle | Trigger question |
|---|---|
| **KISS** | Is there a simpler design that meets the same requirements? |
| **YAGNI** | Is any part of this design built for a requirement nobody stated? |
| **DRY** | Is the same knowledge (a rule, a formula, a mapping) defined in more than one place? |
| **Encapsulation** | Can outside code put this object into an invalid state? |
| **Law of Demeter** | Does code reach through chains of objects to get what it needs? |
| **Composition over inheritance** | Are we using inheritance mainly to reuse code, or building a deep hierarchy? |

---

## KISS: Keep It Simple

Choose the simplest design that meets the actual requirements. Simple means easy to read, trace, and change, not necessarily the fewest lines.

### Example

**Over-engineered:** a configurable rule engine for three fixed overtime rules.

```ts
interface OvertimeRule { appliesTo(day: WorkDay): boolean; multiplier(): number; }
class RuleEngine {
  constructor(private rules: OvertimeRule[], private resolver: ConflictResolver) {}
  evaluate(day: WorkDay): number { /* ... */ }
}
// + RuleFactory, RuleRegistry, ConflictResolver, 3 rule classes
```

**Simple:** a function that states the rules directly.

```ts
function overtimeMultiplier(day: WorkDay): number {
  if (day.isHoliday) return 2.0;
  if (day.hoursWorked > 12) return 2.0;
  if (day.hoursWorked > 8) return 1.5;
  return 1.0;
}
```

The simple version is easier to review against the labor-law spec, and easy to replace if rules later become configurable per state.

### Apply always

KISS is the baseline check for every LLD. For each component, ask: "What breaks if I remove this?" If nothing does, remove it.

### Common mistakes
- **Equating "simple" with "few lines."** Clever one-liners or dense generic code can be harder to understand than a plain loop.
- **Equating "simple" with "no structure."** A 600-line function isn't simple. Separating concerns can make code simpler to follow.
- **Adding layers by habit** (controller → service → manager → handler → repository) where some layers only pass calls through.

---

## YAGNI: You Aren't Gonna Need It

Don't build for requirements you don't have. Speculative flexibility costs time now and complexity forever, and often guesses the wrong future.

### Example

**Requirement:** "Send a payslip email when payroll runs."

**Speculative design:**

```ts
interface NotificationChannel { send(msg: Message): Promise<void>; }
class EmailChannel implements NotificationChannel { /* ... */ }
class NotificationRouter { /* routes by user preference, channel priority, retries */ }
// SMS and push "will be needed later"
```

**YAGNI design:**

```ts
class PayslipNotifier {
  constructor(private email: EmailClient) {}
  async notify(emp: Employee, slip: Payslip) {
    await this.email.send(emp.email, renderPayslipEmail(slip));
  }
}
```

If SMS becomes a real requirement, introducing a channel interface then is a small, well-informed refactor.

### Apply when
- A component exists for "future" needs: extra config options, plugin points, generic parameters, multi-tenant support nobody asked for.
- The LLD includes phrases like "in case," "might," "eventually," or "for flexibility."

### Don't apply YAGNI to
- Things that are expensive to change later, where a small upfront cost is justified: public API shape, database schema and migrations, data retention, security, audit logging, idempotency of payments or payroll runs.
- Requirements that are confirmed (in the PRD, ticket, or stated by the user), even if they ship later.

### Common mistakes
- **Using YAGNI to skip error handling, validation, or tests.** Those are current requirements, not future ones.
- **Ignoring known roadmap items.** YAGNI is about speculation, not ignoring stated plans. Ask the user if unsure.

---

## DRY: Don't Repeat Yourself

Every piece of knowledge should have one authoritative source. DRY is about duplicated knowledge (business rules, formulas, mappings, validation rules), not about code that happens to look similar.

### Example

**Real duplication:** the same rule defined in two places.

```ts
// payroll.ts
const isOvertimeEligible = (e: Employee) => e.type === "hourly" && !e.isExempt;
// timesheet-ui.ts
const showOvertimeColumn = emp.type === "hourly" && !emp.isExempt;
```

When the exemption rule changes, one copy will be missed. Extract it:

```ts
// employee-rules.ts
export const isOvertimeEligible = (e: Employee) => e.type === "hourly" && !e.isExempt;
```

**Coincidental similarity:** not a DRY violation.

```ts
function validateTimesheetHours(h: number) { return h >= 0 && h <= 24; }
function validateRating(r: number)        { return r >= 0 && r <= 24; }  // happens to match today
```

These represent different rules that will change for different reasons. Merging them couples unrelated features.

### Apply when
- The same business rule, constant, or mapping appears in 2+ places and must stay in sync.
- The same logic has been copied for the third time (rule of three).
- Frontend and backend independently encode the same validation and have drifted, or could drift, in harmful ways.

### Don't apply when
- Code looks similar but represents different concepts.
- Removing duplication requires a shared abstraction with flags or parameters to handle each caller's differences.
- The duplication crosses service boundaries where shared code would create tight coupling (shared libraries between microservices).

### Common mistakes
- **The "boolean flag" abstraction:** `formatAmount(x, isPayroll, isInvoice, skipTax)`. If a shared function needs flags per caller, duplication was the better choice.
- **Premature extraction** after seeing two similar snippets.
- **Shared utils / common modules** that grow into a dumping ground everything depends on.

---

## Encapsulation

An object controls its own state and invariants. Outside code changes state only through methods that keep the object valid, and doesn't depend on internal representation.

### Example

**Exposed state:** anyone can make the timesheet invalid.

```ts
class Timesheet {
  public entries: TimeEntry[] = [];
  public status: "draft" | "submitted" | "approved" = "draft";
  public totalHours = 0;
}

timesheet.entries.push(entry);           // totalHours now wrong
timesheet.status = "approved";           // skipped submission and approval checks
```

**Encapsulated:** the object enforces its rules.

```ts
class Timesheet {
  private entries: TimeEntry[] = [];
  private status: TimesheetStatus = "draft";

  addEntry(entry: TimeEntry) {
    if (this.status !== "draft") throw new TimesheetLockedError();
    if (entry.hours <= 0 || entry.hours > 24) throw new InvalidHoursError(entry.hours);
    this.entries.push(entry);
  }

  submit() {
    if (this.entries.length === 0) throw new EmptyTimesheetError();
    this.status = "submitted";
  }

  get totalHours() { return this.entries.reduce((s, e) => s + e.hours, 0); }
  get currentStatus() { return this.status; }
}
```

### Apply when
- An object has invariants (valid ranges, state transitions, totals derived from other fields).
- Multiple places mutate the same data, and bugs come from inconsistent updates.
- Internal representation is likely to change (e.g., storing minutes vs. hours).

### Don't apply when
- The type is a plain data carrier (DTOs, API payloads, config objects, event messages). Public fields or readonly types are fine there.
- Getters and setters would just expose every field anyway. That adds ceremony without protection.

### Common mistakes
- **Getter/setter for every field.** Private fields with public setters are not encapsulation; they're public fields with extra steps.
- **Returning internal mutable collections** (`getEntries()` returning the actual array). Return a copy or a readonly view.
- **Validation spread across callers** instead of in the object that owns the rule.

---

## Law of Demeter (Principle of Least Knowledge)

A unit should only talk to its immediate collaborators. Avoid reaching through chains of objects (`a.getB().getC().doThing()`). Long chains couple the caller to the internal structure of everything along the chain.

### Example

**Violation:**

```ts
const rate = job.getProject().getCompany().getPayrollSettings().getOvertimeRate();
```

If payroll settings move from company to project level, every such chain breaks.

**Better:** ask the nearest object for what you need.

```ts
const rate = job.overtimeRate();   // job knows how to resolve it
```

Or pass the needed value in directly:

```ts
function calculateOvertime(hours: number, overtimeRate: number) { /* ... */ }
```

### Apply when
- The same long chain appears in several places.
- A change to one class's internal structure breaks many unrelated callers.
- Tests need deeply nested mocks (`mock.getA.returns(mockB); mockB.getC.returns(...)`).

### Don't apply when
- Navigating plain data structures, DTOs, or API responses (`response.data.items[0].id` is fine).
- Using fluent/builder APIs or query builders designed for chaining (`query.where(...).orderBy(...).limit(10)`).
- Mapping or transforming data in a pipeline (`list.filter(...).map(...)`).

### Common mistakes
- **Wrapper explosion:** adding `getCompanyPayrollOvertimeRate()` delegating methods for every possible chain. Prefer passing the needed value instead.
- **Applying it to data objects**, where it only adds noise.

---

## Composition over Inheritance

Build behavior by combining objects, not by extending class hierarchies. Inheritance creates the tightest form of coupling; subclasses depend on the parent's internals, and hierarchies become rigid as variations multiply.

### Example

**Inheritance explosion:**

```ts
class Report { /* ... */ }
class PdfReport extends Report { /* ... */ }
class EmailedPdfReport extends PdfReport { /* ... */ }
class ScheduledEmailedPdfReport extends EmailedPdfReport { /* ... */ }
class CsvReport extends Report { /* ... */ }
class EmailedCsvReport extends CsvReport { /* duplicates email logic */ }
```

Each new combination of format and delivery needs a new class.

**Composition:**

```ts
class ReportJob {
  constructor(
    private builder: ReportBuilder,      // what data
    private exporter: ReportExporter,    // pdf, csv, xlsx
    private delivery: ReportDelivery,    // email, s3, download
  ) {}

  async run(params: ReportParams) {
    const report = await this.builder.build(params);
    const file = this.exporter.export(report);
    await this.delivery.deliver(file);
  }
}
```

New formats or delivery methods are independent; combinations come free.

### Apply when
- Variations happen along more than one dimension (format × delivery × schedule).
- Subclasses override parent methods to disable or work around behavior.
- Inheritance exists mainly to share helper methods.
- The hierarchy is more than two levels deep.

### Inheritance is fine when
- There's a true, stable "is-a" relationship and subtypes fully honor the base contract (see LSP in `solid-principles.md`).
- The framework requires it (e.g., extending `Error` for custom errors, framework base classes, UI component bases).
- It's a shallow, single-level hierarchy with a clear template method.

### Common mistakes
- **Base classes named `BaseService` / `AbstractManager`** that collect shared helpers. Use plain functions or injected collaborators instead.
- **Overriding methods to throw or do nothing**, which breaks substitutability.
- **Composition taken too far:** injecting six tiny collaborators to avoid one simple, cohesive class. KISS still applies.

---

## When principles conflict

- **DRY vs. KISS:** If removing duplication needs flags, generics, or a new abstraction that's harder to read than the duplicates, keep the duplication. Duplication is cheaper than the wrong abstraction.
- **DRY vs. decoupling:** Across service or team boundaries, prefer duplicating small bits of logic over sharing a library that couples deployments.
- **YAGNI vs. cost of change:** YAGNI loses where later change is costly (schemas, public APIs, security, money-handling correctness).
- **Encapsulation vs. simplicity:** Plain data stays plain. Encapsulate only objects that have rules to protect.
- **Law of Demeter vs. readability:** Don't add delegating methods just to shorten chains on data objects.
- **Composition vs. KISS:** One cohesive class is fine until a second dimension of variation actually appears.

Overall precedence (matches `SKILL.md`): **user requirements → codebase conventions → simplicity (KISS/YAGNI) → SOLID and these principles → patterns**.

---

## Quick decision table

| Situation in the design | Principle likely relevant | Typical outcome |
|---|---|---|
| Components, layers, or options with no current requirement | YAGNI, KISS | Remove them; note as a future extension point if useful |
| Same business rule in 2+ places that must stay in sync | DRY | Extract to one owner module |
| Similar-looking code representing different concepts | DRY (don't apply) | Keep separate |
| Objects with invariants mutated from many places | Encapsulation | Private state, intention-revealing methods |
| `a.getB().getC().getD()` repeated, deep mocks in tests | Law of Demeter | Ask the nearest object, or pass the value in |
| Subclass per combination of variants | Composition | Inject the varying parts |
| Simple CRUD or glue code | KISS only | Keep it direct; mention no principles |

---

## Writing justifications in an LLD

Only mention a principle when it changed the design, and name the concrete problem it solves.

**Good:**
> *Extracted isOvertimeEligible to employee-rules.ts (DRY): the rule is currently defined separately in payroll and the timesheet UI, and they already disagree for exempt contractors.*

**Good (a principle used to remove something):**
> *Dropped the NotificationChannel interface (YAGNI): only email is in scope. Adding the interface later, if SMS is confirmed, is a small change.*

**Weak:**
> *The design follows DRY, KISS, and YAGNI for clean, maintainable code.*

If the design is direct and no principle changed it, say nothing. That usually means the design is already appropriately simple.
