---
name: lld-first-engineering
description: Design-before-code workflow that produces a reviewed Low-Level Design (LLD) before writing or changing implementation code. Use this skill whenever the user asks to build a feature, add a module/service/class, refactor, restructure code, change a public API or data model, or asks "how should I design/structure this", even if they don't say "LLD" or "design". Skip for trivial edits (typos, config values, one-line fixes).
---

# LLD-First Engineering

Design mistakes are cheap to fix on paper and expensive to fix in code.
This skill makes the design visible and agreed on before implementation,
while keeping the design as simple as the real requirements allow.

## 1. Classify the change

- **Trivial** (typo, config value, one-line fix, rename): implement directly. No LLD.
- **Small** (one function/class, no new abstractions or dependencies):
  write a short design note (3–6 lines: what changes, where, how it's tested),
  then proceed unless the user objects.
- **Significant** (new module/service, new interface or abstraction,
  changes across modules, public API, schema, or concurrency changes):
  follow the full workflow below and wait for approval.

When unsure, treat the change as significant.

## 2. Understand before designing

1. Inspect the relevant code: structure, naming, error-handling style,
   dependency injection approach, test framework and conventions.
2. Restate requirements: functional, non-functional (performance, scale,
   security), constraints, and what is out of scope.
3. If an ambiguity would change the design, ask the user before going further.

## 3. Consult references (only what's relevant)

- Always: `references/lld-review-checklist.md`
- When adding classes, interfaces, or dependencies:
  `references/solid-principles.md` and `references/general-design-principles.md`
- Only when considering a design pattern: `references/pattern-selection-guide.md`,
  then the specific pattern file for the pattern you're proposing.

## 4. Precedence when guidance conflicts

1. Explicit user requirements
2. Existing codebase conventions
3. Simplicity (YAGNI)
4. SOLID and general design principles
5. Design patterns

Don't refactor architecture the user didn't ask about. If you see a real
problem outside scope, mention it under "Risks"; don't fix it.

## 5. Simplicity guardrails

- No interface with a single implementation unless it marks a real boundary
  (I/O, external service, test seam).
- Abstract only after the third repetition, not the first.
- Every new class, layer, or pattern must name the concrete problem it solves.
  If you can't name one, remove it.
- Never apply a principle or pattern to demonstrate knowledge.

## 6. LLD output format

```
## LLD: <feature name>
### Summary            — 2–3 sentences
### Requirements       — functional, non-functional, out of scope
### Components         — each with its single responsibility
### Interfaces         — signatures / contracts (language of the codebase)
### Data flow          — steps, optionally a Mermaid sequence diagram
### Error handling     — failure modes and how each is handled
### Testing strategy   — unit / integration / edge cases, what is mocked
### Justifications     — why each new interface, abstraction, pattern exists
### Alternatives       — simpler option considered and why it was/wasn't chosen
### Risks & open questions
```

Run the review checklist against the LLD before showing it to the user.

## 7. Approval gate

Stop after presenting the LLD and ask for approval. Explicit approval
("approved", "go ahead", "looks good, implement") is required; silence or
unrelated replies aren't approval. If the user requests changes, revise
and re-present only the changed sections.

## 8. Implementation

- Implement what was approved.
- If you find something mid-implementation that requires a design change,
  stop, explain the issue, and propose the adjusted design. Don't
  silently deviate.
- Afterwards, briefly confirm that the code matches the LLD, list any
  differences, and confirm the planned tests exist and pass.
