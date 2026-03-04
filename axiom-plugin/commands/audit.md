---
description: Smart audit selector - analyzes your project and suggests relevant audits
argument: "area (optional) - Which audit to run: concurrency, memory, performance, codable, schema, architecture, swiftui-performance, navigation, layout, glass, text, core-data, swiftdata, icloud, storage, security, privacy, energy, accessibility, modernization, camera, networking, spritekit, testing"
disable-model-invocation: true
---

You are an iOS project auditor with access to specialized Axiom v2 audit agents.

## Your Task

If user specified an area -> launch that specific audit agent
If no area specified -> analyze project and suggest relevant audits

## Available Audits

### Code Auditor (code-auditor agent)
| Area | --focus | Detects |
|------|---------|---------|
| concurrency | concurrency | Swift 6 data races, unsafe Task captures, actor isolation |
| memory | memory | Retain cycles, leaks, Timer/observer patterns |
| performance | performance | ARC issues, allocation patterns, generic specialization |
| codable | codable | JSON serialization issues, Codable anti-patterns |
| schema | schema | Unsafe migrations, DROP operations, FK issues |

### UI Auditor (ui-auditor agent)
| Area | --focus | Detects |
|------|---------|---------|
| architecture | architecture | Logic in view, MVVM patterns, boundary violations |
| swiftui-performance | performance | Expensive body, formatters, missing lazy |
| navigation | navigation | NavigationStack issues, deep linking |
| layout | layout | GeometryReader misuse, hardcoded breakpoints |
| glass | glass | iOS 26 liquid glass adoption |
| text | text | TextKit issues, text rendering |

### Data Auditor (data-auditor agent)
| Area | --focus | Detects |
|------|---------|---------|
| core-data | core-data | Thread safety, schema migrations, N+1 queries |
| swiftdata | swiftdata | @Model issues, VersionedSchema, relationships |
| icloud | icloud | NSFileCoordinator, entitlements, conflicts |
| storage | storage | File protection, storage strategies |

### Standalone Agents
| Area | Agent | Detects |
|------|-------|---------|
| security / privacy | security-scanner | API keys, Privacy Manifests, ATS |
| energy | energy-auditor | Timer abuse, polling, location, animation leaks |
| accessibility | accessibility-auditor | VoiceOver, Dynamic Type, WCAG |
| modernization | modernizer | ObservableObject->@Observable, deprecated APIs |
| camera | modernizer (camera) | Deprecated capture APIs, threading |
| networking | modernizer (networking) | SCNetworkReachability, deprecated patterns |
| spritekit | modernizer (spritekit) | Physics bitmasks, node accumulation |
| testing | test-runner (audit mode) | Flaky tests, slow tests, Swift Testing migration |

## Direct Dispatch

If area argument provided:
1. Look up the agent and focus from the table above
2. Launch that agent with the appropriate --focus parameter
3. Pass the current directory path to the agent

## Batch Execution

**Priority Order:**
1. **CRITICAL** (data loss risk): core-data, swiftdata, schema, storage, icloud
2. **HIGH** (crashes, App Store rejection): concurrency, memory, energy, networking, security, testing
3. **MEDIUM** (architecture, performance): architecture, swiftui-performance, layout, performance
4. **LOW** (enhancements): accessibility, glass, codable, modernization, camera

**Preset Bundles:**
- Pre-release: CRITICAL + HIGH audits
- Architecture review: architecture + navigation + layout + swiftui-performance
- Performance tuning: performance + swiftui-performance + memory + energy
- App Store prep: accessibility + security + storage + networking
- Data layer review: swiftdata + schema + core-data + storage

## Project Analysis (No Area Specified)

If no area argument:
1. Analyze project structure to detect relevant technologies
2. Present findings and ask: "Based on your project, I suggest these audits: [list]. Which would you like to run?"

$ARGUMENTS
