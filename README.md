# Axiom v2 (Streamlined)

A streamlined fork of [Axiom](https://github.com/CharlesWiltgen/Axiom) by [Charles Wiltgen](https://github.com/CharlesWiltgen) — workflow-oriented Claude Code skills for modern iOS/Swift development.

## Why this fork?

The original Axiom plugin is excellent and comprehensive, but it ships with a large number of agents, skills, commands, and auditors that can be overwhelming. This fork strips it down to the essentials — fewer moving parts, faster skill resolution, and a more focused development experience.

**What changed:**
- Reduced agent and skill surface area
- Removed redundant auditor agents that overlapped with skills
- Simplified routing and skill discovery
- Kept the core iOS/Swift development workflows intact

## What's included

- **12 agents** — focused auditors for build, performance, accessibility, security, and more
- **40 skill domains** — covering SwiftUI, SwiftData, concurrency, networking, testing, and the full Apple platform stack
- **8 commands** — `/fix-build`, `/audit`, `/run-tests`, `/analyze-crash`, `/profile`, `/optimize-build`, `/status`, `/test-simulator`

## Installation

```
/plugin marketplace add Kasempiternal/axiom-v2
/plugin install axiom
```

## Attribution

This project is a modified version of **[Axiom](https://github.com/CharlesWiltgen/Axiom)** created by **Charles Wiltgen**, licensed under the [MIT License](LICENSE).

All original credit goes to Charles Wiltgen for the architecture, skill content, and iOS development workflows. This fork only reorganizes and trims the original to reduce complexity.

## License

MIT — same as the original. See [LICENSE](LICENSE).
