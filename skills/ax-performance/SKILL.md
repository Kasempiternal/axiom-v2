---
name: ax-performance
description: Use when app feels slow, memory grows, hangs occur, frame rate issues, or profiling needed - covers Instruments workflows, memory debugging, hang diagnostics, display performance, MetricKit, xctrace CLI, and ObjC block retain cycles
license: MIT
---

# Performance

## Quick Patterns

### Time Profiler: Find CPU Hotspots

```swift
// 1. Launch Instruments > Time Profiler template
// 2. Attach to running app on device (not simulator)
// 3. Record during slow operation for 10-30 seconds
// 4. Stop, examine call tree

// KEY: Check Self Time, not Total Time
// Self Time 80%? Function is doing expensive work
// Self Time 5%, Total Time 80%? Function calls slow code - drill deeper
```

### Memory Leak Detection (5 min)

```swift
// 1. Add deinit logging to suspect classes
class MyViewController: UIViewController {
    deinit { print("MyViewController deallocated") }
}

// 2. Navigate to view, navigate away
// See "deallocated"? No leak. Missing? Retained somewhere.

// 3. Debug > Memory Graph Debugger
// Look for purple/red circles with warning badge
// Click to see retain cycle chain
```

### Fix Timer Leak (Most Common - 50% of leaks)

```swift
// BAD: Timer never invalidated - RunLoop retains it
progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    self?.updateProgress()
}

// GOOD: Combine auto-cleans when released
cancellable = Timer.publish(every: 1.0, tolerance: 0.1, on: .main, in: .default)
    .autoconnect()
    .sink { [weak self] _ in self?.updateProgress() }
```

### Fix Hang: Move Work Off Main Thread

```swift
// BAD: Blocks main thread
func loadUserData() {
    let data = try! Data(contentsOf: largeFileURL)  // BLOCKS
    processData(data)
}

// GOOD: Async
func loadUserData() {
    Task.detached {
        let data = try Data(contentsOf: largeFileURL)
        await MainActor.run { self.processData(data) }
    }
}
```

### Enable ProMotion 120Hz (iPhone)

```xml
<!-- Info.plist - REQUIRED for >60Hz on iPhone -->
<key>CADisableMinimumFrameDurationOnPhone</key>
<true/>
```

```swift
// MTKView defaults to 60fps - set explicitly
let mtkView = MTKView(frame: frame, device: device)
mtkView.preferredFramesPerSecond = 120
mtkView.isPaused = false
mtkView.enableSetNeedsDisplay = false
```

### OSSignposter: Custom Instrumentation

```swift
import os

let signposter = OSSignposter(subsystem: "com.app", category: "DataLoad")

func loadData() async throws -> [Item] {
    let signpostID = signposter.makeSignpostID()
    let state = signposter.beginInterval("Load Items", id: signpostID)
    defer { signposter.endInterval("Load Items", state) }
    return try await fetchItems()
}
```

### XCTest Performance Regression Tests

```swift
func testDataLoadPerformance() throws {
    let options = XCTMeasureOptions()
    options.iterationCount = 10

    measure(metrics: [
        XCTClockMetric(),        // Wall clock time
        XCTCPUMetric(),          // CPU time and cycles
        XCTMemoryMetric(),       // Peak physical memory
    ], options: options) {
        loadData()
    }
    // Set baseline in Xcode after first run
    // Tests fail when regression exceeds tolerance (default 10%)
}
```

### MetricKit: Production Monitoring

```swift
import MetricKit

class AppMetricsSubscriber: NSObject, MXMetricManagerSubscriber {
    override init() {
        super.init()
        MXMetricManager.shared.add(self)
    }

    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            if let memory = payload.memoryMetrics {
                let peakMB = memory.peakMemoryUsage.converted(to: .megabytes).value
                // Alert if exceeds threshold
            }
        }
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads {
            if let hangs = payload.hangDiagnostics {
                for hang in hangs {
                    // hang.hangDuration, hang.callStackTree
                }
            }
        }
    }
}
```

### xctrace: Headless Profiling

```bash
# Record CPU profile
xcrun xctrace record --instrument 'CPU Profiler' --attach 'MyApp' --time-limit 10s --output cpu.trace

# Export to XML
xcrun xctrace export --input cpu.trace --toc
xcrun xctrace export --input cpu.trace --xpath '/trace-toc/run[@number="1"]/data/table[@schema="cpu-profile"]'

# List instruments
xcrun xctrace list instruments
```

---

## Decision Tree

### What's the Symptom?

```
Performance problem?
|-- App feels slow or lags (UI stalls, scrolling stutters)
|   |-- UI completely frozen >1 second?
|   |   +-- YES: HANG - see Hang Diagnosis below
|   |   +-- NO: Use Time Profiler (measure CPU)
|   +-- Low CPU but still slow?
|       +-- Use System Trace (thread blocking, scheduling)
|
|-- Memory grows over time
|   |-- Progressive growth (50MB > 100MB > 200MB)?
|   |   +-- LEAK - see Memory Debugging below
|   +-- Grows then plateaus?
|       +-- Normal caching. Test with memory warning simulation
|
|-- Frame rate issues
|   |-- Stuck at 60fps on ProMotion?
|   |   +-- See Display Performance below
|   |-- Animation stutters (hitches)?
|   |   +-- See Hitch Diagnosis below
|   +-- Inconsistent frame timing?
|       +-- See Frame Pacing below
|
|-- Data loading slow
|   |-- Using Core Data?
|   |   +-- Enable SQL debugging, check for N+1 queries
|   +-- Computation?
|       +-- Time Profiler
|
+-- Want production metrics?
    +-- MetricKit (daily aggregated data)
    +-- Xcode Organizer (pre-symbolicated views)
```

### Which Instruments Tool?

| Symptom | Primary Tool | Why |
|---------|-------------|-----|
| UI lag, slow scrolling | Time Profiler | CPU time per function |
| Memory growth | Allocations | Object creation tracking |
| Confirmed leak | Memory Graph Debugger + Leaks | Retain cycle detection |
| App freezes >1s | Time Profiler or System Trace | Main thread analysis |
| Battery drain | Energy Impact / Power Profiler | Power consumption by subsystem |
| Core Data slow | Core Data instrument | Query analysis, N+1 detection |
| Frame rate wrong | Metal Performance HUD | GPU frame time |
| Thread blocking | System Trace | Thread state, lock contention |
| Production issues | MetricKit | Field diagnostics |

### Hang Diagnosis

```
START: App hangs reported
|
|-- Have diagnostics from Organizer or MetricKit?
|   |-- YES: Examine stack trace
|   |   |-- Stack shows your code running
|   |   |   +-- BUSY: Main thread doing work. Profile with Time Profiler
|   |   +-- Stack shows waiting (semaphore, lock, dispatch_sync)
|   |       +-- BLOCKED: Main thread waiting. Profile with System Trace
|   +-- NO: Can you reproduce?
|       |-- YES: Profile with Time Profiler first
|       |   |-- High CPU on main thread -> BUSY: Optimize the work
|       |   +-- Low CPU, thread blocked -> Use System Trace
|       +-- NO: Enable MetricKit, check Organizer > Hangs
```

### Memory Leak Diagnosis

```
Memory growing?
|-- Profile with Memory template, repeat action 10 times
|   |-- Flat: Not a leak (stop)
|   +-- Steady climb: Leak confirmed
|       |-- Memory Graph Debugger: purple/red circles
|       |-- Click to read retain cycle chain
|       |-- Common locations:
|       |   |-- Timers (50%): Timer not invalidated
|       |   |-- Notifications/KVO (25%): No removeObserver
|       |   |-- Closures in collections (15%): Missing [weak self]
|       |   +-- Delegate cycles (10%): Strong delegate reference
|       +-- Fix and verify: Add deinit logging, re-run Instruments
```

---

## Anti-Patterns

### Profiling

**Blaming the wrong function**. A function with high Total Time might call slow code. Check Self Time to find the actual bottleneck.

**Profiling in Simulator**. Simulator CPU differs from real device. Always profile on actual device.

**Profiling too short**. Short recordings capture transient spikes. Profile 2-3 minutes to see memory stabilize.

**Baseline-less performance tests**. `measure { doWork() }` always passes without a baseline set in Xcode.

```swift
// BAD: Test always passes
func testPerformance() { measure { doWork() } }

// GOOD: Set baseline in Xcode after first run
// Tests fail when performance regresses beyond tolerance
```

### Memory

**Confusing growth with leak**. Growing memory is not always a leak. Check: does memory drop under memory pressure? If yes, it's caching (normal).

**[weak self] without invalidate()**. Timer keeps running and consuming CPU. Always call `invalidate()` then set to nil.

```swift
// BAD: [weak self] alone doesn't fix timer leaks
progressTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    self?.updateProgress()
}
// RunLoop still retains the Timer object!

// GOOD: Explicitly invalidate
deinit {
    progressTimer?.invalidate()
    progressTimer = nil
}
```

**Local AnyCancellable**. Goes out of scope immediately, subscription dies. Store in `Set<AnyCancellable>` property.

### Hangs

**Adding a loading spinner to "fix" a hang**. A spinner won't animate during a hang because the main thread is blocked. Move work off main thread.

**DispatchQueue.main.sync from background**. Can deadlock, always blocks.

```swift
// BAD: Deadlock risk
DispatchQueue.main.sync { updateUI() }

// GOOD: Async
DispatchQueue.main.async { self.updateUI() }
```

**Semaphore to convert async to sync**. Blocks calling thread.

```swift
// BAD: Blocks main thread
let semaphore = DispatchSemaphore(value: 0)
URLSession.shared.dataTask(with: url) { data, _, _ in
    result = data
    semaphore.signal()
}.resume()
semaphore.wait()  // BLOCKS

// GOOD: Stay async
let (data, _) = try await URLSession.shared.data(from: url)
```

### Display

**Assuming ProMotion works automatically**. Must add `CADisableMinimumFrameDurationOnPhone` to Info.plist AND set `preferredFramesPerSecond = 120` on MTKView.

**Timer-based render loop**. Timers drift and waste frame time. Use CADisplayLink with `preferredFrameRateRange`.

**Presenting frames immediately**. Causes micro-stuttering. Use `present(afterMinimumDuration:)` for consistent pacing.

### ObjC Block Retain Cycles

**Using __unsafe_unretained as workaround**. Crashes when object is deallocated. Always use weak-strong pattern.

**Guarding outer block only in nested blocks**. Inner block still captures strongSelf strongly.

```objc
// BAD: Inner block captures strongSelf
__weak typeof(self) weakSelf = self;
[self.manager fetchData:^(NSArray *result) {
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
        [strongSelf.analytics trackEvent:@"Fetched" completion:^{
            strongSelf.cachedData = result;  // Still strong reference!
        }];
    }
}];

// GOOD: Guard every nested block
__weak typeof(self) weakSelf = self;
[self.manager fetchData:^(NSArray *result) {
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
        __weak typeof(strongSelf) weakSelf2 = strongSelf;
        [strongSelf.analytics trackEvent:@"Fetched" completion:^{
            typeof(strongSelf) strongSelf2 = weakSelf2;
            if (strongSelf2) {
                strongSelf2.cachedData = result;
            }
        }];
    }
}];
```

---

## Deep Patterns

### Time Profiler Workflow

#### Step 1: Launch and Record

```bash
open -a Instruments  # Select "Time Profiler" template
```

1. Start app on device
2. Select app from target dropdown
3. Click Record
4. Interact with the slow part (scroll, tap, load data)
5. Stop recording after 10-30 seconds

#### Step 2: Read the Timeline

- **Tall spikes**: Brief CPU-intensive operations
- **Sustained high usage**: Continuous expensive work
- **Main thread blocking**: UI thread doing work (causes lag)

#### Step 3: Drill Down

Click "Heaviest Stack Trace" to find hot functions:

```
MyViewController.viewDidLoad() - 1500ms
  |-- loadJSON() - 1200ms (Self Time: 50ms)
  |   +-- loadImages() - 1150ms (Self Time: 1150ms)  <-- CULPRIT
  |-- parseData() - 200ms
  +-- layoutUI() - 100ms
```

loadJSON() isn't slow (50ms Self Time). loadImages() IS slow (1150ms Self Time). Fix the right thing.

#### Step 4: Interpret Results

- Self Time 80%? Function is doing expensive work -> optimize it
- Self Time 5%, Total Time 80%? Function calls slow code -> drill into callees
- High CPU sustained? Optimization needed
- CPU spikes? Caching might help
- 500ms on main thread? UI stall, user sees it. Move off main.
- 500ms background? User won't notice.

### Allocations Workflow

#### Step 1: Record and Analyze

1. Launch Instruments > Allocations template
2. Record while performing memory-intensive actions
3. Watch the memory chart:
   - Sharp climb = memory allocated
   - Flat line = stable (good)
   - No decline after stopping = possible leak

#### Step 2: Find Persistent Objects

Under Statistics, sort by "Persistent":

```
UIImage: 500 instances (300MB) -- Should be <50
NSString: 50000 instances -- Should be <1000
CustomDataModel: 10000 instances -- Should be <100
```

#### Step 3: Distinguish Leak from Cache

- Simulate memory warning: Xcode > Debug > Simulate Memory Warning
- Memory drops 50%+? It's caching (normal)
- Memory stays high? Investigate persistent objects

### Core Data Performance

#### Enable SQL Debugging

```
Edit Scheme > Run > Arguments Passed On Launch
Add: -com.apple.CoreData.SQLDebug 1
```

#### Fix N+1 Query Problem

```swift
// BAD: 1 + N queries (N = number of tracks)
let tracks = try context.fetch(Track.fetchRequest())
for track in tracks {
    print(track.album.title)  // Fires individual query for each
}

// GOOD: 1 query with prefetching
let request = Track.fetchRequest()
request.returnsObjectsAsFaults = false
request.relationshipKeyPathsForPrefetching = ["album"]
let tracks = try context.fetch(request)
for track in tracks {
    print(track.album.title)  // Already loaded
}
```

#### Use Batch Size for Large Datasets

```swift
let request = Track.fetchRequest()
request.fetchBatchSize = 500  // Fetch 500 at a time, not all 50000
```

### Memory Leak Patterns

#### Pattern 1: Timer Leaks (50% of leaks)

RunLoop retains scheduled timers. `[weak self]` prevents closure retention but Timer object persists. Must call `invalidate()`.

**Best fix**: Combine Timer (auto-cleanup)

```swift
cancellable = Timer.publish(every: 1.0, tolerance: 0.1, on: .main, in: .default)
    .autoconnect()
    .sink { [weak self] _ in self?.updateProgress() }
```

**Alternative**: Invalidate in teardown AND deinit: `timer?.invalidate(); timer = nil`

#### Pattern 2: Observer Leaks (25% of leaks)

```swift
// BAD: No removeObserver
NotificationCenter.default.addObserver(self, selector: #selector(handle),
    name: AVAudioSession.routeChangeNotification, object: nil)

// GOOD: Combine publisher (auto-cleanup)
NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification)
    .sink { [weak self] _ in self?.handleChange() }
    .store(in: &cancellables)
```

#### Pattern 3: Closure Capture Leaks (15% of leaks)

```swift
// BAD: Strong capture in collection
updateCallbacks.append { [self] track in
    self.refreshUI(with: track)
}

// GOOD: Weak capture
updateCallbacks.append { [weak self] track in
    self?.refreshUI(with: track)
}
```

#### Pattern 4: PhotoKit Image Request Leaks

```swift
class PhotoCell: UICollectionViewCell {
    private var imageRequestID: PHImageRequestID = PHInvalidImageRequestID

    func configure(with asset: PHAsset, imageManager: PHImageManager) {
        if imageRequestID != PHInvalidImageRequestID {
            imageManager.cancelImageRequest(imageRequestID)
        }
        imageRequestID = imageManager.requestImage(for: asset, targetSize: PHImageManagerMaximumSize,
            contentMode: .aspectFill, options: nil) { [weak self] image, _ in
            self?.imageView.image = image
        }
    }

    override func prepareForReuse() {
        super.prepareForReuse()
        if imageRequestID != PHInvalidImageRequestID {
            PHImageManager.default().cancelImageRequest(imageRequestID)
            imageRequestID = PHInvalidImageRequestID
        }
        imageView.image = nil
    }
}
```

Similar patterns: `AVAssetImageGenerator` -> `cancelAllCGImageGeneration()`, `URLSession.dataTask()` -> `cancel()`.

### Hang Patterns

#### Common Causes and Fixes

| Pattern | Cause | Fix |
|---------|-------|-----|
| Sync file I/O | `Data(contentsOf:)` on main | Move to background with `Task.detached` |
| Unfiltered observer | Processing all contexts | Filter by `object: relevantContext` |
| Expensive formatter | Creating DateFormatter in loops | Cache as `static let` |
| dispatch_sync to main | Deadlock risk | Use `.async` |
| Semaphore blocking | Converting async to sync | Use async/await |
| Lock contention | NSLock shared with background | Use actor |
| App launch overload | Too much work in didFinishLaunching | Defer non-essential to didBecomeActive |
| Image processing | Filtering on main thread | Task.detached(priority: .userInitiated) |

#### Watchdog Terminations

| Transition | Time Limit |
|------------|-----------|
| App launch | ~20 seconds |
| Background transition | ~5 seconds |
| Foreground transition | ~10 seconds |

Watchdog disabled in Simulator and when debugger attached. Watchdog kills logged as `EXC_CRASH (SIGKILL)` with termination reason `Namespace RUNNINGBOARD, Code 0xDEAD10CC`.

#### Hang Prevention Checklist

- No `Data(contentsOf:)` or file reads on main thread
- No `DispatchQueue.main.sync` from background threads
- No `semaphore.wait()` on main thread
- Formatters (DateFormatter, NumberFormatter) are cached
- Notification observers filter appropriately
- Launch work minimized (defer non-essential)
- Image processing happens off main thread
- Database queries don't run on main thread

### Display Performance

#### ProMotion Diagnostic Order

When stuck at 60fps on ProMotion, check in order:

1. **Info.plist key missing?** (iPhone only) - Add `CADisableMinimumFrameDurationOnPhone`
2. **Render loop configured for 60?** - MTKView defaults to 60fps, set explicitly
3. **System caps enabled?** - Low Power Mode, Limit Frame Rate accessibility, Thermal
4. **Frame time > 8.33ms?** - Can't sustain 120fps
5. **Frame pacing issues?** - Use `present(afterMinimumDuration:)`

#### CADisplayLink Configuration (iOS 15+)

```swift
let displayLink = CADisplayLink(target: self, selector: #selector(render))
displayLink.preferredFrameRateRange = CAFrameRateRange(
    minimum: 80,
    maximum: 120,
    preferred: 120
)
displayLink.add(to: .main, forMode: .common)
```

#### CAMetalDisplayLink (iOS 17+)

For Metal apps needing precise timing:

```swift
class MetalRenderer: NSObject, CAMetalDisplayLinkDelegate {
    var displayLink: CAMetalDisplayLink?

    func setupDisplayLink() {
        displayLink = CAMetalDisplayLink(metalLayer: metalLayer)
        displayLink?.delegate = self
        displayLink?.preferredFrameRateRange = CAFrameRateRange(
            minimum: 60, maximum: 120, preferred: 120
        )
        displayLink?.preferredFrameLatency = 2
        displayLink?.add(to: .main, forMode: .common)
    }

    func metalDisplayLink(_ link: CAMetalDisplayLink, needsUpdate update: CAMetalDisplayLink.Update) {
        guard let drawable = update.drawable else { return }
        let workingTime = update.targetTimestamp - CACurrentMediaTime()
        renderFrame(to: drawable)
    }
}
```

#### System Caps That Force 60fps

| Cap | Detection | Notes |
|-----|-----------|-------|
| Low Power Mode | `ProcessInfo.processInfo.isLowPowerModeEnabled` | Observe `.NSProcessInfoPowerStateDidChange` |
| Thermal throttling | `ProcessInfo.processInfo.thermalState` (.serious/.critical) | Observe `thermalStateDidChangeNotification` |
| Limit Frame Rate | Settings > Accessibility > Motion | No API to detect |
| Adaptive Power (iOS 26+) | Settings > Battery > Power Mode | No public API |

#### Frame Time Budgets

| Target FPS | Frame Budget |
|------------|-------------|
| 120 | 8.33ms |
| 90 | 11.11ms |
| 60 | 16.67ms |
| 30 | 33.33ms |

If consistently exceeding budget, system drops to next sustainable rate.

#### Frame Pacing

Inconsistent frame timing causes visible jitter even with good average FPS:

```swift
// BAD: Inconsistent intervals
// Frame 1: 25ms, Frame 2: 40ms, Frame 3: 25ms (stutters)

// GOOD: Consistent pacing
func draw(in view: MTKView) {
    guard let commandBuffer = commandQueue.makeCommandBuffer(),
          let drawable = view.currentDrawable else { return }
    renderScene(to: drawable)
    commandBuffer.present(drawable, afterMinimumDuration: 1.0 / 60.0)
    commandBuffer.commit()
}
```

Verify actual presentation:

```swift
drawable.addPresentedHandler { drawable in
    if drawable.presentedTime == 0.0 {
        // Frame was dropped
    }
}
```

#### Hitch Mechanics

**Commit Hitch**: App process misses commit deadline (main thread work too long). Fix: move work off main thread, reduce view complexity.

**Render Hitch**: Render server misses presentation deadline (GPU work too complex). Fix: simplify visual effects, reduce overdraw.

System automatically switches from double to triple buffering to recover from render hitches.

### Measuring GPU Frame Time

```swift
func draw(in view: MTKView) {
    guard let commandBuffer = commandQueue.makeCommandBuffer() else { return }
    // Render...
    commandBuffer.addCompletedHandler { buffer in
        let gpuMs = (buffer.gpuEndTime - buffer.gpuStartTime) * 1000
        if gpuMs > 8.33 {
            print("GPU: \(String(format: "%.2f", gpuMs))ms exceeds 120Hz budget")
        }
    }
    commandBuffer.commit()
}
```

#### Measurement

```swift
// UIScreen.main.maximumFramesPerSecond reports CAPABILITY, not actual rate
// Measure from CADisplayLink timing instead
@objc func displayLinkCallback(_ link: CADisplayLink) {
    if lastTimestamp > 0 {
        let interval = link.timestamp - lastTimestamp
        let actualFPS = 1.0 / interval
    }
    lastTimestamp = link.timestamp
}
```

Metal Performance HUD: Edit Scheme > Run > Diagnostics > Show Graphics Overview, or `MTL_HUD_ENABLED=1`, or Settings > Developer > Graphics HUD.

### Adaptive Frame Rate Pattern

```swift
class AdaptiveRenderer: NSObject, MTKViewDelegate {
    private var recentFrameTimes: [Double] = []
    private let sampleCount = 30
    private var targetFrameDuration: CFTimeInterval = 1.0 / 60.0

    func draw(in view: MTKView) {
        guard let commandBuffer = commandQueue.makeCommandBuffer(),
              let drawable = view.currentDrawable else { return }

        let startTime = CACurrentMediaTime()
        renderScene(to: drawable)
        let frameTime = (CACurrentMediaTime() - startTime) * 1000

        updateTargetRate(frameTime: frameTime, view: view)
        commandBuffer.present(drawable, afterMinimumDuration: targetFrameDuration)
        commandBuffer.commit()
    }

    private func updateTargetRate(frameTime: Double, view: MTKView) {
        recentFrameTimes.append(frameTime)
        if recentFrameTimes.count > sampleCount { recentFrameTimes.removeFirst() }

        let avgFrameTime = recentFrameTimes.reduce(0, +) / Double(recentFrameTimes.count)
        let thermal = ProcessInfo.processInfo.thermalState
        let lowPower = ProcessInfo.processInfo.isLowPowerModeEnabled

        if lowPower || thermal >= .serious {
            view.preferredFramesPerSecond = 30
            targetFrameDuration = 1.0 / 30.0
        } else if avgFrameTime < 7.0 && thermal == .nominal {
            view.preferredFramesPerSecond = 120
            targetFrameDuration = 1.0 / 120.0
        } else if avgFrameTime < 14.0 {
            view.preferredFramesPerSecond = 60
            targetFrameDuration = 1.0 / 60.0
        } else {
            view.preferredFramesPerSecond = 30
            targetFrameDuration = 1.0 / 30.0
        }
    }
}
```

### ObjC Block Retain Cycle Patterns

#### Pattern 1: Weak-Strong Basics

Any block that captures `self` must use weak-strong if block is retained by self (directly or transitively).

```objc
// CORRECT
__weak typeof(self) weakSelf = self;
[self.networkManager GET:@"url" success:^(id response) {
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
        strongSelf.data = response;
        [strongSelf updateUI];
    }
} failure:^(NSError *error) {
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
        [strongSelf handleError:error];
    }
}];
```

Rules:
- Declare weakSelf OUTSIDE the block
- Use `typeof(self)` for type safety
- ALWAYS check `if (strongSelf)` before use
- Never mix direct `self` and `strongSelf` in same block

#### Pattern 2: Hidden self in Macros

NSAssert, NSLog, and string formatting secretly capture self:

```objc
// BAD: NSAssert captures self
[self.button setTapAction:^{
    NSAssert(self.isValidState, @"State must be valid");  // self captured!
}];

// GOOD: Use strongSelf in macros too
__weak typeof(self) weakSelf = self;
[self.button setTapAction:^{
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
        NSAssert(strongSelf.isValidState, @"State must be valid");
        [strongSelf doWork];
    }
}];
```

#### Pattern 3: Nested Blocks

Each nesting level needs its own weak-strong pair:

```objc
__weak typeof(self) weakSelf = self;
[self.manager fetchData:^(NSArray *result) {
    typeof(self) strongSelf = weakSelf;
    if (strongSelf) {
        __weak typeof(strongSelf) weakSelf2 = strongSelf;
        dispatch_async(dispatch_get_main_queue(), ^{
            typeof(strongSelf) strongSelf2 = weakSelf2;
            if (strongSelf2) {
                strongSelf2.data = result;
                [strongSelf2 updateUI];
            }
        });
    }
}];
```

#### Pattern 4: Guard Condition

```objc
// BAD: Missing guard
typeof(self) strongSelf = weakSelf;
strongSelf.data = value;  // CRASH if nil!

// BAD: Wrong variable in guard
if (weakSelf) {
    [weakSelf doWork];  // Might become nil again
}

// GOOD: Proper guard
typeof(self) strongSelf = weakSelf;
if (strongSelf) {
    strongSelf.data = value;
    [strongSelf doWork];
}
```

### Jetsam (Memory Pressure Termination)

Jetsam is iOS terminating background apps to free memory. Not a crash (no crash log), but frequent kills hurt UX.

#### Reducing Jetsam Rate

Clear caches on backgrounding:

```swift
.onChange(of: scenePhase) { _, newPhase in
    if newPhase == .background {
        imageCache.clearAll()
        URLCache.shared.removeAllCachedResponses()
    }
}
```

Target: background memory <50MB.

#### State Restoration

Users shouldn't notice jetsam. Use `@SceneStorage` (SwiftUI) or `stateRestorationActivity` (UIKit) to restore navigation, drafts, scroll position.

### Regression-Proofing Pipeline

| Stage | Tool | When | Catches |
|-------|------|------|---------|
| Dev | OSSignposter | Writing code | Specific operation timing |
| CI | XCTest performance tests | Every PR | Regression vs baseline |
| Production | MetricKit | After release | Real-world degradation |

#### Bridging Signposts to Tests

```swift
// Production code
let signposter = OSSignposter(subsystem: "com.app", category: "Sync")

func syncData() {
    let id = signposter.makeSignpostID()
    let state = signposter.beginInterval("Full Sync", id: id)
    defer { signposter.endInterval("Full Sync", state) }
    // sync logic
}

// Test
func testSyncPerformance() {
    let metric = XCTOSSignpostMetric(
        subsystem: "com.app", category: "Sync", name: "Full Sync"
    )
    measure(metrics: [metric]) { syncData() }
}
```

#### XCTMetric Types

- **XCTClockMetric**: Wall clock duration
- **XCTCPUMetric**: CPU time, instructions retired, cycles
- **XCTMemoryMetric**: Peak physical memory during test
- **XCTStorageMetric**: Logical writes to storage
- **XCTOSSignpostMetric**: Duration of signposted intervals
- **XCTApplicationLaunchMetric**: App launch time (cold/warm/optimized)
- **XCTHitchMetric**: Hitch time ratio (scrolling and animation)

---

## Diagnostics

### MetricKit Reference

#### Setup

```swift
import MetricKit

class AppMetricsSubscriber: NSObject, MXMetricManagerSubscriber {
    override init() {
        super.init()
        MXMetricManager.shared.add(self)
    }
    deinit { MXMetricManager.shared.remove(self) }

    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads { processMetrics(payload) }
    }

    func didReceive(_ payloads: [MXDiagnosticPayload]) {
        for payload in payloads { processDiagnostics(payload) }
    }
}
```

Register early: in `application(_:didFinishLaunchingWithOptions:)` or App init. Test with Xcode > Debug > Simulate MetricKit Payloads (iOS 15+).

#### Gotchas

1. 24-hour delay (not real-time)
2. Call stacks require symbolication (keep dSYMs)
3. Opt-in only (users must enable "Share with App Developers")
4. Aggregated, not per-user
5. Physical devices only (not simulator)

#### MXMetricPayload Categories

**CPU Metrics** (`MXCPUMetric`):
- `cumulativeCPUTime`: Total CPU time
- `cumulativeCPUInstructions` (iOS 14+): Instruction count

**Memory Metrics** (`MXMemoryMetric`):
- `peakMemoryUsage`: Peak memory
- `averageSuspendedMemory`: Average when suspended

**Launch Metrics** (`MXAppLaunchMetric`):
- `histogrammedTimeToFirstDraw`: Cold launch histogram
- `histogrammedApplicationResumeTime`: Resume histogram
- `histogrammedOptimizedTimeToFirstDraw` (iOS 15.2+)

**Exit Metrics** (`MXAppExitMetric`, iOS 14+):

| Exit Type | Meaning | Action |
|-----------|---------|--------|
| `normalAppExitCount` | Clean exit | None |
| `memoryResourceLimitExitCount` | Too much memory | Reduce footprint |
| `memoryPressureExitCount` | Jetsam | Reduce bg memory <50MB |
| `badAccessExitCount` | SIGSEGV | Check null pointers |
| `appWatchdogExitCount` | Hung during transition | Reduce launch/bg work |
| `backgroundTaskAssertionTimeoutExitCount` | Didn't end bg task | Call endBackgroundTask |
| `cpuResourceLimitExitCount` | Too much bg CPU | Move to BGProcessingTask |
| `suspendedWithLockedFileExitCount` | Held file lock | Release before suspend |

**Animation Metrics** (`MXAnimationMetric`, iOS 14+):
- `scrollHitchTimeRatio`: Time hitching while scrolling
- `hitchTimeRatio` (iOS 17+): All animation hitches

**Disk I/O** (`MXDiskIOMetric`):
- `cumulativeLogicalWrites`

**Network** (`MXNetworkTransferMetric`):
- `cumulativeCellularUpload/Download`, `cumulativeWifiUpload/Download`

**Signpost Metrics** (`MXSignpostMetric`):

```swift
let log = MXMetricManager.makeLogHandle(category: "ImageProcessing")
mxSignpost(.begin, log: log, name: "ProcessImage")
// ... work ...
mxSignpost(.end, log: log, name: "ProcessImage")
```

#### MXDiagnosticPayload (iOS 14+)

**MXCrashDiagnostic**: `callStackTree`, `signal`, `exceptionType`, `exceptionCode`, `terminationReason`

**MXHangDiagnostic**: `hangDuration`, `callStackTree`

**MXDiskWriteExceptionDiagnostic**: `totalWritesCaused`, `callStackTree`

**MXCPUExceptionDiagnostic**: `totalCPUTime`, `totalSampledTime`, `callStackTree`

#### MXCallStackTree Symbolication

```swift
func parseCallStackTree(_ tree: MXCallStackTree) {
    let jsonData = tree.jsonRepresentation()
    guard let json = try? JSONSerialization.jsonObject(with: jsonData) as? [String: Any],
          let callStacks = json["callStacks"] as? [[String: Any]] else { return }

    for callStack in callStacks {
        guard let threadAttributed = callStack["threadAttributed"] as? Bool,
              threadAttributed,
              let frames = callStack["callStackRootFrames"] as? [[String: Any]] else { continue }
        // threadAttributed = true means this thread caused the issue
        // Frames contain: binaryUUID, offsetIntoBinaryTextSegment, binaryName, address, sampleCount, subFrames
    }
}
```

Symbolicate with atos:

```bash
mdfind "com_apple_xcode_dsym_uuids == A1B2C3D4-E5F6-7890-ABCD-EF1234567890"
atos -arch arm64 -o MyApp.app.dSYM/Contents/Resources/DWARF/MyApp -l 0x100000000 0x105234567
```

#### Integration Patterns

Upload payloads as JSON:

```swift
let jsonData = payload.jsonRepresentation()
// POST to analytics endpoint
```

Alert on regressions:

```swift
if let launches = payload.applicationLaunchMetrics {
    let p50 = calculateP50(launches.histogrammedTimeToFirstDraw)
    if p50 > 2.0 { sendAlert("Launch time regression: \(p50)s") }
}
```

MetricKit vs Xcode Organizer: Organizer for quick overview (pre-symbolicated, no code needed). MetricKit for custom analytics, alerting, raw data access.

### xctrace CLI Reference

#### Recording

```bash
# Using instrument (recommended for Xcode 26+)
xcrun xctrace record --instrument 'CPU Profiler' --attach 'AppName' --time-limit 10s --output trace.trace

# Using template (may fail on export in Xcode 26+)
xcrun xctrace record --template 'Time Profiler' --attach 'AppName' --time-limit 10s --output trace.trace
```

Target selection:

```bash
--attach 'MyApp'          # By name
--attach 12345            # By PID
--all-processes           # Profile all
--launch -- /path/to/app  # Launch and profile
--device 'iPhone 17 Pro'  # Specific device
```

Recording options:

| Flag | Description |
|------|-------------|
| `--output <path>` | Output .trace file path |
| `--time-limit <time>` | Duration (10s, 1m, 500ms) |
| `--no-prompt` | Skip privacy warnings (automation) |
| `--append-run` | Add run to existing trace |

#### Core Instruments

| Instrument | Schema | Use For |
|------------|--------|---------|
| CPU Profiler | `cpu-profile` | Hot functions, CPU time |
| Allocations | `allocations` | Memory growth, object counts |
| Leaks | `leaks` | Unreleased memory, retain cycles |
| SwiftUI | `swiftui` | Excessive view updates |
| Swift Tasks + Swift Actors | `swift-task`, `swift-actor` | Task scheduling, actor isolation |

#### Exporting

```bash
# Table of contents
xcrun xctrace export --input trace.trace --toc

# Export by schema
xcrun xctrace export --input trace.trace \
    --xpath '/trace-toc/run[@number="1"]/data/table[@schema="cpu-profile"]'
```

CPU profile schema columns: time, thread, process, core, thread-state, weight (cycles), stack.

#### Process Discovery

```bash
# Simulator apps
xcrun simctl spawn booted launchctl list | grep UIKitApplication

# Booted simulators
xcrun simctl list devices booted -j

# PID lookup
pgrep -f "MyApp"
```

#### CI/CD Integration

```bash
#!/bin/bash
APP_NAME="MyApp"
xcrun xctrace record \
    --instrument 'CPU Profiler' \
    --device "iPhone 17 Pro" \
    --attach "$APP_NAME" \
    --time-limit 30s \
    --no-prompt \
    --output "./traces/cpu.trace"

xcrun xctrace export \
    --input "./traces/cpu.trace" \
    --xpath '/trace-toc/run[@number="1"]/data/table[@schema="cpu-profile"]' \
    > "./traces/cpu-profile.xml"
```

#### Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Document Missing Template Error" | `--template` in Xcode 26+ | Use `--instrument` instead |
| "Unable to attach to process" | Process not running / permissions | Verify with `pgrep`, check SIP |
| Empty trace export | Recording too short | Increase `--time-limit` |
| Raw addresses in backtraces | Missing dSYMs | `xcrun xctrace symbolicate --input trace.trace --dsym /path/to/App.dSYM` |

#### All Available Instruments

```
Activity Monitor          Audio Client              Audio Server
CPU Counters              CPU Profiler              Core Animation Activity
Core Animation Commits    Core Animation FPS        Core Animation Server
Core ML                   Data Faults               Disk I/O Latency
Disk Usage                Display                   Filesystem Activity
Foundation Models         Frame Lifetimes           GCD Performance
GPU                       HTTP Traffic              Hangs
Hitches                   Leaks                     Metal Application
Metal GPU Counters        Metal Performance Overview Network Connections
Neural Engine             Points of Interest        Power Profiler
Processor Trace           RealityKit Frames         RealityKit Metrics
Runloops                  Sampler                   Swift Actors
Swift Tasks               SwiftUI                   System Call Trace
System Load               Thread States             Time Profiler
VM Tracker                Virtual Memory Trace
```

### Non-Reproducible / Intermittent Leaks

When Instruments prevents reproduction or leaks only happen with specific user data:

1. **deinit logging as primary diagnostic**: Add to all suspect classes. Run 20+ sessions. Missing deinit messages reveal retained objects.
2. **Isolate the trigger**: Test each navigation path independently. Rapidly toggle background/foreground if timing-dependent.
3. **MetricKit for field diagnostics**: Monitor `peakMemoryUsage` in production. Alert when exceeding threshold (e.g., 400MB).

Common cause of intermittent leaks: Notification observers added on lifecycle events (`viewWillAppear`, `applicationDidBecomeActive`) without removing duplicates first.

### Instruments Quick Reference

| Scenario | Tool | What to Look For |
|----------|------|------------------|
| Progressive memory growth | Memory template | Line steadily climbing |
| Specific object leaking | Memory Graph Debugger | Purple/red circles |
| Direct leak detection | Leaks instrument | Red "! Leak" badge |
| Memory by type | VM Tracker | Objects consuming most memory |
| Cache behavior | Allocations | Objects allocated but not freed |
| UI freezes, low CPU | System Trace | Main thread gaps (blocked) |
| Profiling variance | Run 3x, trust slowest | Warm cache for consistency |

### Command Line Tools

```bash
xcrun xctrace record --template "Memory" --output memory.trace
xcrun xctrace dump memory.trace
leaks -atExit -excludeNoise YourApp
```

---

## Related

**WWDC**: 2018-416, 2018-612, 2019-417, 2020-10078, 2020-10081, 2021-10087, 2021-10147, 2021-10180, 2021-10258, 2022-10082, 2022-10083, 2023-10123, 2023-10160, 2024-10217, 2025-308, 2025-312

**Docs**: /xcode/instruments, /os/ossignposter, /xctest/xctestcase/measure, /metrickit, /metrickit/mxmetricmanager, /metrickit/mxdiagnosticpayload, /metrickit/mxhangdiagnostic, /metrickit/mxbackgroundexitdata, /quartzcore/cadisplaylink, /quartzcore/cametaldisplaylink, /quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays, /xcode/understanding-hitches-in-your-app, /xcode/analyzing-responsiveness-issues-in-your-shipping-app, /metal/mtldrawable/present(afterminimumduration:), /metrickit/mxanimationmetric, /os/logging/recording-performance-data, /xcode/gathering-information-about-memory-use

**Skills**: ax-energy, ax-swift-perf, ax-swiftui, ax-concurrency
