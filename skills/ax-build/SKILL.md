---
name: ax-build
description: Build failures, dependency conflicts, test crashes, simulator issues, environment diagnostics, build performance, TestFlight crash triage
license: MIT
---
# Build & Fix

## Quick Patterns

### Environment-First Diagnostics (Run BEFORE Debugging Code)

80% of mysterious Xcode issues are environment problems, not code bugs.

```bash
# 1. Check for zombie processes
ps aux | grep -E "xcodebuild|Simulator" | grep -v grep

# 2. Check Derived Data size (>10GB = stale)
du -sh ~/Library/Developer/Xcode/DerivedData

# 3. Check simulator states
xcrun simctl list devices | grep -E "Booted|Booting|Shutting Down"
```

**Interpretation:**
- 0 processes + small Derived Data + no stuck sims = environment clean, investigate code
- 10+ processes OR >10GB OR stuck simulators = environment problem, clean first
- Stale code executing OR intermittent failures = clean Derived Data regardless of size

### Clean Everything (Stale Builds / "No such module")

```bash
xcodebuild clean -scheme YourScheme
rm -rf ~/Library/Developer/Xcode/DerivedData/*
rm -rf .build/ build/
xcodebuild build -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16'
```

### SPM Package Not Found

```bash
rm -rf ~/Library/Developer/Xcode/DerivedData
rm -rf ~/Library/Caches/org.swift.swiftpm
xcodebuild -resolvePackageDependencies
xcodebuild clean build -scheme YourScheme
```

### CocoaPods Clean Reinstall

```bash
rm -rf Pods/
rm Podfile.lock
pod install
open YourApp.xcworkspace   # Always workspace, never .xcodeproj
```

### Simulator Recovery

```bash
xcrun simctl shutdown all
xcrun simctl list devices
# If still stuck:
xcrun simctl erase <device-uuid>
# Nuclear option:
killall -9 Simulator
```

### Kill Zombie Processes

```bash
killall -9 xcodebuild
ps aux | grep xcodebuild | grep -v grep
```

### Isolate Failing Test

```bash
xcodebuild test -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:YourTests/SpecificTestClass
```

### Crash Log Analysis

```bash
# Recent crashes
ls -lt ~/Library/Logs/DiagnosticReports/*.crash | head -5

# Symbolicate address
atos -o YourApp.app.dSYM/Contents/Resources/DWARF/YourApp \
  -arch arm64 0x<address>
```

### Build Performance Quick Wins

```bash
# Measure baseline
time xcodebuild build -scheme YourScheme

# Find slowest files to compile
xcodebuild -workspace YourApp.xcworkspace \
  -scheme YourScheme clean build \
  OTHER_SWIFT_FLAGS="-Xfrontend -debug-time-function-bodies" 2>&1 | \
  grep ".[0-9]ms" | sort -nr | head -20
```

**Optimal build settings (Debug):**

| Setting | Debug Value | Why |
|---------|------------|-----|
| `SWIFT_COMPILATION_MODE` | `singlefile` (Incremental) | Only recompiles changed files |
| `ONLY_ACTIVE_ARCH` | `YES` | Build for current device only |
| `DEBUG_INFORMATION_FORMAT` | `dwarf` | Skip dSYM generation |

---

## Decision Tree

### Build Failing?

```
Build failing?
├─ BUILD FAILED with no details?
│  └─ Clean Derived Data -> rebuild
├─ Build intermittent (sometimes succeeds/fails)?
│  └─ Clean Derived Data -> rebuild
├─ Build succeeds but old code executes?
│  └─ Delete Derived Data -> rebuild (2-5 min fix)
├─ "Unable to boot simulator"?
│  └─ xcrun simctl shutdown all -> erase simulator
├─ "No such module PackageName"?
│  ├─ After adding SPM package?
│  │  └─ Clean build folder + reset package caches
│  ├─ After pod install?
│  │  └─ Check Podfile.lock conflicts
│  └─ Framework not found?
│     └─ Check FRAMEWORK_SEARCH_PATHS
├─ "Multiple commands produce"?
│  └─ Duplicate files in target membership
├─ SPM resolution hangs?
│  └─ Clear package caches + derived data
├─ Version conflicts?
│  └─ Use dependency resolution strategies
├─ Tests hang indefinitely?
│  └─ Check simctl list -> reboot simulator
├─ Tests crash?
│  └─ Check ~/Library/Logs/DiagnosticReports/*.crash
├─ Debug vs Release differences?
│  └─ Compare build settings between configurations
├─ Works locally, fails on CI?
│  └─ Dependency caching differences, environment-specific paths
└─ Code logic bug?
   └─ Use ax-lldb for runtime debugging
```

### Build Slow?

```
Build slow?
├─ Compilation slowest phase (>50% of build)?
│  ├─ YES -> Enable -warn-long-function-bodies 100
│  │         Add explicit types to slow functions
│  └─ NO -> Is linking slow?
│      ├─ YES -> Check link dependencies
│      └─ NO -> Are scripts slow?
│          ├─ YES -> Make scripts conditional (skip in Debug)
│          └─ NO -> Check parallelization
├─ Incremental builds recompile everything?
│  └─ Set Debug compilation mode to singlefile (Incremental)
├─ Building for multiple architectures in Debug?
│  └─ Set ONLY_ACTIVE_ARCH = YES for Debug
└─ Build Timeline shows serial targets?
   └─ Enable Parallelize Build in scheme settings
```

### TestFlight Crash?

```
Beta tester reports crash?
├─ Open Xcode Organizer (Window -> Organizer -> Crashes)
├─ Is crash symbolicated?
│  ├─ YES (function names visible) -> Read crash report
│  └─ NO (hex addresses) -> Symbolication workflow
├─ App killed but no crash report?
│  ├─ Check Jetsam reports (memory pressure)
│  ├─ Check for watchdog termination (0x8badf00d)
│  └─ Check Terminations Organizer
└─ Review TestFlight feedback?
   └─ Organizer -> Feedback tab, or ASC -> TestFlight -> Feedback
```

---

## Anti-Patterns

**Debugging code before checking environment** -- Always run environment checks first. Environment cleanup takes 2-5 minutes; debugging environment issues in code wastes 30-120 minutes.

**Rebuilding without cleaning after dependency changes** -- Always `xcodebuild clean build` after adding/updating packages.

**Not committing lockfiles** -- Both `Podfile.lock` and `Package.resolved` must be committed. Team members get different versions otherwise.

**Using "latest" version for dependencies** -- Always specify explicit versions or ranges. Breaking changes surprise you when dependencies update.

**Mixing package managers** -- Using CocoaPods + Carthage + SPM in one project guarantees conflicts. Pick one primary manager.

**Opening .xcodeproj instead of .xcworkspace** -- When using CocoaPods, always open the workspace.

**Optimizing without measuring** -- Always measure baseline, apply ONE optimization, measure after. Placebo improvements waste time.

**Optimizing Release builds for compile speed** -- Release builds ship to users. Optimize Debug for speed, keep Release optimized for runtime.

**Ignoring simulator states** -- "Booting" can hang 10+ minutes. Shutdown/reboot immediately.

**Running full test suite when one test fails** -- Use `-only-testing` to isolate the failing test first.

**Skimming rejection messages** -- Read the FULL rejection text. Copy every guideline number cited.

**Resubmitting without changes hoping for a different reviewer** -- Reviewers see rejection history. Unchanged resubmissions get the same result.

---

## Deep Patterns

### Dependency Resolution Strategies

**Lock to specific versions** (stability over latest features):

```ruby
# CocoaPods
pod 'Alamofire', '5.8.0'       # Exact
pod 'SwiftyJSON', '~> 5.0.0'   # Any 5.0.x
```

```swift
// SPM
.package(url: "...", exact: "1.2.3")
```

**Version ranges** (bug fixes, no breaking changes):

```ruby
pod 'Alamofire', '~> 5.8'      # 5.8.x but not 5.9
```

```swift
.package(url: "...", from: "1.2.0")
.package(url: "...", .upToNextMajor(from: "1.0.0"))
```

**Fork and pin** (custom modifications):

```swift
.package(url: "https://github.com/yourname/package", branch: "custom-fixes")
```

### SPM Version Conflict Resolution

```bash
# See dependency graph
swift package show-dependencies

# See resolved versions
cat Package.resolved

# Reset resolution
rm -rf .build
rm Package.resolved
swift package resolve
```

### Debug vs Release Build Differences

```bash
# Compare settings
xcodebuild -showBuildSettings -configuration Debug > debug.txt
xcodebuild -showBuildSettings -configuration Release > release.txt
diff debug.txt release.txt
```

Common culprits: `SWIFT_OPTIMIZATION_LEVEL` (-Onone vs -O), `ENABLE_TESTABILITY`, `DEBUG` preprocessor flag, code signing settings.

### Build Phase Script Optimization

```bash
# Skip heavy scripts in Debug
#!/bin/bash
if [ "${CONFIGURATION}" = "Release" ]; then
    firebase crashlytics upload-symbols
fi
```

Enable script sandboxing for parallelization:
```
Build Settings -> User Script Sandboxing -> YES
Build Settings -> FUSE_BUILD_SCRIPT_PHASES -> YES
```

Only enable `FUSE_BUILD_SCRIPT_PHASES` if ALL scripts have correct inputs/outputs declared.

### Type Checking Performance

```swift
// Add to Debug build settings -> Other Swift Flags
-warn-long-function-bodies 100
-warn-long-expression-type-checking 100
```

```swift
// SLOW - Complex type inference (247ms)
func calculateTotal(items: [Item]) -> Double {
    return items.filter { $0.isActive }.map { $0.price * $0.quantity }.reduce(0, +)
}

// FAST - Explicit types (12ms)
func calculateTotal(items: [Item]) -> Double {
    let activeItems: [Item] = items.filter { $0.isActive }
    let prices: [Double] = activeItems.map { $0.price * $0.quantity }
    let total: Double = prices.reduce(0, +)
    return total
}
```

### Compilation Caching (Xcode 26+)

```
Build Settings -> COMPILATION_CACHE_ENABLE_CACHING -> YES
```

- Caches compilation results based on input file content and compiler flags
- Works across clean builds
- 20-40% faster clean builds after initial cache population
- Limitations: SPM dependencies not yet cacheable; storyboard/XIB/link tasks not cacheable

### Explicitly Built Modules (Xcode 16+)

Splits module compilation into three phases: scan, build modules, compile. Enabled by default for Swift in Xcode 26.

**Reduce module variants** (unify settings at project/workspace level):
```bash
grep "GCC_PREPROCESSOR_DEFINITIONS" project.pbxproj
# Move target-specific macros to project level where possible
```

### Symbolication Workflow

```bash
# Find matching dSYM by UUID from crash report
mdfind "com_apple_xcode_dsym_uuids == YOUR-UUID-HERE"

# Check Archives
ls ~/Library/Developer/Xcode/Archives/

# Symbolicate a specific address
xcrun atos -arch arm64 \
  -o MyApp.app.dSYM/Contents/Resources/DWARF/MyApp \
  -l 0x100000000 \
  0x0000000100abc123
```

| Symbolication Failure | Cause | Fix |
|----------------------|-------|-----|
| System frames OK, app frames hex | Missing dSYM for your app | Find dSYM in Archives, or re-archive with symbols |
| Nothing symbolicated | UUID mismatch | Verify UUIDs match; rebuild exact same commit |
| "No such file" from atos | dSYM not in Spotlight index | `mdimport /path/to/MyApp.dSYM` |
| Can't find dSYM anywhere | Archived without symbols | Set DEBUG_INFORMATION_FORMAT = dwarf-with-dsym |

### Common Crash Patterns

| Exception Type | Meaning | Common Causes | Fix |
|---------------|---------|---------------|-----|
| `EXC_BAD_ACCESS` (SIGSEGV) | Invalid memory access | Force-unwrap nil, deallocated object, array out of bounds | `guard let` / `if let`, `[weak self]`, bounds check |
| `EXC_CRASH` (SIGABRT) | Deliberate termination | `fatalError()`, uncaught ObjC exception, Swift runtime error | Read "Application Specific Information" for message |
| `0x8badf00d` | Watchdog timeout | Sync network on main thread, sync file I/O, deadlock | Move work to background thread/Task |
| Jetsam (no crash report) | Memory pressure kill | Image caching without limits, large data in memory | `autoreleasepool`, stream large files, release on background |

**Watchdog time limits:** App launch ~20s, background task ~10s, going to background ~5s.

### Common Exception Codes

| Code | Meaning |
|------|---------|
| `KERN_INVALID_ADDRESS` | Null pointer / bad memory access |
| `KERN_PROTECTION_FAILURE` | Memory protection violation |
| `0x8badf00d` | Watchdog timeout (main thread blocked) |
| `0xdead10cc` | Deadlock detected |
| `0xc00010ff` | Thermal event (device too hot) |

### Pressure Scenario: "Quick Fix" Under Deadline

When someone senior suggests a quick fix under time pressure:

1. **Ask**: "Can we spend 5 minutes comparing the broken build to our working build?"
2. **Demand evidence**: "What changed between our last successful build and this failure?"
3. **Document the gamble**: Quick fix takes 10 min to execute but 24 hours to learn it failed. Diagnosis takes 1-2 hours but gives certainty.
4. **Push back professionally**: "A 1-hour diagnosis now means we won't waste another 24-hour cycle."

Quick fixes are safe ONLY when you've seen this EXACT error before, you know the root cause, you can reproduce locally, and you have >48 hours buffer.

### Pressure Scenario: Crash Rate Spiked After TestFlight Build

1. Open Organizer -> Crashes -> Filter to the new build
2. Group crashes by exception type (find the dominant signature)
3. Identify the #1 crash by frequency
4. Symbolicate and read the crash report fully
5. Understand the cause before writing any fix
6. Reproduce locally if possible
7. Fix the verified cause, not a guess

15 minutes of proper triage prevents hours of misdirected debugging.

### Enable Better Diagnostics with MetricKit

```swift
import MetricKit

class MetricsManager: NSObject, MXMetricManagerSubscriber {
    static let shared = MetricsManager()

    func startListening() {
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            if let crashDiagnostics = payload.crashDiagnostics {
                for crash in crashDiagnostics {
                    print("Crash: \(crash.callStackTree)")
                }
            }
            if let hangDiagnostics = payload.hangDiagnostics {
                for hang in hangDiagnostics {
                    print("Hang duration: \(hang.hangDuration)")
                }
            }
        }
    }
}
```

---

## Diagnostics

### Build Performance Audit Checklist

**Measurement**
- [ ] Measured baseline (clean + incremental)
- [ ] Verified improvement in Build Timeline
- [ ] Documented baseline vs optimized comparison

**Compilation Settings**
- [ ] Debug uses incremental compilation (`singlefile`)
- [ ] Build Active Architecture = YES (Debug only)
- [ ] Debug uses DWARF (not dSYM)
- [ ] Type checking warnings enabled
- [ ] Fixed slow type-checking functions (>100ms)

**Parallelization**
- [ ] Parallelize Build enabled in scheme
- [ ] No unnecessary target dependencies
- [ ] Build phase scripts conditional (skip in Debug when possible)
- [ ] Script sandboxing enabled if using parallel scripts

**Xcode 26+**
- [ ] Compilation caching enabled (`COMPILATION_CACHE_ENABLE_CACHING`)
- [ ] Checked module variants (Modules Report in build log)
- [ ] Unified build settings at project level to reduce module variants
- [ ] Explicitly Built Modules enabled (default for Swift in Xcode 26)

### Dependency Checklist

**When adding dependencies:**
- [ ] Specified exact versions or ranges (not just latest)
- [ ] Checked for known conflicts with existing deps
- [ ] Tested clean build after adding
- [ ] Committed lockfile (Podfile.lock or Package.resolved)

**When builds fail:**
- [ ] Ran environment checks first
- [ ] Checked dependency lockfiles for changes
- [ ] Verified using correct workspace/project file
- [ ] Compared working vs broken build settings

**Before shipping:**
- [ ] Tested both Debug and Release builds
- [ ] Verified all dependencies have compatible licenses
- [ ] Checked binary size impact
- [ ] Tested on clean machine or CI

### Common Error Quick Reference

| Error | Fix |
|-------|-----|
| `BUILD FAILED` (no details) | Delete Derived Data |
| `Unable to boot simulator` | `xcrun simctl erase <uuid>` |
| `No such module` | Clean + delete Derived Data + resolve packages |
| Tests hang | Check simctl list, reboot simulator |
| Stale code executing | Delete Derived Data |
| `Multiple commands produce` | Remove duplicate target membership |
| Framework not found | Check FRAMEWORK_SEARCH_PATHS |
| Pod install OK but build fails | Check Podfile.lock conflicts, open .xcworkspace |
| SPM resolution timeout | Clear package caches + derived data |
| Build works locally, fails CI | Check dependency caching, committed lockfiles |

### Xcode Organizer Triage Questions

1. **How long has this been an issue?** -- Check the inspector graph. Legend shows which versions are affected.
2. **Production or TestFlight only?** -- Use Release filter in toolbar.
3. **What was the user doing?** -- Open Feedback Inspector for tester comments, network state, battery level, disk space.

### Terminations Without Crash Reports

When users report "app just closed" but no crash exists:

| Termination Category | Meaning |
|---------------------|---------|
| Launch timeout | App took too long to launch |
| Memory limit | Hit system memory ceiling |
| CPU limit (background) | Too much CPU while backgrounded |
| Background task timeout | Background task exceeded time limit |

Check: Organizer -> Terminations sidebar. Compare termination rates against previous versions.

---

## Related

For build settings reference, xcodebuild flags, SPM configuration, and xcconfig syntax, load `ax-build-ref`.
