---
name: run-tests
description: Run tests, debug failures, or audit test quality (launches test-runner agent)
disable-model-invocation: true
arguments:
  - name: scheme
    description: Test scheme name (optional - will discover available schemes if not provided)
    required: false
  - name: target
    description: Specific test class or method to run (optional)
    required: false
  - name: mode
    description: "Mode: run (default), debug, analyze, audit"
    required: false
---

# Run Tests Command

Launches the **test-runner** agent to run, debug, analyze, or audit tests.

## Usage

```
/axiom:run-tests [scheme] [target] [--mode run|debug|analyze|audit]
```

## Modes

- **run** (default): Run tests, parse results, export failure screenshots
- **debug**: Closed-loop debugging - run, analyze, fix, verify
- **analyze**: Diagnose flaky/intermittent test failures
- **audit**: Audit test quality, migration opportunities, slow tests

## Examples

```
/axiom:run-tests
/axiom:run-tests MyAppUITests
/axiom:run-tests MyAppUITests LoginTests
/axiom:run-tests --mode debug
/axiom:run-tests --mode audit
```

## Prefer Natural Language?

- "Run my UI tests" -> run mode
- "Debug why LoginTests keeps failing" -> debug mode
- "My tests fail randomly in CI" -> analyze mode
- "Should I migrate to Swift Testing?" -> audit mode
