# Pattern Selection Guide: Reference for LLD

Read this file before proposing any design pattern. It decides two things: whether a pattern is justified at all, and which pattern file to read if it is.

The default answer is no pattern. Most features are well served by functions, classes with constructor-injected dependencies, and direct calls. A pattern earns its place only when it solves a specific problem the design actually has, at a cost lower than the problem it solves.

## Contents

- [The decision process](#the-decision-process)
- [Step 1: Name the problem](#step-1-name-the-problem)
- [Step 2: Check the codebase first](#step-2-check-the-codebase-first)
- [Step 3: Try the simplest solution](#step-3-try-the-simplest-solution)
- [Step 4: Map the problem to a pattern](#step-4-map-the-problem-to-a-pattern)
- [Step 5: Weigh the cost](#step-5-weigh-the-cost)
- [Step 6: Decide: now, later, or never](#step-6-decide-now-later-or-never)
- [Signs a pattern is justified](#signs-a-pattern-is-justified)
- [Signs a pattern is unnecessary](#signs-a-pattern-is-unnecessary)
- [Combining patterns](#combining-patterns)
- [Recording the decision in the LLD](#recording-the-decision-in-the-lld)
- [Worked examples](#worked-examples)

---

## The decision process

```text
1. Name the concrete problem ── can't name one? ──────────────► No pattern
2. Does the codebase already solve it? ── yes ─────────────────► Use the existing mechanism
3. Does a plain function/switch/map/options object solve it? ── yes ► No pattern
4. Map the problem to a candidate pattern; read its category file
5. Is the pattern's cost lower than the problem's cost? ── no ─► No pattern
6. Is the need real now? ── not yet ──► Note it as a future extension point
                         └─ yes ──────► Use the pattern; justify it in the LLD
```

Stop at the first step that rules a pattern out. Most designs stop at step 1, 2, or 3, and that's the expected result.

---

## Step 1: Name the problem

Write the problem in one sentence, in terms of the feature, without mentioning any pattern. If you can't, there's no problem to solve.

| Real problem (pattern may help) | Not a problem (no pattern) |
|---|---|
| "Overtime rules differ structurally across CA, NY, and federal law." | "Overtime calculation should be flexible." |
| "The time-clock SDK returns local times and untyped errors, and is used in 4 modules." | "We should decouple from the vendor." |
| "Payroll completion must trigger notifications, accrual updates, and accounting sync, owned by 3 teams." | "The design should be event-driven." |
| "Approvals need 1–3 levels depending on amount and customer configuration." | "Approvals should be extensible." |

Words like *flexible, extensible, scalable, clean, decoupled, future-proof* describe goals, not problems. Turn them into a concrete statement or drop them.

### Where real problems come from
- **Stated requirements:** PRD, ticket, acceptance criteria, user instructions.
- **Observed pain in the code:** duplicated branching, frequent bugs in one area, hard-to-test modules, repeated merge conflicts.
- **Known constraints:** a second provider under contract, a regulation taking effect, a confirmed roadmap item.

*"Might need someday"* is not a source. Ask the user if unsure.

---

## Step 2: Check the codebase first

Before introducing a pattern, look for an existing way the codebase solves this kind of problem. Consistency usually beats a better local design.

| Problem | Look for existing... |
|---|---|
| Wiring dependencies, shared instances | DI container, composition root, module setup |
| Cross-cutting behavior (logging, retries, auth) | Middleware, interceptors, decorators/annotations, HTTP client config |
| Events and reactions | Event bus, message queue, outbox table, webhooks |
| Background or delayed work | Job queue, scheduler, workflow engine |
| Lifecycle / status rules | State machine library, workflow engine, existing status helpers |
| External integrations | Existing adapter/client folders and their conventions |
| Validation | Validation library, schema definitions (Zod, Joi, class-validator) |
| UI component coordination | Store (Redux, Zustand, NgRx), form library |

If something exists, use it, even if a textbook pattern looks cleaner. If the existing mechanism is genuinely inadequate, say so in the LLD under *"Risks & open questions"* and let the user decide.

---

## Step 3: Try the simplest solution

Write (or sketch) the plain version first. Check it against the real requirement.

| Problem shape | Plain solution |
|---|---|
| Choose behavior by type/key | `switch`, or `Record<Key, Function>` map |
| Behavior differs only in numbers or flags | Configuration data |
| Many optional parameters | Options object with defaults |
| Several steps in order | A function calling them in sequence |
| Ordered checks | Array of rule functions in a loop |
| One reaction to an event | Direct call |
| Status rules | Enum + transition table in one place |
| Convert external data | Mapping function |
| Tree processing | Recursive function over plain data |

The plain solution wins if it:
1. Meets every current requirement,
2. Is easy to read and test, and
3. Would need at most a small, local refactor if requirements grow.

Only move on if the plain version has a concrete shortcoming you can name (e.g., *"the same switch would be duplicated in 4 places," "status checks already disagree in 2 modules"*).

---

## Step 4: Map the problem to a pattern

Find the problem shape, then read only the category file listed.

### Creating objects → [`creational-patterns.md`](creational-patterns.md)

| Problem | Candidate |
|---|---|
| Exactly one shared instance for a technical reason, no composition root | Singleton (rarely) |
| Concrete type chosen at runtime, selection repeated in several places | Factory Method |
| Families of related objects that must match each other | Abstract Factory |
| Complex construction in steps, with cross-field validation | Builder |
| "Duplicate this configured thing" | Prototype |

### Structuring objects → [`structural-patterns.md`](structural-patterns.md)

| Problem | Candidate |
|---|---|
| External or legacy API with the wrong shape | Adapter |
| Two dimensions vary independently; combination classes multiply | Bridge |
| Tree of items and groups, handled uniformly | Composite |
| Optional, combinable behavior around an object | Decorator |
| Callers repeat the same multi-subsystem workflow | Facade |
| Measured memory problem from repeated identical data | Flyweight |
| Controlled access: lazy, cache, permissions, remote | Proxy |

### Behavior and communication → [`behavioral-patterns.md`](behavioral-patterns.md)

| Problem | Candidate |
|---|---|
| Several interchangeable algorithms chosen at runtime | Strategy |
| Behavior depends on lifecycle status with transition rules | State |
| Several independent reactions to one event | Observer |
| Requests that are queued, retried, logged, or undone | Command |
| Ordered, configurable handlers or approvals | Chain of Responsibility |
| Same algorithm steps, a few vary | Template Method |
| Many components interacting in many directions | Mediator |
| Save and restore state (undo, drafts) | Memento |
| Traverse paginated, large, or streamed data | Iterator |
| Many operations over a stable set of types | Visitor |
| User-defined rules evaluated at runtime | Interpreter |

### Principle-level problems → not a pattern

| Problem | Read instead |
|---|---|
| A class does too many unrelated things | SRP in [`solid-principles.md`](solid-principles.md) |
| Business logic tied to I/O or a vendor | DIP in [`solid-principles.md`](solid-principles.md) |
| Same business rule defined in two places | DRY in [`general-design-principles.md`](general-design-principles.md) |
| Objects put into invalid states from outside | Encapsulation in [`general-design-principles.md`](general-design-principles.md) |
| Inheritance hierarchy growing deep | Composition in [`general-design-principles.md`](general-design-principles.md) |

If no row matches, don't force one. The design probably doesn't need a pattern.

---

## Step 5: Weigh the cost

Every pattern has costs. List them honestly and compare them with the cost of the problem.

| Cost | Questions to ask |
|---|---|
| **Indirection** | How many files/hops does a reader follow to see what happens? |
| **New concepts** | Will teammates recognize this, or need to learn it? |
| **Code volume** | How many new classes, interfaces, and lines? |
| **Testing** | Are there new seams to test, or new failure modes (ordering, partial failure)? |
| **Debugging** | Does it hide control flow (events, decorators, chains)? |
| **Consistency** | Does it introduce a second way of doing something the codebase already does? |
| **Lock-in** | Will removing it later be harder than adding it later? |

**Rough guide:**
- **Pattern is worth it** when it removes duplication across several places, prevents a known class of bugs, or isolates a part that changes often.
- **Pattern isn't worth it** when it adds more files than it saves, solves a problem that occurs in one place, or exists for a hypothetical variant.

---

## Step 6: Decide: now, later, or never

| Situation | Decision |
|---|---|
| Problem exists today and the plain solution is already strained | Use the pattern now |
| Problem is confirmed but not yet built (roadmap, signed contract) | Use it now if retrofitting is expensive (schemas, public APIs, money flows); otherwise later |
| Problem is plausible but unconfirmed | Later: design the plain version so the refactor stays easy, and note the extension point in the LLD |
| Problem is speculative | Never (for this LLD) |

### "Refactor later" triggers
Note these in the LLD as signals to revisit:
- The third variant of something appears (rule of three).
- The same `switch` or `if` chain is copied into a second or third place.
- A second provider or integration is confirmed.
- Bugs keep appearing in the same branching or status logic.
- Tests need complicated setup because of a direct dependency.

Designing the plain version to be easy to refactor means: keep the varying logic in one place, put I/O behind constructor-injected dependencies, and keep functions small. That's usually enough.

---

## Signs a pattern is justified

- The problem statement is concrete and comes from requirements or observed pain.
- The plain alternative was tried and has a named shortcoming.
- The pattern removes duplication or branching that exists today.
- Each part of the pattern has a current, real use (no single-implementation interfaces without a boundary reason).
- The team or codebase already uses this pattern elsewhere.
- The LLD can explain the pattern without using its name.

---

## Signs a pattern is unnecessary

- The justification uses goal words only (*flexible, scalable, clean, decoupled*).
- There is one implementation, one variant, or one caller.
- Phrases like *"in case," "someday,"* or *"for future extensibility"* appear.
- The pattern duplicates something the framework or codebase already provides.
- The pattern's classes outnumber the business logic classes.
- Reading the code requires knowing the pattern's name to understand it.
- Removing the pattern would make the code shorter and equally correct.
- Several patterns are stacked to solve one simple problem (e.g., Factory + Strategy + Observer for a single email notification).

---

## Combining patterns

Patterns sometimes work together naturally:
- **Factory + Strategy:** a factory selects which strategy to use.
- **Adapter + Decorator:** an adapter wraps a vendor; decorators add retries and auditing around the adapter.
- **Command + Observer:** a command handler performs work, then publishes an event.
- **Composite + Visitor / Iterator:** operations or traversal over a tree.
- **Facade + Adapter:** a facade coordinates several adapted subsystems.

Each pattern in a combination must still pass steps 1–6 on its own. If a combination exists mainly because one pattern "usually goes with" another, remove the extra one.

---

## Recording the decision in the LLD

For every pattern used, add an entry in the LLD's **Justifications** section:

```markdown
**<Component name>** (<Pattern>)
- Problem: <one concrete sentence, no pattern words>
- Simpler option considered: <what it was and why it falls short>
- Cost accepted: <files/classes added, new failure modes, test impact>
- Revisit if: <optional; the condition that would change this decision>
```

For patterns considered and rejected, add a line in **Alternatives**:

> *Considered `<Pattern>` for `<purpose>`. Rejected: `<reason>`. Revisit if `<trigger>`.*

Record rejections only when a reviewer would reasonably ask about them. Don't list every pattern that wasn't used.

If no pattern is used, don't mention patterns at all.

---

## Worked examples

### Example 1: Pattern rejected
- **Requirement:** Email employees when their payslip is ready.
- **Problem:** "Send one email after payroll completes." Single, direct action.
- **Codebase:** has an `EmailClient` and a job queue.
- **Plain solution:** enqueue a `send-payslip-email` job from the payroll completion code. Meets the requirement.
- **Decision:** no pattern. Observer and a `NotificationChannel` abstraction were not needed; SMS isn't in scope. Revisit if a second reaction or channel is confirmed.

### Example 2: Pattern justified
- **Requirement:** Support overtime calculation for CA, NY, WA, and federal rules; CO is planned next quarter.
- **Problem:** "Overtime rules differ in structure (daily vs. weekly thresholds, 7th-day rules, double time), and the calculation is used by payroll, the timesheet preview, and the cost estimator."
- **Codebase:** no existing mechanism for state-specific rules.
- **Plain solution:** a switch on state inside one function. Each branch would contain 20–60 lines, the function would exceed 200 lines, and the three callers would all depend on it. Testing per state is awkward.
- **Pattern:** Strategy (`behavioral-patterns.md`), selected by a map lookup.
- **Cost:** one interface, one class per state, one map. Each state gets isolated unit tests against published examples. Need is current (4 variants), and a 5th is confirmed.
- **Decision:** use Strategy. No factory class: a `Record<StateCode, OvertimePolicy>` lookup is enough.

### Example 3: Pattern deferred
- **Requirement:** Sync employees from ADP. Leadership has mentioned Gusto "might" be added.
- **Problem:** "ADP's API uses different field names, paginates with cursors, and returns vendor error codes."
- **Codebase:** integrations live in `integrations/<vendor>/` with an adapter class each.
- **Plain solution:** an `AdpEmployeeAdapter` following that convention. Abstract Factory for provider families? Only one provider is confirmed.
- **Decision:** Adapter (matches codebase convention). Abstract Factory deferred. Revisit if a second provider is confirmed; the domain-side interface keeps that refactor small.
