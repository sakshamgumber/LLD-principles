# LLD Review Checklist

Complete this checklist before presenting an LLD and asking for approval. Its purpose is to catch gaps and over-engineering while they're still cheap to fix: on paper, before any code exists.

## Contents

- [How to use this checklist](#how-to-use-this-checklist)
- [Scale by change size](#scale-by-change-size)
- [A. Scope and requirements](#a-scope-and-requirements)
- [B. Fit with the codebase](#b-fit-with-the-codebase)
- [C. Components and responsibilities](#c-components-and-responsibilities)
- [D. Interfaces and contracts](#d-interfaces-and-contracts)
- [E. Dependencies](#e-dependencies)
- [F. Data flow and data model](#f-data-flow-and-data-model)
- [G. Error handling and failure modes](#g-error-handling-and-failure-modes)
- [H. Concurrency, idempotency, and consistency](#h-concurrency-idempotency-and-consistency)
- [I. Security and privacy](#i-security-and-privacy)
- [J. Performance and scale](#j-performance-and-scale)
- [K. Observability](#k-observability)
- [L. Testing strategy](#l-testing-strategy)
- [M. Simplicity and justification](#m-simplicity-and-justification)
- [N. Compatibility, rollout, and rollback](#n-compatibility-rollout-and-rollback)
- [O. Presentation readiness](#o-presentation-readiness)
- [Reporting the review in the LLD](#reporting-the-review-in-the-lld)
- [Common review failures](#common-review-failures)

---

## How to use this checklist

1. Write the LLD draft.
2. Go through each section that applies. Mark every item as one of:
   - **Pass:** the LLD covers it.
   - **N/A:** genuinely doesn't apply (e.g., no database changes). Don't use N/A to skip hard questions.
   - **Fixed:** it was missing; you updated the LLD.
   - **Open:** can't be resolved without the user. Add it to "Risks & open questions."
3. Items marked **`[B]`** are **blocking**. Don't request approval while a blocking item is unresolved, unless it's listed as an explicit open question for the user to decide.
4. Items without a marker are advisory. Address them or note why not.
5. Add a short review summary to the LLD (see [Reporting the review](#reporting-the-review-in-the-lld)). Don't paste the full checklist into the LLD.

Be honest. The checklist is for finding problems, not for producing a list of ticks.

---

## Scale by change size

| Change tier (from `SKILL.md`) | What to check |
|---|---|
| **Trivial** | Nothing. No LLD. |
| **Small (design note)** | A1, B1, G1, I1, L1, M1 |
| **Significant (full LLD)** | All sections that apply |

Some areas always need full attention when touched, regardless of size: money or payroll calculations, authentication/authorization, personal or financial data, database schema changes, public APIs, and anything irreversible (sending payments, filing taxes, deleting data). For these, treat the change as significant.

---

## A. Scope and requirements

- [ ] **A1 [B]** The LLD restates the problem and the functional requirements in its own words.
- [ ] **A2 [B]** Every functional requirement maps to at least one component or flow in the design.
- [ ] **A3** Non-functional requirements are stated where relevant (performance, volume, latency, availability, compliance).
- [ ] **A4 [B]** Out-of-scope items are listed explicitly.
- [ ] **A5 [B]** Ambiguities that would change the design were asked about, or are listed as open questions. No design decision rests on a silent assumption.
- [ ] **A6** Assumptions that were made are stated, so the user can correct them.
- [ ] **A7** Edge cases from the domain are considered (empty inputs, zero hours, partial periods, mid-period changes, time zones, daylight saving, leap years, currency rounding).

---

## B. Fit with the codebase

- [ ] **B1 [B]** Relevant existing code was inspected, and the LLD names the files/modules it touches or builds on.
- [ ] **B2 [B]** The design follows existing conventions: folder structure, naming, error style, dependency injection, test framework.
- [ ] **B3** Existing utilities, services, or mechanisms were reused instead of reinvented (event bus, job queue, validation library, HTTP client, auth).
- [ ] **B4** Any deviation from codebase conventions is called out with a reason.
- [ ] **B5** The design doesn't refactor code outside the requested scope. Problems noticed elsewhere are listed under risks, not fixed.

---

## C. Components and responsibilities

- [ ] **C1 [B]** Every new or changed component has a one-sentence responsibility.
- [ ] **C2** No component mixes unrelated concerns (e.g., business rules + HTTP + persistence + formatting). See SRP in [`solid-principles.md`](solid-principles.md).
- [ ] **C3** No component exists without a clear reason (pass-through layers, empty wrappers, managers that only delegate).
- [ ] **C4** Business logic lives in the domain/service layer, not in controllers, adapters, UI components, or database queries.
- [ ] **C5** Ownership of each piece of state is clear: one component is the source of truth for each rule and each piece of data.

---

## D. Interfaces and contracts

- [ ] **D1 [B]** Public signatures are specified in the codebase's language: method names, parameters, return types, error types.
- [ ] **D2** Contracts state their rules: required vs. optional inputs, null handling, ordering guarantees, idempotency, units (hours vs. minutes, cents vs. dollars), and time zones.
- [ ] **D3 [B]** Every new interface has a justification: 2+ implementations now, or a real boundary (I/O, external service, test seam). See [`pattern-selection-guide.md`](pattern-selection-guide.md).
- [ ] **D4** Interfaces are shaped by what callers need, not by an implementation or vendor API. See ISP and DIP in [`solid-principles.md`](solid-principles.md).
- [ ] **D5** Interfaces don't leak implementation details (ORM entities, vendor types, HTTP status codes, SQL errors).
- [ ] **D6** Any second implementation or subtype honors the full contract (LSP). Test doubles honor it too.
- [ ] **D7** API endpoints (if any) specify method, path, request/response shapes, status codes, pagination, and auth.

---

## E. Dependencies

- [ ] **E1 [B]** All dependencies of each new component are listed, internal and external.
- [ ] **E2** Dependencies are passed in (constructor/parameters), not hidden as globals, `getInstance()` calls, or import-time singletons.
- [ ] **E3** No circular dependencies between modules.
- [ ] **E4** Dependency direction is correct: domain logic doesn't depend on infrastructure details.
- [ ] **E5 [B]** Any new third-party library is justified, its license is acceptable, it's actively maintained, and nothing existing in the codebase already covers it.
- [ ] **E6** Dependencies on other teams' services are identified, including what happens when they're unavailable.

---

## F. Data flow and data model

- [ ] **F1 [B]** The main flow is described step by step, from trigger (request, job, event) to final result. A sequence diagram is included for flows with 4+ participants.
- [ ] **F2** Data shapes at each boundary are clear (input DTO → domain object → persisted record → response).
- [ ] **F3 [B]** Database changes are specified: tables/columns, types, nullability, defaults, indexes, constraints, and foreign keys.
- [ ] **F4 [B]** Migrations are described, including backfilling existing rows, and whether they're safe on large tables without locking.
- [ ] **F5** Money is stored and calculated in a precise representation (integer minor units or decimal), with a stated rounding rule. Never floating point.
- [ ] **F6** Dates and times specify time zone handling (stored in UTC; local time used for business rules such as pay periods and daily overtime).
- [ ] **F7** Data retention and deletion are considered for new data, especially personal data.
- [ ] **F8** Multi-tenant scoping is explicit: every query, cache key, and event includes the tenant/company identifier.

---

## G. Error handling and failure modes

- [ ] **G1 [B]** Each external call and each step that can fail has a defined behavior: retry, fail, fallback, or record for later.
- [ ] **G2 [B]** Multi-step operations state what happens on partial failure (transaction, compensating action, resumable state, or "incomplete" status). No step leaves data silently inconsistent.
- [ ] **G3** Error types are domain-specific and follow the codebase's error conventions. Vendor/infrastructure errors are translated at the boundary.
- [ ] **G4** Validation happens at the boundary, with clear user-facing messages. Validation rules live in one place.
- [ ] **G5** Errors are never silently swallowed. Every caught error is handled, logged, or rethrown.
- [ ] **G6** Retries apply only to transient errors, use backoff, and have a limit.
- [ ] **G7** Timeouts are set for all external calls.
- [ ] **G8** User-visible behavior on failure is defined (error message, partial results, "try again" state).

---

## H. Concurrency, idempotency, and consistency

- [ ] **H1 [B]** Operations that can be retried or triggered twice are idempotent (idempotency keys, unique constraints, or upsert logic). Required for payments, payroll submissions, emails, and external writes.
- [ ] **H2** Concurrent modifications are handled (optimistic locking with a version column, conditional updates, or row locks). Example: two approvers approving the same timesheet.
- [ ] **H3** Transaction boundaries are stated: what's committed together and what isn't.
- [ ] **H4** Events or jobs that must not be lost are written durably (outbox table, queue), not only published in memory.
- [ ] **H5** Event/message handlers tolerate duplicates and out-of-order delivery.
- [ ] **H6** Scheduled jobs are safe if two instances run at once, or are protected by a lock.

---

## I. Security and privacy

- [ ] **I1 [B]** Authorization is checked for every new operation: who can do this, for which company/tenant, and for which records.
- [ ] **I2 [B]** Tenant isolation holds: users can't access another company's data through IDs, queries, caches, exports, or search.
- [ ] **I3 [B]** Sensitive data (SSNs, bank accounts, salaries, tax IDs, addresses, health information) is identified, encrypted where required, masked in UIs where appropriate, and never written to logs, error messages, analytics, or URLs.
- [ ] **I4** All external input is validated: type, size, format, and allowed values.
- [ ] **I5** No injection risks: parameterized queries, no `eval` or dynamic code execution, safe file paths, safe template rendering.
- [ ] **I6** Secrets come from the existing secrets mechanism, never from code or config files in the repo.
- [ ] **I7** File uploads and downloads have type, size, and access checks.
- [ ] **I8** Audit records are kept for sensitive actions (pay changes, approvals, permission changes, data exports): who, what, when.

---

## J. Performance and scale

- [ ] **J1** Expected volumes are stated (records per company, requests per minute, file sizes), even as rough estimates.
- [ ] **J2** No N+1 queries: related data is loaded in batches or joins.
- [ ] **J3** Queries on new or large tables use appropriate indexes.
- [ ] **J4** Large collections are paginated or streamed, not loaded fully into memory.
- [ ] **J5** Slow work (bulk processing, external calls, exports, emails) runs in background jobs, not inside user requests.
- [ ] **J6** Caches state their key (including tenant), TTL, and invalidation rule.
- [ ] **J7** External rate limits are respected (batching, throttling, backoff).
- [ ] **J8** No performance optimization is included without a stated volume or measurement that requires it.

---

## K. Observability

- [ ] **K1** Important operations log meaningful events with identifiers (tenant ID, entity ID, correlation/request ID), following the codebase's logging conventions.
- [ ] **K2** Failures that need human attention are visible (error logs at the right level, alerts, a failed-jobs view, or an admin status).
- [ ] **K3** Background and long-running processes report progress or status that can be checked.
- [ ] **K4** Metrics are added where the codebase already tracks similar operations.

---

## L. Testing strategy

- [ ] **L1 [B]** The LLD states what will be tested and at which level (unit, integration, end-to-end), following the codebase's test conventions.
- [ ] **L2 [B]** Business rules have unit tests covering normal cases, boundaries, and edge cases from A7. For calculations (pay, tax, overtime), tests use known expected values.
- [ ] **L3** Error paths and failure modes from section G are tested, not only the happy path.
- [ ] **L4** Integration points have tests against real behavior: recorded vendor responses, test containers, or the codebase's existing integration setup.
- [ ] **L5** What's mocked vs. real is stated. Mocks are used at boundaries, not for the logic being tested.
- [ ] **L6** Tests cover authorization and tenant isolation (a user from company A can't access company B's data).
- [ ] **L7** Concurrency and idempotency behavior from section H is tested where practical (duplicate submissions, double approval).
- [ ] **L8** Database migrations are tested, including against existing data.
- [ ] **L9** Existing tests that will change or break are identified.

---

## M. Simplicity and justification

- [ ] **M1 [B]** The design is the simplest one that meets all stated requirements. For each component, "what breaks if I remove this?" has a real answer.
- [ ] **M2 [B]** Every new interface, abstraction, and design pattern has a justification entry following [`pattern-selection-guide.md`](pattern-selection-guide.md) (problem, simpler option considered, cost accepted).
- [ ] **M3 [B]** No component exists for speculative future needs. Phrases like "in case," "someday," "for flexibility," or "future-proof" don't appear as justifications.
- [ ] **M4** No pattern duplicates something the framework or codebase already provides.
- [ ] **M5** At least one simpler alternative was considered for the overall approach, and the LLD explains why it was or wasn't chosen.
- [ ] **M6** Principles and patterns are mentioned only where they changed the design. No section exists just to show SOLID or pattern knowledge.
- [ ] **M7** The number of new files and classes is proportional to the feature. A small feature with many new classes is a warning sign.
- [ ] **M8** Deferred decisions are recorded with a "revisit if" trigger.

---

## N. Compatibility, rollout, and rollback

- [ ] **N1 [B]** Changes to public APIs, events, file formats, or shared data are backward compatible, or the breaking change and its migration path are stated.
- [ ] **N2** Mobile apps, integrations, and other services that consume changed APIs are identified.
- [ ] **N3** The rollout approach is stated where relevant: feature flag, gradual rollout, or per-tenant enablement.
- [ ] **N4 [B]** A rollback is possible, or the LLD says clearly why not (e.g., irreversible migration, external side effects) and how that risk is handled.
- [ ] **N5** Changes to calculations (pay, tax, overtime) state whether they affect historical data or only future runs, and how already-processed periods are protected.
- [ ] **N6** Documentation or configuration changes needed for release are listed.

---

## O. Presentation readiness

- [ ] **O1 [B]** The LLD follows the output format in `SKILL.md`, with all relevant sections filled in.
- [ ] **O2** Sections that don't apply are omitted or marked N/A briefly, not padded with generic text.
- [ ] **O3** The LLD is understandable by a teammate who hasn't seen the conversation. Terms are defined; file paths are concrete.
- [ ] **O4** Code in the LLD is limited to signatures, types, and short illustrative snippets. No full implementation.
- [ ] **O5 [B]** Open questions are specific and answerable ("Should rejected timesheets return to draft or stay rejected until edited?"), not vague ("Any other requirements?").
- [ ] **O6** The LLD ends with a clear request for approval, and lists what will be implemented once approved.
- [ ] **O7** The length fits the change. A medium feature shouldn't need pages of text.

---

## Reporting the review in the LLD

Add a short Review summary at the end of the LLD, just before the approval request:

```markdown
### Review summary
- Checklist sections reviewed: A–O (H and J not applicable: no concurrent writes, low volume).
- Fixed during review: added idempotency key for provider submission (H1); added tenant ID to tax-rate cache key (F8, I2); removed unused NotificationChannel interface (M3).
- Open items for you: rounding rule for split-shift overtime (A5); whether this change applies to already-closed pay periods (N5).
```

Keep it to a few lines. Only list items that were fixed or remain open. Don't list every passing item.

---

## Common review failures

These come up often. Check for them specifically.

| Failure | Where it shows up | Section |
|---|---|---|
| Happy path only; nothing about partial failure | Multi-step workflows, integrations | G2 |
| Retries without idempotency, causing duplicate payments or emails | Payroll submission, payments, notifications | H1 |
| Tenant ID missing from cache keys, queries, or exports | Caches, reports, search | F8, I2 |
| Personal data in logs or error messages | Integrations, debugging statements | I3 |
| Floating-point money, or no rounding rule | Pay, tax, invoice calculations | F5 |
| Time zone ignored for daily rules | Overtime, shift boundaries, pay periods | F6 |
| Interface with a single implementation and no boundary reason | Services, repositories | D3, M2 |
| Pattern justified with "flexible" or "extensible" | Justifications section | M3 |
| Calculation change silently affects closed periods | Pay rules, tax tables | N5 |
| Tests listed as "unit tests for everything" with no specifics | Testing strategy | L1, L2 |
| Design quietly refactors unrelated code | Components list | B5 |
| Open questions too vague to answer | End of LLD | O5 |

If the review finds no issues at all on a significant change, review once more. A first draft rarely passes every blocking item.
