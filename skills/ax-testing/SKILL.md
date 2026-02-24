---
name: ax-testing
description: Swift Testing (@Test, #expect), XCUITest automation, async testing, parameterized tests, UI recording (Xcode 26), test plans, CI patterns, migration from XCTest
license: MIT
---

# Testing

## Quick Patterns

### Swift Testing Basics
```swift
import Testing

@Test("User has correct name") func userName() {
    let user = User(name: "Alice")
    #expect(user.name == "Alice")
}

@Test func fetchUser() async throws {
    let user = try await api.fetch(id: 1)
    #expect(user.isActive)
}

// Unwrap or fail fast
let first = try #require(items.first)
#expect(first.isValid)

// Error testing
#expect(throws: ValidationError.invalidEmail) {
    try validate(email: "bad")
}
```

### Suites and Traits
```swift
@Suite("Video Tests")
struct VideoTests {
    let video = Video(named: "sample.mp4") // Fresh per test

    @Test func duration() { #expect(video.duration == 120) }

    @Test(.disabled("Backend not ready")) func upload() async { }
    @Test(.timeLimit(.minutes(1))) func transcode() async { }
    @Test(.bug("https://github.com/org/repo/issues/42")) func edgeCase() { }
}

extension Tag {
    @Tag static var networking: Self
    @Tag static var slow: Self
}

@Test(.tags(.networking, .slow)) func integrationTest() async { }
```

### Parameterized Tests
```swift
@Test(arguments: [IceCream.vanilla, .chocolate, .strawberry])
func flavorWithoutNuts(_ flavor: IceCream) {
    #expect(!flavor.containsNuts)
}

// Two collections = all combinations (cartesian product)
@Test(arguments: [1, 2, 3], ["a", "b", "c"])
func allCombinations(number: Int, letter: String) { }

// Paired values only
@Test(arguments: zip([1, 2, 3], ["one", "two", "three"]))
func paired(number: Int, name: String) { }
```

### Async Testing
```swift
// Callback -> confirmation (replaces XCTestExpectation)
@Test func notificationFires() async {
    await confirmation { confirm in
        NotificationCenter.default.addObserver(forName: .didUpdate, object: nil, queue: .main) { _ in
            confirm()
        }
        triggerUpdate()
    }
}

// Multiple events
await confirmation("eaten", expectedCount: 10) { confirm in
    jar.onEaten = { confirm() }
    await jar.eatAll()
}

// Verify never happens
await confirmation(expectedCount: 0) { confirm in
    cache.onEviction = { confirm() }
    cache.store("small")
}

// MainActor isolation
@Test @MainActor func viewModelUpdates() async {
    let vm = ViewModel()
    await vm.load()
    #expect(vm.items.count > 0)
}
```

### Deterministic Async (swift-concurrency-extras)
```swift
import ConcurrencyExtras

@Test func loadingState() async {
    await withMainSerialExecutor {
        let model = ViewModel()
        let task = Task { await model.loadData() }
        await Task.yield()
        #expect(model.isLoading == true) // Deterministic
        await task.value
        #expect(model.isLoading == false)
    }
}
```

### TestClock (swift-clocks)
```swift
import Clocks
let clock = TestClock()
let model = FeatureModel(clock: clock)
model.startTimer()
await clock.advance(by: .seconds(5))
#expect(model.count == 5)
```

### XCUITest Patterns
```swift
class LoginTests: XCTestCase {
    var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--uitesting", "--reset-state"]
        app.launch()
    }

    func testLogin() throws {
        let email = app.textFields["emailTextField"]
        XCTAssertTrue(email.waitForExistence(timeout: 5))
        email.tap()
        email.typeText("user@example.com")
        app.buttons["loginButton"].tap()
        XCTAssertTrue(app.staticTexts["welcomeLabel"].waitForExistence(timeout: 10))
    }
}
```

### Wait Helpers
```swift
// Wait for disappearance
func waitForDisappear(_ element: XCUIElement, timeout: TimeInterval = 10) -> Bool {
    let pred = NSPredicate(format: "exists == false")
    let exp = XCTNSPredicateExpectation(predicate: pred, object: element)
    return XCTWaiter.wait(for: [exp], timeout: timeout) == .completed
}

// Wait for enabled state
func waitForEnabled(_ element: XCUIElement, timeout: TimeInterval = 5) -> Bool {
    let pred = NSPredicate(format: "isEnabled == true")
    let exp = XCTNSPredicateExpectation(predicate: pred, object: element)
    return XCTWaiter.wait(for: [exp], timeout: timeout) == .completed
}
```

### Recording UI Automation (Xcode 26+)
1. Place cursor in test method
2. Debug > Record UI Automation (or gutter button)
3. Interact with app -- Xcode generates Swift code
4. Stop recording
5. **Enhance**: Replace labels with identifiers, add `waitForExistence`, add assertions

### CI Test Execution
```bash
# Run with test plan
xcodebuild test -scheme "MyApp" -testPlan "MyTestPlan" \
  -destination "platform=iOS Simulator,name=iPhone 16" \
  -resultBundlePath /tmp/results.xcresult

# Parallel + retry
xcodebuild test -scheme "MyApp" \
  -parallel-testing-enabled YES -maximum-parallel-test-targets 4 \
  -retry-tests-on-failure -test-iterations 3

# Code coverage
xcodebuild test -enableCodeCoverage YES ...
xcrun xcresulttool export coverage --path /tmp/results.xcresult --output-path /tmp/coverage
```

## Decision Tree

```
What are you testing?
+-- Pure logic (models, algorithms)?
|   +-- Can extract to Swift Package? --> swift test (~0.1s)
|   +-- Stay in app project? --> Framework target, Host App: None (~3s)
|
+-- Async code?
|   +-- Simple async function --> @Test func f() async throws { }
|   +-- Callback-based API --> confirmation { confirm in ... }
|   +-- Multiple events --> confirmation(expectedCount: N) { }
|   +-- Verify never fires --> confirmation(expectedCount: 0) { }
|   +-- Flaky timing --> withMainSerialExecutor { } (concurrency-extras)
|   +-- Time-dependent --> TestClock (swift-clocks)
|
+-- UI interactions?
|   +-- New test? --> Record UI Automation (Xcode 26+), then enhance
|   +-- Element not found? --> waitForExistence, not sleep()
|   +-- Cross-device? --> Test plans with multiple configurations
|   +-- Cross-language? --> accessibilityIdentifier (not labels)
|
+-- Performance metrics? --> XCTest (XCTMetric) -- not Swift Testing
+-- Obj-C tests? --> XCTest -- not Swift Testing
```

## Anti-Patterns

### sleep() in tests
```swift
// WRONG: Arbitrary delay, slow, flaky
sleep(2)
XCTAssertTrue(button.exists)
// FIX: waitForExistence(timeout:) or confirmation {}
```

### Shared mutable state between tests
```swift
// WRONG: Tests depend on execution order
static var cookie: Cookie?
@Test func bake() { Self.cookie = Cookie() }
@Test func eat() { #expect(Self.cookie != nil) } // Fails if runs first
// FIX: Each test creates its own state. Use @Suite struct (value semantics).
```

### Over-serializing
```swift
// WRONG: Defeats parallel execution
@Suite(.serialized) struct APITests { }
// FIX: Only serialize when tests truly share external mutable state (database, file)
```

### Mixing XCTest and Swift Testing assertions
```swift
// WRONG: XCTAssertEqual in @Test
@Test func bad() { XCTAssertEqual(1, 1) }
// FIX: Use #expect(1 == 1) in @Test functions
```

### Missing @MainActor
```swift
// WRONG: Data race with MainActor-isolated ViewModel
@Test func update() async { viewModel.updateTitle("New") }
// FIX: @Test @MainActor func update() async { }
```

### Raw recorded code in CI
```swift
// WRONG: Fragile labels, no waits
app.buttons["Login"].tap()
// FIX: Use identifiers, add waitForExistence, add assertions
```

### Hardcoded coordinates
```swift
// WRONG: Breaks on different devices
app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
// FIX: Use element queries with identifiers
```

## Deep Patterns

### Architecture for Fast Tests

**Speed hierarchy**:
| Config | Time | Use Case |
|---|---|---|
| `swift test` (Package) | ~0.1s | Pure logic, models |
| Host Application: None | ~3s | Framework code |
| Bypass app launch | ~6s | App target, skip init |
| Full app launch | 20-60s | UI tests |

Move testable logic into Swift Packages. Test with `swift test`.

**Bypass SwiftUI app launch**:
```swift
@main struct MainEntryPoint {
    static func main() {
        if NSClassFromString("XCTestCase") != nil {
            TestApp.main() // Empty app
        } else {
            ProductionApp.main()
        }
    }
}
```

### Known Issues
```swift
@Test func featureUnderDev() {
    withKnownIssue("Backend not ready") {
        try callUnfinishedAPI()
    }
}
// Better than .disabled: still compiles, notifies when fixed
```

### XCTestCase with Swift 6.2 MainActor Default
```swift
// Swift 6.2 default-actor-isolation = MainActor breaks XCTestCase
nonisolated final class MyTests: XCTestCase {
    @MainActor override func setUp() async throws { try await super.setUp() }
    @Test @MainActor func testSomething() async { }
}
// Better: Migrate to @Suite struct
```

### Xcode Optimization
- Test Plan > Parallelization: "Swift Testing Only" (disable XCTest parallel)
- Scheme > Test > Info: Uncheck Debugger (saves ~1s per run)
- Build Settings > Debug Info Format: DWARF (not dSYM) for Debug
- Run Script phases: Always specify Input/Output files

### Test Plans for Multi-Config
```json
{
  "configurations": [
    { "name": "English", "options": { "language": "en", "region": "US" } },
    { "name": "Arabic (RTL)", "options": { "language": "ar", "region": "SA" } },
    { "name": "Dark Mode", "options": { "userInterfaceStyle": "dark" } }
  ]
}
```
Configure video/screenshot capture: "Only failures" (default) or "Keep all".

### UI Test Debugging
```swift
// Print element tree
print(app.debugDescription)

// Screenshot on failure
override func tearDownWithError() throws {
    if testRun?.failureCount ?? 0 > 0 {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

// Handle system alerts
addUIInterruptionMonitor(withDescription: "Permission") { alert in
    alert.buttons["Allow"].tap()
    return true
}
app.tap()
```

### Launch Arguments for Mock Data
```swift
app.launchArguments = ["-UI-Testing", "-UseMockData"]
app.launchEnvironment = ["API_URL": "https://mock.api.com"]
```
In app: `ProcessInfo.processInfo.arguments.contains("-UI-Testing")`

### Network Conditioning for UI Tests
Use Network Link Conditioner to simulate 3G/LTE. Increase timeouts for slow networks (30s instead of 5s). Test on largest device + slowest network for worst-case crashes.

### Accessibility Audits
```swift
func testAccessibility() throws {
    let app = XCUIApplication()
    app.launch()
    try app.performAccessibilityAudit()
}
```

## Diagnostics

### Flaky Test Checklist
- [ ] Replace all `sleep()` with `waitForExistence` or `confirmation`
- [ ] Each test creates its own state (no shared mutables)
- [ ] Using accessibilityIdentifier (not localized labels)
- [ ] Timeouts appropriate: 2-3s UI, 10s network, 30s max
- [ ] Run 10x locally to catch intermittent failures

### Migration: XCTest to Swift Testing
| XCTest | Swift Testing |
|---|---|
| `func testFoo()` | `@Test func foo()` |
| `XCTAssertEqual(a, b)` | `#expect(a == b)` |
| `XCTAssertNil(x)` | `#expect(x == nil)` |
| `XCTAssertThrowsError` | `#expect(throws:)` |
| `XCTUnwrap(x)` | `try #require(x)` |
| `class: XCTestCase` | `@Suite struct` |
| `setUp/tearDown` | `init/deinit` |
| `XCTestExpectation` | `confirmation {}` |

Both frameworks coexist. Migrate incrementally. Keep XCTest for UI tests, performance metrics, Obj-C.

## Related

- `ax-concurrency` -- @MainActor patterns, Task cancellation for test setup
- `ax-swiftui` -- View testing, preview-driven development
- `ax-build` -- CI/CD pipeline configuration, xcodebuild flags
- pointfreeco/swift-concurrency-extras, pointfreeco/swift-clocks
- WWDC 2024-10179, 2025-344
