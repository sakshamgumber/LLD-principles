# Structural Patterns: Reference for LLD

Use this file only when the LLD is considering a structural pattern, after checking `pattern-selection-guide.md`. Structural patterns control how objects and classes are combined into larger structures. Most code needs no structural pattern: a class that calls another class directly is the right default.

Examples use TypeScript, but the ideas apply to any language. When writing the LLD, express them in the codebase's own language and style, and follow the structures the codebase already uses (existing adapters, middleware, client wrappers).

## Contents

- [How to use this file](#how-to-use-this-file)
- [Try these first](#try-these-first)
- [Adapter](#adapter)
- [Bridge](#bridge)
- [Composite](#composite)
- [Decorator](#decorator)
- [Facade](#facade)
- [Flyweight](#flyweight)
- [Proxy](#proxy)
- [Choosing between them](#choosing-between-them)
- [Quick decision table](#quick-decision-table)
- [Writing pattern justifications in an LLD](#writing-pattern-justifications-in-an-lld)

---

## How to use this file

Pick a structural pattern only when you can name the structural problem it solves. If you can't, call the collaborator directly.

| Pattern | Trigger question |
|---|---|
| **Adapter** | Does an external or legacy API have the wrong shape for our domain? |
| **Bridge** | Do two independent dimensions vary, causing a class for every combination? |
| **Composite** | Do we have a tree where single items and groups must be handled the same way? |
| **Decorator** | Do we need to add optional behavior around an object, in combinations, without changing it? |
| **Facade** | Do callers repeatedly coordinate several subsystems to do one common task? |
| **Flyweight** | Is memory a measured problem because of many objects with identical shared data? |
| **Proxy** | Do we need to control access to an object (lazy loading, caching, permissions, remote calls) behind the same interface? |

---

## Try these first

| Need | Simpler option |
|---|---|
| Call an external API | Call its client directly from one module, if it's used in one place and tests can mock it |
| Convert data shapes | A mapping function: `toDomainEmployee(apiEmployee)` |
| Add logging/retries/timing to calls | Existing framework middleware, interceptors, or HTTP client options |
| Simplify a common multi-step task | A plain function that does the steps |
| Process a tree | A recursive function over a plain data structure |
| Cache a result | An existing cache utility or memoization at the call site |
| Reduce memory use | Measure first; often data is already shared by reference |

If one of these works, use it and don't mention a pattern in the LLD.

---

## Adapter

**Intent:** Convert the interface of an existing class or external API into the interface our code expects.

### The problem it solves

External services, SDKs, and legacy modules use their own names, data shapes, error types, and conventions. If that shape spreads through the codebase, every vendor change or replacement touches many files.

### Example

```ts
// What our domain needs (owned by the domain, see DIP)
interface TimeClockProvider {
  getPunches(employeeId: string, period: PayPeriod): Promise<Punch[]>;
}

// Adapter: wraps a vendor SDK with a different shape
class LegacyClockAdapter implements TimeClockProvider {
  constructor(private sdk: LegacyClockSdk) {}

  async getPunches(employeeId: string, period: PayPeriod): Promise<Punch[]> {
    try {
      const raw = await this.sdk.fetchRecords({
        emp_no: employeeId,
        start: toVendorDate(period.from),
        end: toVendorDate(period.to),
      });
      return raw.records.map(r => ({
        employeeId,
        clockIn: parseVendorTimestamp(r.in_ts, r.tz),
        clockOut: r.out_ts ? parseVendorTimestamp(r.out_ts, r.tz) : null,
      }));
    } catch (e) {
      throw new TimeClockUnavailableError(e); // vendor errors don't leak
    }
  }
}
```

### Use when
- Integrating a third-party API, SDK, or legacy system whose shape differs from the domain.
- The integration might be replaced, or several providers serve the same purpose.
- Vendor-specific details (date formats, error codes, pagination, auth) would otherwise spread.

### Avoid when
- The external API already matches what the domain needs.
- The integration is used in exactly one place and a mapping function is enough.

### Common mistakes
- **Leaky adapters** that return vendor types, vendor errors, or vendor status codes. The adapter's output should be fully in domain terms.
- **Adapter interface mirrors the vendor API** instead of what the domain needs.
- **Business logic inside adapters** (e.g., overtime rules in the time-clock adapter). Adapters translate; they don't decide.
- **No contract tests**, so vendor changes break production silently. Test adapters against recorded vendor responses.

---

## Bridge

**Intent:** Separate an abstraction from its implementation so both can vary independently, by composing them instead of subclassing every combination.

### The problem it solves

Two independent dimensions vary. With inheritance, you'd need a class for every combination: 3 notification types × 3 delivery channels = 9 classes, and each new type or channel multiplies the count.

### Example

```ts
// Implementation dimension: how messages are delivered
interface MessageChannel {
  send(to: Recipient, content: RenderedMessage): Promise<void>;
}

class EmailChannel implements MessageChannel { /* ... */ }
class SmsChannel implements MessageChannel { /* ... */ }

// Abstraction dimension: what kind of notification it is
abstract class Notification {
  constructor(protected channel: MessageChannel) {}
  abstract send(to: Recipient): Promise<void>;
}

class PayslipReadyNotification extends Notification {
  constructor(channel: MessageChannel, private slip: Payslip) {
    super(channel);
  }

  send(to: Recipient) {
    return this.channel.send(to, renderPayslipReady(this.slip, to));
  }
}

class TimesheetReminderNotification extends Notification { /* ... */ }

// Any notification × any channel, with no combination classes
new PayslipReadyNotification(new SmsChannel(), slip).send(emp);
```

Bridge is essentially "composition over inheritance" applied to two hierarchies (see `general-design-principles.md`).

### Use when
- Two dimensions both vary today, and combinations are needed.
- You see class names combining two concepts (`EmailPayslipNotification`, `SmsPayslipNotification`, `EmailReminderNotification`...).

### Avoid when
- Only one dimension varies. Use plain injection of one collaborator (Strategy).
- The number of combinations is small and stable.

### Common mistakes
- Building both hierarchies upfront when only one currently varies.
- Splitting along the wrong dimension, so changes still touch both sides.
- Confusing with Adapter: Adapter fixes an existing mismatch; Bridge is a design decision made upfront to let two things vary.

---

## Composite

**Intent:** Compose objects into tree structures and let callers treat individual items and groups the same way.

### The problem it solves

Hierarchical data (org charts, cost codes, project phases, permission groups) where callers must compute something over the whole tree. Without Composite, every caller writes its own "is this a group or a leaf?" logic.

### Example

```ts
interface CostNode {
  name: string;
  totalCost(): number;
}

class CostItem implements CostNode {
  constructor(public name: string, private amount: number) {}
  totalCost() {
    return this.amount;
  }
}

class CostGroup implements CostNode {
  private children: CostNode[] = [];

  constructor(public name: string) {}

  add(node: CostNode) {
    this.children.push(node);
    return this;
  }

  totalCost() {
    return this.children.reduce((sum, c) => sum + c.totalCost(), 0);
  }
}

const project = new CostGroup("Building A")
  .add(new CostGroup("Labor")
    .add(new CostItem("Electricians", 42_000))
    .add(new CostItem("Carpenters", 31_500)))
  .add(new CostItem("Permits", 4_200));

project.totalCost(); // works the same for any node
```

### Use when
- The domain is naturally a tree of arbitrary depth.
- Several operations (totals, rendering, permission checks, validation) apply uniformly to leaves and groups.

### Avoid when
- The hierarchy has a fixed depth (e.g., always company → department → employee). Explicit types per level are clearer.
- There's only one tree operation. A recursive function over plain data is simpler.

### Common mistakes
- Leaf classes forced to implement `add`/`remove` and throw (an LSP violation). Keep child management on the group type only.
- No cycle protection when trees are built from user or DB data.
- Recursive operations that are slow on large trees (e.g., a DB query per node). Load the tree in one query and compute in memory.

---

## Decorator

**Intent:** Add behavior to an object by wrapping it in another object with the same interface, without changing the original.

### The problem it solves

Cross-cutting behavior (logging, retries, caching, metrics, auditing) that must be added to some objects, in different combinations, without putting it into the core logic or creating a subclass per combination.

### Example

```ts
interface PayrollClient {
  submitRun(run: PayrollRun): Promise<SubmissionResult>;
}

class RetryingPayrollClient implements PayrollClient {
  constructor(private inner: PayrollClient, private maxAttempts = 3) {}

  async submitRun(run: PayrollRun) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.inner.submitRun(run);
      } catch (e) {
        if (!isTransient(e) || attempt >= this.maxAttempts) throw e;
        await sleep(backoff(attempt));
      }
    }
  }
}

class AuditedPayrollClient implements PayrollClient {
  constructor(private inner: PayrollClient, private audit: AuditLog) {}

  async submitRun(run: PayrollRun) {
    await this.audit.record("payroll.submit.attempt", run.id);
    const result = await this.inner.submitRun(run);
    await this.audit.record("payroll.submit.success", run.id);
    return result;
  }
}

// Combine at the composition root
const client = new AuditedPayrollClient(
  new RetryingPayrollClient(new AdpPayrollClient(config)),
  auditLog,
);
```

### Use when
- Behavior must be optional or combinable per environment or use case.
- Cross-cutting concerns would otherwise clutter core logic.
- You can't or shouldn't modify the original class (vendor code, shared library).

### Avoid when
- The framework already provides middleware, interceptors, or hooks. Use those instead (HTTP client interceptors, Express/Nest middleware, AOP).
- Only one wrapping is ever used. Put the behavior in the class directly.

### Common mistakes
- **Order bugs:** retries outside vs. inside audit logging produce different audit trails. Document the intended order in the LLD.
- **Retrying non-idempotent operations** (submitting payroll, charging cards) without an idempotency key. This can pay or charge twice.
- **Deep wrapper stacks** that make stack traces and debugging hard.
- **Decorators that change the contract** (swallowing errors, changing return values). A decorator must honor the same contract (LSP).

---

## Facade

**Intent:** Provide a simple interface to a complex subsystem for the most common use cases.

### The problem it solves

Callers repeatedly coordinate several services in the same order to do one task. That sequence is duplicated, and each caller must know every subsystem's details.

### Example

**Without Facade: each caller orchestrates five services.**

```ts
const emp = await employeeService.create(data);
await taxService.registerW4(emp.id, data.w4);
await bankService.addDirectDeposit(emp.id, data.bank);
await benefitsService.enroll(emp.id, data.benefits);
await emailService.sendWelcome(emp);
```

**With Facade:**

```ts
class EmployeeOnboarding {
  constructor(
    private employees: EmployeeService,
    private tax: TaxService,
    private bank: BankService,
    private benefits: BenefitsService,
    private email: EmailService,
  ) {}

  async onboard(data: OnboardingData): Promise<Employee> {
    const emp = await this.employees.create(data);
    await this.tax.registerW4(emp.id, data.w4);
    await this.bank.addDirectDeposit(emp.id, data.bank);
    await this.benefits.enroll(emp.id, data.benefits);
    await this.email.sendWelcome(emp);
    return emp;
  }
}
```

In many codebases this is simply an "application service" or "use case" class. It doesn't need to be called a Facade.

### Use when
- The same multi-step workflow is called from several places (API, admin tool, bulk import, background job).
- A subsystem is complex and most callers only need a few common operations.

### Avoid when
- The workflow is used from one place. A function there is enough.
- It would just pass single calls through to one service.

### Common mistakes
- **God facades** that grow to expose everything from every subsystem. Keep each facade focused on one use case or a few related ones.
- **Ignoring partial failures:** if step 4 fails, what about steps 1–3? The LLD must state the strategy (transaction, compensating actions, idempotent retry, or a recorded "incomplete" state).
- **Blocking access to subsystems** that advanced callers legitimately need.

---

## Flyweight

**Intent:** Reduce memory use by sharing common, immutable data among many objects instead of storing a copy in each.

### The problem it solves

A large number of objects carry identical data. For example, millions of time entries each holding a full copy of the same pay-rule configuration or job-code details.

### Example

```ts
// Shared, immutable intrinsic state
class JobCode {
  constructor(
    readonly code: string,
    readonly description: string,
    readonly rateTable: Readonly<Record<string, number>>,
  ) {
    Object.freeze(this);
  }
}

class JobCodeRegistry {
  private cache = new Map<string, JobCode>();

  get(code: string, load: () => JobCode): JobCode {
    let jc = this.cache.get(code);
    if (!jc) {
      jc = load();
      this.cache.set(code, jc);
    }
    return jc;
  }
}

// Extrinsic state stays per object
interface TimeEntry {
  employeeId: string;
  hours: number;
  date: string;
  jobCode: JobCode; // shared reference, not a copy
}
```

### Use when
- Memory or allocation has been measured as a problem, and
- There are very many objects with large, identical, immutable data.
- Typical cases: large in-memory imports, report generation over millions of rows, rendering engines, parsers.

### Avoid when
- Memory hasn't been measured as a problem. This is premature optimization.
- The shared data is mutable.
- Object counts are modest (thousands, not millions).

### Common mistakes
- **Sharing mutable state**, so a change in one place affects all users. Flyweights must be immutable.
- **Unbounded caches** that cause the memory growth they were meant to prevent.
- **Thread-safety issues** in the registry in multi-threaded languages.

---

## Proxy

**Intent:** Provide a stand-in object with the same interface that controls access to the real object.

Common kinds: lazy (create on first use), caching (reuse results), protection (check permissions), remote (hide network calls).

### Example

**Protection proxy:**

```ts
interface PayslipStore {
  getPayslip(id: string): Promise<Payslip>;
}

class AuthorizedPayslipStore implements PayslipStore {
  constructor(private inner: PayslipStore, private auth: AuthContext) {}

  async getPayslip(id: string) {
    const slip = await this.inner.getPayslip(id);
    const allowed = slip.employeeId === this.auth.userId || this.auth.hasPermission("payroll:read:all", slip.companyId);
    if (!allowed) throw new ForbiddenError();
    return slip;
  }
}
```

**Caching proxy:**

```ts
class CachedTaxRateProvider implements TaxRateProvider {
  constructor(private inner: TaxRateProvider, private cache: Cache, private ttlSeconds = 86_400) {}

  async getRates(state: string, year: number) {
    const key = `tax-rates:${state}:${year}`;
    return this.cache.getOrSet(key, () => this.inner.getRates(state, year), this.ttlSeconds);
  }
}
```

### Use when
- Access must be controlled consistently (authorization, rate limits, quotas).
- Expensive objects or calls should be created lazily or cached.
- Callers should use a remote resource as if it were local.

### Avoid when
- The framework already handles it (auth guards, ORM lazy loading, HTTP caching layers). Use the existing mechanism.
- The check or cache is needed in exactly one place. Do it inline.

### Proxy vs. Decorator

They look the same in code. The difference is intent: a **Proxy** controls access to the object; a **Decorator** adds behavior. In the LLD, name it by what it does for the reader ("caching wrapper," "authorization check").

### Common mistakes
- **Stale or incorrect caches:** no TTL, no invalidation, or cache keys missing a dimension (tenant ID, year, locale). Cross-tenant cache key collisions leak data.
- **Authorization only in the proxy**, while other code paths reach the real object directly. Ensure the real object isn't reachable unguarded.
- **Remote proxies that hide latency and failures**, so callers treat network calls like cheap local calls.

---

## Choosing between them

- **"An external API has the wrong shape"** → Adapter.
- **"Two things vary independently and combinations multiply"** → Bridge.
- **"Tree of items and groups, handled uniformly"** → Composite.
- **"Add optional behavior around an object"** → Decorator, unless framework middleware already does it.
- **"Callers repeat the same multi-service workflow"** → Facade (often just a use-case/application service).
- **"Too much memory from repeated identical data"** → Flyweight, only after measuring.
- **"Control access: lazy, cache, permissions, remote"** → Proxy.

Adapter, Decorator, and Proxy all wrap an object. Ask: am I changing the interface (Adapter), adding behavior (Decorator), or controlling access (Proxy)?

Overall precedence (matches `SKILL.md`): **user requirements → codebase conventions → simplicity (KISS/YAGNI) → SOLID and design principles → patterns**.

---

## Quick decision table

| Situation in the design | Pattern | Simpler alternative to check first |
|---|---|---|
| Vendor SDK / legacy API with mismatched shape and errors | Adapter | Mapping function, if used in one place |
| Notification type × delivery channel combinations | Bridge | Inject one channel (Strategy) if only one dimension varies |
| Cost codes, project phases, or org trees of any depth | Composite | Recursive function over plain data |
| Retries, auditing, metrics around a client | Decorator | Framework middleware / interceptors |
| Onboarding, payroll close, or other multi-service workflows | Facade | One function, if called from one place |
| Millions of rows sharing identical config | Flyweight | Measure first; references may already be shared |
| Payslip access checks, cached tax rates, lazy loading | Proxy | Framework auth guards / existing cache utility |
| Direct calls between internal classes | None | Call directly |

---

## Writing pattern justifications in an LLD

For each structural pattern in the LLD, state three things: the concrete problem, why the simpler alternative isn't enough, and the cost you're accepting.

**Good:**
> *LegacyClockAdapter (Adapter): the time-clock SDK returns local-time strings with a separate timezone field and throws untyped errors. The adapter converts to UTC Punch objects and maps errors to TimeClockUnavailableError, so payroll code has no vendor knowledge. Cost: one class plus contract tests against recorded responses.*

**Good:**
> *Wrapped AdpPayrollClient with RetryingPayrollClient (Decorator) instead of adding retries inside it, because the sandbox environment must run without retries. Retries apply only to transient errors, and each submission carries an idempotency key so a retry can't double-pay.*

**Good (rejecting a pattern):**
> *Considered Flyweight for time entries in the bulk import. Rejected: profiling a 200k-row import showed 180 MB peak memory, well within limits.*

**Weak:**
> *Used the Adapter and Facade patterns to keep the architecture clean and decoupled.*

If objects simply call each other directly, don't mention structural patterns at all.
