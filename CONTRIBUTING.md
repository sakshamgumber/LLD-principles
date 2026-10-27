# Contributing to LLD-First Engineering

Thank you for your interest in contributing to **LLD-First Engineering**!

This project aims to help AI coding agents and human engineers write cleaner, more maintainable software by putting Low-Level Design (LLD), pragmatic simplicity, and review before code implementation.

We welcome contributions of all kinds: expanding pattern catalogs, adding idiomatic multi-language examples, improving checklists, refining agent integrations, and fixing typos.

---

## 🧭 Guiding Philosophy

Before contributing design content or patterns, please keep our core tenets in mind:

1. **Simplicity Over Cleverness (YAGNI & KISS)**:
   - The default solution to any problem is a simple function, class, or direct call—not a design pattern.
   - We do not teach patterns to show off architectural vocabulary; we teach patterns to solve concrete, recurring engineering friction.
2. **Pragmatism Over Dogma**:
   - Principles like SOLID are heuristics for managing change, not dogmatic rules to check off.
   - Always document when *not* to use a pattern or principle.
3. **Respect Codebase Conventions**:
   - Guidance should encourage agents to blend into existing architecture, idioms, dependency injection styles, and error-handling patterns.

---

## 🛠️ Areas You Can Contribute

- **Pattern References**:
  - Add missing design patterns or clarify existing ones in `creational-patterns.md`, `structural-patterns.md`, or `behavioral-patterns.md`.
  - Include realistic, modern code examples (TypeScript, Python, Go, Rust, Java, etc.).
  - Add explicit "Try These First" simpler alternatives and "Signs this is unnecessary" sections.
- **LLD Review Checklist**:
  - Suggest new verification questions or failure mode considerations in [`lld-review-checklist.md`](skills/lld-first-engineering/references/lld-review-checklist.md).
- **Agent Integrations**:
  - Add setup configurations or workflow tips for other agentic tools (e.g., Claude Code, Cursor, Windsurf, GitHub Copilot workspace agents).
- **Documentation & Fixes**:
  - Improve explanations, correct typographical errors, or clarify ambiguous phrasing.

---

## 📝 Document Conventions for Pattern References

When adding or updating patterns in `skills/lld-first-engineering/references/`, follow the established document schema:

```markdown
### <Pattern Name>

**Intent**: One clear sentence stating what problem this pattern solves.

#### When to use
- Concrete symptom or requirement #1
- Concrete symptom or requirement #2

#### When NOT to use (Try these first)
- Simpler alternative #1 (e.g., a higher-order function instead of Strategy)
- Overkill symptom #2

#### Code Example
```<language>
// Minimal, production-realistic code example without bloated ceremony
```

#### Decision Checklist
- [ ] Is this problem actually present today, or is it speculative?
- [ ] Have simpler alternatives been eliminated?
```

---

## 🚀 Getting Started

### 1. Fork & Clone
Fork the repository on GitHub and clone your fork locally:

```bash
git clone https://github.com/<your-username>/LLD-principles.git
cd LLD-principles
```

### 2. Create a Feature Branch
Create a descriptive branch for your work:

```bash
git checkout -b feat/add-circuit-breaker-pattern
# or
git checkout -b fix/checklist-clarification
```

### 3. Make Your Edits
- Keep markdown formatting standard and clean (GitHub Flavored Markdown).
- If adding diagrams, use Mermaid syntax (`flowchart`, `sequenceDiagram`, `classDiagram`).
- Keep code snippets concise, type-safe, and focused on the design concept.

### 4. Verify Your Changes
- Ensure all markdown links are valid relative paths.
- Check Mermaid diagrams for syntax errors (quote labels containing special characters).
- Verify consistent header casing and table alignments.

### 5. Commit Your Changes
Write clear, conventional commit messages:

```bash
git commit -m "docs(patterns): add circuit breaker pattern to structural-patterns.md"
```

Common prefixes:
- `feat`: New pattern, guideline, or integration feature
- `docs`: Documentation updates, README changes, or typo fixes
- `refactor`: Restructuring existing guides or checklists
- `style`: Formatting, whitespace, or layout adjustments

### 6. Submit a Pull Request
1. Push your branch to your fork:
   ```bash
   git push origin feat/add-circuit-breaker-pattern
   ```
2. Open a Pull Request against the `main` branch.
3. Describe the problem your PR solves, what was added/changed, and any relevant discussion or rationale.

---

## 📜 Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for all contributors:
- Be respectful and constructive in reviews and discussions.
- Focus on practical trade-offs rather than subjective debates.
- Welcome newcomers and help answer questions.

---

Thank you for helping make software design better and more accessible for engineers and AI agents alike!
