# Behavioral Patterns: Reference for LLD

Use this file only when the LLD is considering a behavioral pattern, after checking `pattern-selection-guide.md`. Behavioral patterns control how objects share responsibility and communicate. Most behavior needs no pattern: a function, an if/switch, or a direct method call is the right default.

Examples use TypeScript, but the ideas apply to any language. When writing the LLD, express them in the codebase's own language and style, and follow the mechanisms the codebase already uses (event bus, job queue, workflow engine, middleware).

## Contents

- [How to use this file](#how-to-use-this-file)
- [Try these first](#try-these-first)
- [Strategy](#strategy)
- [State](#state)
- [Observer](#observer)
- [Command](#command)
- [Chain of Responsibility](#chain-of-responsibility)
- [Template Method](#template-method)
- [Mediator](#mediator)
- [Memento](#memento)
- [Iterator](#iterator)
- [Visitor](#visitor)
- [Interpreter](#interpreter)
- [Choosing between them](#choosing-between-them)
- [Quick decision table](#quick-decision-table)
- [Writing pattern justifications in an LLD](#writing-pattern-justifications-in-an-lld)

*Patterns are ordered roughly by how often they're justified in typical application code, most common first.*

---

## How to use this file

Pick a behavioral pattern only when you can name the behavior problem it solves. If you can't, write the logic directly.

| Pattern | Trigger question |
|---|---|
| **Strategy** | Are there several interchangeable algorithms, chosen at runtime? |
| **State** | Does behavior depend on a lifecycle status with rules about allowed transitions? |
| **Observer** | When something happens, must several independent parts react, without the source knowing them? |
| **Command** | Must requests be queued, scheduled, retried, logged, or undone as objects? |
| **Chain of Responsibility** | Must a request pass through an ordered, configurable series of handlers or checks? |
| **Template Method** | Do several variants share the same algorithm steps, differing in a few? |
| **Mediator** | Do many components talk to each other directly, creating a tangle? |
| **Memento** | Must an object's state be saved and restored (undo, drafts, snapshots)? |
| **Iterator** | Must callers traverse a collection without knowing how it's stored or fetched? |
| **Visitor** | Must many unrelated operations run over a stable set of node types? |
| **Interpreter** | Must users or config express rules in a small language we evaluate? |

---

## Try these first

| Need | Simpler option |
|---|---|
| Choose an algorithm | `switch`, or a `Record<Key, Function>` map of plain functions |
| Track status | An enum field plus a transition table checked in one function |
| React to an event | Call the second function directly, if there's only one reaction |
| Run something later / retry | The existing job queue or scheduler |
| Run checks in order | An array of validation functions, run in a loop |
| Share algorithm steps | A function that takes the varying steps as parameters |
| Undo / history | Store immutable versions or an audit table |
| Traverse a collection | Built-in arrays, generators, or the ORM's pagination |
| User-defined rules | A structured JSON config with a fixed set of options |

If one of these works, use it and don't mention a pattern in the LLD.

---

## Strategy

**Intent:** Define a family of interchangeable algorithms behind one interface and pick one at runtime.

### The problem it solves

Behavior varies by country, client, plan, or configuration. Without Strategy, if/else branches for each variant spread through business logic.

### Example

```ts
interface OvertimePolicy {
  calculate(week: WorkWeek): OvertimeResult;
}

class FederalOvertimePolicy implements OvertimePolicy {
  calculate(week: WorkWeek) { /* > 40 hrs/week at 1.5x */ }
}

class CaliforniaOvertimePolicy implements OvertimePolicy {
  calculate(week: WorkWeek) { /* daily > 8 at 1.5x, > 12 at 2x, 7th-day rules */ }
}

const policies: Record<StateCode, OvertimePolicy> = {
  CA: new CaliforniaOvertimePolicy(),
  DEFAULT: new FederalOvertimePolicy(),
};

class PayCalculator {
  calculate(emp: Employee, week: WorkWeek) {
    const policy = policies[emp.workState] ?? policies.DEFAULT;
    const overtime = policy.calculate(week);
    /* ... */
  }
}
```

In languages with first-class functions, a strategy can just be a function: `type OvertimePolicy = (week: WorkWeek) => OvertimeResult`.

### Use when
- 3+ variants exist (or are confirmed), each with non-trivial logic.
- Variants should be testable in isolation.
- The same variant choice is used in several places.

### Avoid when
- Two simple variants. An `if` is clearer.
- Variants are only data differences (different rates, thresholds). Use configuration, not classes.

### Common mistakes
- Strategy classes that differ only in constants. Pass the numbers in.
- Choosing the strategy in many places. Select it once (factory or map) and inject it.
- Strategies that need to know about each other or share hidden state.

---

## State

**Intent:** Let an object change its behavior when its internal state changes, with explicit rules for allowed transitions.

### The problem it solves

Entities with lifecycles (timesheet, payroll run, invoice, approval request) accumulate checks like `if (status === "approved" && ...)` across the codebase, and invalid transitions slip through.

### Example

**Usually enough: a transition table in one place.**

```ts
type TimesheetStatus = "draft" | "submitted" | "approved" | "rejected" | "locked";

const transitions: Record<TimesheetStatus, TimesheetStatus[]> = {
  draft: ["submitted"],
  submitted: ["approved", "rejected"],
  rejected: ["draft"],
  approved: ["locked"],
  locked: [],
};

class Timesheet {
  private status: TimesheetStatus = "draft";

  transitionTo(next: TimesheetStatus) {
    if (!transitions[this.status].includes(next)) {
      throw new InvalidTransitionError(this.status, next);
    }
    this.status = next;
  }

  canEdit() {
    return this.status === "draft";
  }
}
```

**Full State pattern: worth it when each state has substantial, different behavior.**

```ts
interface PayrollRunState {
  addEmployee(run: PayrollRun, e: Employee): void;
  submit(run: PayrollRun): Promise<void>;
  cancel(run: PayrollRun): Promise<void>;
}

class DraftState implements PayrollRunState { /* editing allowed; submit validates and calls provider */ }
class SubmittedState implements PayrollRunState { /* editing blocked; cancel calls provider void API */ }
class PaidState implements PayrollRunState { /* everything blocked; cancel requires reversal flow */ }
```

### Use when
- An entity has a clear lifecycle with rules about allowed transitions.
- **Transition table:** status checks are scattered or invalid transitions have caused bugs.
- **Full State pattern:** each state has substantially different behavior across several methods, beyond yes/no permission checks.

### Avoid when
- Two states (e.g., active/inactive) with little behavior difference.
- The codebase uses a state machine library or workflow engine. Use it.

### Common mistakes
- Status persisted without a transition check, so other code paths (admin tools, bulk updates, migrations) bypass the rules.
- Side effects inside state objects without transactions, so status and side effect can diverge.
- Not recording transitions. For payroll, approvals, and money, record who changed status, when, and from what (audit trail).
- Race conditions: two approvers act at once. Use optimistic locking (version column) or conditional updates.

---

## Observer

**Intent:** When one object changes or an event occurs, notify all interested subscribers without the source knowing who they are.

### The problem it solves

One action triggers several independent reactions (notify the employee, update accrual balances, sync to accounting, write analytics). If the source calls each directly, it grows a dependency on every consumer.

### Example

```ts
type DomainEvent =
  | { type: "payroll.completed"; runId: string; companyId: string }
  | { type: "timesheet.approved"; timesheetId: string; employeeId: string };

type Handler<E> = (event: E) => Promise<void>;

class EventBus {
  private handlers = new Map<string, Handler<any>[]>();

  subscribe<T extends DomainEvent["type"]>(
    type: T,
    handler: Handler<Extract<DomainEvent, { type: T }>>,
  ) {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  async publish(event: DomainEvent) {
    const results = await Promise.allSettled(
      (this.handlers.get(event.type) ?? []).map(h => h(event)),
    );
    results
      .filter(r => r.status === "rejected")
      .forEach(r => logger.error("event handler failed", { event, r }));
  }
}

bus.subscribe("payroll.completed", e => notifier.sendPayslips(e.runId));
bus.subscribe("payroll.completed", e => accountingSync.postJournal(e.runId));
```

### Use when
- 2+ independent reactions to the same event, owned by different modules or teams.
- New reactions are added over time without changing the source.

### Avoid when
- Exactly one reaction that must happen. Call it directly; it's easier to trace.
- The reaction must succeed for the action to be valid (e.g., saving the payroll ledger). That belongs in the same transaction, not an event.

### In-process vs. durable events

In-process observers lose events if the process crashes after the database commit. For anything that must not be lost (payments, accounting sync, compliance), use the codebase's message queue, often with the transactional outbox pattern: write the event to a table in the same transaction, then publish it from there.

### Common mistakes
- **Hidden control flow:** nobody can tell what happens when an event fires. List all subscribers in the LLD.
- Handler failures swallowed silently or one failure blocking the others.
- Ordering assumptions between handlers that the bus doesn't guarantee.
- Non-idempotent handlers with at-least-once delivery, so duplicates send two emails or post two journal entries.
- Memory leaks from subscriptions that are never removed (common in UI code).

---

## Command

**Intent:** Turn a request into an object that holds everything needed to perform it, so it can be queued, logged, retried, scheduled, or undone.

### The problem it solves

Operations must run later, in the background, with retries, or be recorded and replayed. A plain method call can't be stored or sent.

### Example

```ts
interface Command {
  readonly type: string;
  readonly idempotencyKey: string;
}

interface SendPayslipsCommand extends Command {
  type: "send-payslips";
  runId: string;
  requestedBy: string;
}

interface CommandHandler<C extends Command> {
  handle(cmd: C): Promise<void>;
}

class SendPayslipsHandler implements CommandHandler<SendPayslipsCommand> {
  constructor(private payslips: PayslipRepository, private email: EmailClient) {}

  async handle(cmd: SendPayslipsCommand) { /* ... */ }
}

// Enqueue: serializable data, processed by a worker with retries
await queue.enqueue<SendPayslipsCommand>({
  type: "send-payslips",
  idempotencyKey: `send-payslips:${runId}`,
  runId,
  requestedBy: user.id,
});
```

Keeping commands as plain serializable data (not objects with methods) lets them go onto a queue and into logs.

### Use when
- Work runs asynchronously, on a schedule, or with retries.
- Operations need an audit trail of who requested what.
- Undo/redo is a requirement (each command knows how to reverse itself).
- Bulk actions where each item is processed and can fail independently.

### Avoid when
- A synchronous call is enough and nothing needs storing or retrying.
- Wrapping every service method in a command class "for consistency."

### Common mistakes
- **No idempotency key**, so queue retries cause duplicate effects.
- Commands holding live objects (DB connections, entities) instead of IDs and plain data, so they can't be serialized or retried safely.
- Stale data: a command queued with an employee snapshot, processed after the employee changed. Usually store IDs and reload.
- Undo that isn't really possible (an email already sent, money already moved). Design a compensating action instead and say so in the LLD.

---

## Chain of Responsibility

**Intent:** Pass a request along an ordered chain of handlers; each one processes it, rejects it, or passes it on.

### The problem it solves

A request must go through a configurable series of checks or processing steps (validation rules, approval levels, middleware), and the series changes by client, plan, or configuration.

### Example

**Usually enough: an ordered array of rule functions.**

```ts
type TimesheetRule = (ts: Timesheet, ctx: RuleContext) => RuleViolation | null;

const rules: TimesheetRule[] = [
  noFutureDates,
  maxHoursPerDay(24),
  requiresJobCode,
  overlapsDetected,
];

function validate(ts: Timesheet, ctx: RuleContext): RuleViolation[] {
  return rules.map(r => r(ts, ctx)).filter((v): v is RuleViolation => v !== null);
}
```

**Classic chain: when a handler decides whether the request goes further.**

```ts
interface ApprovalHandler {
  handle(req: ExpenseRequest): Promise<ApprovalResult>;
}

class AmountApprover implements ApprovalHandler {
  constructor(private limit: number, private role: Role, private next?: ApprovalHandler) {}

  async handle(req: ExpenseRequest) {
    if (req.amount <= this.limit) return approveAs(this.role, req);
    if (!this.next) return { status: "rejected", reason: "No approver for amount" };
    return this.next.handle(req);
  }
}

// Supervisor ($500) → Manager ($5000) → Finance director (any amount)
const chain = new AmountApprover(
  500,
  "supervisor",
  new AmountApprover(5_000, "manager", new AmountApprover(Infinity, "finance_director")),
);
```

### Use when
- Ordered steps where each may stop the flow (approvals, auth, request pipelines).
- The set or order of steps is configurable per client or plan.

### Avoid when
- The framework's middleware already provides the chain (HTTP middleware, validation libraries). Use it.
- Steps are fixed and few. Call them in sequence.

### Common mistakes
- Requests that fall off the end with no handler and no error. Always define the "no handler matched" outcome.
- Order dependencies that aren't documented, so reordering breaks behavior.
- Validation chains that stop at the first error when users need to see all errors. Decide "fail fast" vs. "collect all" in the LLD.

---

## Template Method

**Intent:** Define the skeleton of an algorithm once, and let variants fill in specific steps.

### The problem it solves

Several processes follow the same sequence of steps (load, validate, transform, save, report) and differ in only a few. Without a shared skeleton, each copy drifts and fixes get applied to only some of them.

### Example

**Inheritance version:**

```ts
abstract class ImportJob<Row> {
  async run(file: Buffer): Promise<ImportReport> {
    const rows = this.parse(file);
    const errors = rows.flatMap((r, i) => this.validate(r).map(e => ({ row: i + 1, error: e })));
    if (errors.length) return { imported: 0, errors };
    await this.save(rows);
    return { imported: rows.length, errors: [] };
  }

  protected abstract parse(file: Buffer): Row[];
  protected abstract validate(row: Row): string[];
  protected abstract save(rows: Row[]): Promise<void>;
}

class EmployeeImportJob extends ImportJob<EmployeeRow> { /* ... */ }
class TimesheetImportJob extends ImportJob<TimesheetRow> { /* ... */ }
```

**Composition version (often preferred, see `general-design-principles.md`):**

```ts
interface ImportSpec<Row> {
  parse(file: Buffer): Row[];
  validate(row: Row): string[];
  save(rows: Row[]): Promise<void>;
}

async function runImport<Row>(file: Buffer, spec: ImportSpec<Row>): Promise<ImportReport> {
  /* same skeleton, steps supplied by spec */
}
```

### Use when
- 2+ processes share an identical sequence with a few varying steps.
- The fixed parts (ordering, error handling, logging, transactions) must stay consistent across variants.

### Avoid when
- Variants differ in the sequence itself, not just the steps.
- Only one process exists so far.

### Common mistakes
- Too many hooks (`beforeParse`, `afterParse`, `beforeValidate`...), until the skeleton fixes nothing.
- Subclasses overriding the skeleton itself, defeating the purpose.
- Deep hierarchies of templates extending templates.

---

## Mediator

**Intent:** Centralize complex communication between several components in one object, so they don't reference each other directly.

### The problem it solves

Many components affect each other. In a scheduling screen, changing the crew updates the available equipment, which updates the cost estimate, which enables or disables the "submit" button, which depends on the date range. Direct references between all of them create a tangle.

### Example

```ts
class ShiftSchedulerMediator {
  constructor(
    private crewPicker: CrewPicker,
    private equipment: EquipmentPanel,
    private estimate: CostEstimate,
    private submit: SubmitButton,
  ) {
    crewPicker.onChange(crew => this.crewChanged(crew));
    equipment.onChange(items => this.equipmentChanged(items));
  }

  private crewChanged(crew: Crew) {
    this.equipment.setAvailable(equipmentFor(crew));
    this.recalculate();
  }

  private equipmentChanged(items: Equipment[]) {
    this.recalculate();
  }

  private recalculate() {
    const cost = this.estimate.compute(this.crewPicker.value, this.equipment.value);
    this.submit.setEnabled(cost.withinBudget && this.crewPicker.value.length > 0);
  }
}
```

### Use when
- 3+ components interact in many directions, and the rules about interactions change often.
- Common in complex forms, multi-panel UIs, and workflow coordination.

### Avoid when
- Interactions are simple or one-directional. Direct calls or a shared state store are clearer.
- The UI framework's state management (a store, a form library) already solves it.

### Common mistakes
- The mediator becomes a god object holding all business logic. It should coordinate, and delegate real work to components or services.
- Components still talking to each other directly alongside the mediator.

---

## Memento

**Intent:** Capture and restore an object's state without exposing its internals.

### The problem it solves

Users need undo, draft recovery, or "revert to previous version" for complex objects, and the snapshot must be restorable exactly.

### Example

```ts
class PayScheduleEditor {
  private state: EditorState;
  private history: EditorSnapshot[] = [];

  snapshot(): EditorSnapshot {
    return Object.freeze(structuredClone(this.state)); // opaque to callers
  }

  apply(change: Change) {
    this.history.push(this.snapshot());
    if (this.history.length > 50) this.history.shift(); // bounded history
    this.state = reduce(this.state, change);
  }

  undo() {
    const prev = this.history.pop();
    if (prev) this.state = structuredClone(prev);
  }
}
```

### Use when
- Undo/redo or draft restore is a stated requirement.
- A risky multi-step edit must be revertible if a later step fails (in memory).

### Avoid when
- The need is a persistent audit trail or version history. Use a versions table or event log, which is queryable and survives restarts.
- State is small and immutable. Keeping previous values is already enough.

### Common mistakes
- Unbounded history consuming memory.
- Snapshots containing sensitive data (SSNs, bank details) kept longer than needed, or stored in browser storage.
- Shallow snapshots sharing nested objects with live state.

---

## Iterator

**Intent:** Provide a way to traverse a collection without exposing how it's stored or fetched.

### The problem it solves

Most languages have this built in. It's worth designing explicitly when traversal is non-trivial: paginated APIs, large DB result sets that don't fit in memory, or streams.

### Example

```ts
async function* allEmployees(api: HrisClient): AsyncGenerator<Employee> {
  let cursor: string | undefined;
  do {
    const page = await api.listEmployees({ cursor, limit: 200 });
    yield* page.items;
    cursor = page.nextCursor;
  } while (cursor);
}

for await (const emp of allEmployees(hris)) {
  await syncEmployee(emp);
}
```

### Use when
- Hiding pagination or cursors of an external API.
- Processing more records than fit in memory (streaming exports, bulk syncs).

### Avoid when
- Data is an in-memory array. Use built-in iteration.

### Common mistakes
- Loading everything into an array anyway, defeating streaming.
- Offset pagination over changing data, which skips or duplicates rows. Prefer cursor or keyset pagination.
- No handling for rate limits or partial failures mid-iteration, and no way to resume from the last cursor.

---

## Visitor

**Intent:** Add new operations to a stable set of node types without changing those types, by putting each operation in its own visitor.

### The problem it solves

A fixed set of types (e.g., earnings, deductions, taxes, reimbursements on a payslip) needs many unrelated operations (render PDF, export to GL, compute totals, validate), and adding each operation to every type bloats them.

### Example

In TypeScript, a discriminated union with exhaustive switch usually replaces classic double-dispatch Visitor:

```ts
type PayslipLine =
  | { kind: "earning"; code: string; amount: number; hours?: number }
  | { kind: "deduction"; code: string; amount: number; preTax: boolean }
  | { kind: "tax"; jurisdiction: string; amount: number }
  | { kind: "reimbursement"; description: string; amount: number };

function toGlEntry(line: PayslipLine): GlEntry {
  switch (line.kind) {
    case "earning":
      return { account: "6000-wages", debit: line.amount };
    case "deduction":
      return { account: deductionAccount(line.code), credit: line.amount };
    case "tax":
      return { account: taxAccount(line.jurisdiction), credit: line.amount };
    case "reimbursement":
      return { account: "6400-reimb", debit: line.amount };
    default: {
      const _exhaustive: never = line;
      throw new Error("Unhandled line kind");
    }
  }
}
```

The `never` check makes the compiler flag every operation when a new line kind is added. Use classic Visitor (`accept(visitor)`) in languages without union types or pattern matching, or when the codebase already uses it.

### Use when
- The set of node types is stable, and new operations are added often.
- Typical cases: ASTs, document models, payslip/invoice line types, report trees.

### Avoid when
- Node types change often. Each new type touches every visitor.
- There are only one or two operations.

### Common mistakes
- Missing exhaustiveness checks, so a new type silently falls through.
- Visitors that need private data from nodes, forcing encapsulation to be broken.

---

## Interpreter

**Intent:** Represent a small language's grammar as objects and evaluate expressions written in it.

### The problem it solves

Users or admins need to define rules without code changes: custom pay rules, approval conditions, report filters, eligibility criteria.

### Example

```ts
type Expr =
  | { op: "and" | "or"; args: Expr[] }
  | { op: "not"; arg: Expr }
  | { op: "eq" | "gt" | "lt"; field: AllowedField; value: string | number };

type AllowedField = "employee.type" | "employee.state" | "shift.hours" | "shift.isWeekend";

function evaluate(expr: Expr, ctx: RuleContext): boolean {
  switch (expr.op) {
    case "and": return expr.args.every(a => evaluate(a, ctx));
    case "or": return expr.args.some(a => evaluate(a, ctx));
    case "not": return !evaluate(expr.arg, ctx);
    case "eq": return getField(ctx, expr.field) === expr.value;
    case "gt": return Number(getField(ctx, expr.field)) > Number(expr.value);
    case "lt": return Number(getField(ctx, expr.field)) < Number(expr.value);
  }
}

// Stored as JSON, e.g. "weekend shifts over 8 hours for union employees"
const rule: Expr = {
  op: "and",
  args: [
    { op: "eq", field: "employee.type", value: "union" },
    { op: "eq", field: "shift.isWeekend", value: "true" },
    { op: "gt", field: "shift.hours", value: 8 },
  ],
};
```

### Use when
- Rules must be defined by non-developers or per customer, at runtime.
- The rule language is small: a few operators and a fixed list of fields.

### Avoid when
- A fixed set of config options (toggles, thresholds) covers the needs.
- The language would grow loops, variables, or functions. Use an existing rules engine or expression library instead of building one.

### Common mistakes
- **Using `eval` or executing user-written code.** This is a security vulnerability. Only evaluate a structured, validated representation.
- Unrestricted field access that lets rules read data the user shouldn't see. Use an allow-list of fields.
- No limits on rule size or depth, allowing denial of service.
- No validation when rules are saved, so errors surface during payroll processing.
- No versioning: a changed rule silently alters historical recalculations. Store which rule version applied.

---

## Choosing between them

- **"Pick one of several algorithms"** → Strategy.
- **"Behavior depends on lifecycle status"** → State (transition table first).
- **"Several things react to an event"** → Observer; durable queue if events must not be lost.
- **"Run later, retry, log, or undo a request"** → Command.
- **"Ordered, configurable checks or approvals"** → Chain of Responsibility.
- **"Same steps, a few variations"** → Template Method (composition version preferred).
- **"Components tangled together"** → Mediator, or the UI framework's state store.
- **"Undo / restore in memory"** → Memento; versions table for persistent history.
- **"Traverse paginated or large data"** → Iterator (async generator).
- **"Many operations over stable types"** → Visitor (discriminated union + exhaustive switch).
- **"User-defined rules"** → Interpreter over validated JSON, never `eval`.

### Commonly confused pairs
- **Strategy vs. State:** Strategy is chosen by the caller and stays fixed; State changes on its own as the object moves through its lifecycle.
- **Observer vs. Mediator:** Observer broadcasts to unknown subscribers; Mediator coordinates known components with explicit rules.
- **Command vs. Observer:** a command is a request that one handler must carry out; an event is a fact that zero or more handlers may react to.
- **Template Method vs. Strategy:** Template Method fixes the sequence and varies steps; Strategy swaps the whole algorithm.

Overall precedence (matches `SKILL.md`): **user requirements → codebase conventions → simplicity (KISS/YAGNI) → SOLID and design principles → patterns**.

---

## Quick decision table

| Situation in the design | Pattern | Simpler alternative to check first |
|---|---|---|
| Overtime/tax rules that differ by state or country | Strategy | `switch`, or config if only numbers differ |
| Timesheet / payroll run / invoice lifecycle | State | Status enum + transition table |
| Payroll completed → notify, sync accounting, update accruals | Observer | Direct call if only one reaction |
| Background payslip sending, bulk actions, scheduled runs | Command | Existing job queue's job format |
| Multi-level approvals, validation pipelines | Chain of Responsibility | Array of rule functions; framework middleware |
| CSV imports for employees, timesheets, job codes | Template Method | Function taking a spec object |
| Complex scheduling or multi-panel form screens | Mediator | Form library / UI state store |
| Undo in an editor, revert unsaved changes | Memento | Keep previous immutable value |
| Syncing all employees from a paginated HRIS API | Iterator | Built-in loop if data fits in memory |
| Many exports/renderings over payslip line types | Visitor | Discriminated union + exhaustive switch |
| Customer-defined eligibility or pay rules | Interpreter | Fixed config options; existing rules library |
| Straightforward request → service → repository | None | Direct calls |

---

## Writing pattern justifications in an LLD

For each behavioral pattern in the LLD, state three things: the concrete problem, why the simpler alternative isn't enough, and the cost you're accepting.

**Good:**
> *OvertimePolicy (Strategy): CA, NY, and federal rules differ in structure (daily vs. weekly thresholds, 7th-day rules), not just numbers, so config alone can't express them. Each policy is unit-tested against the state's published examples. Selected once by work state.*

**Good:**
> *Timesheet lifecycle uses a transition table rather than State classes: states differ only in which actions are allowed, not in behavior. Transitions use a conditional update on version to prevent double approval.*

**Good (rejecting a pattern):**
> *Considered an in-process event bus for "payroll.completed". Rejected: the accounting sync must not be lost, so the event is written to the existing outbox table and processed by the queue worker.*

**Weak:**
> *Used Observer, Strategy, and Command patterns for a flexible, event-driven architecture.*

If the behavior is a direct sequence of calls, don't mention behavioral patterns at all.
