---
name: ax-energy
description: Use when app drains battery, device gets hot, users report energy issues, or auditing power consumption - Power Profiler diagnosis, subsystem identification (CPU/GPU/Network/Location/Display), background execution patterns
license: MIT
---

# Energy Optimization

## Quick Patterns

### Power Profiler Workflow (5 min)

```
1. Connect iPhone wirelessly to Xcode (wireless debugging)
2. Xcode > Product > Profile (Cmd+I)
3. Select Blank template
4. Click "+" > Add "Power Profiler" instrument
5. Optional: Add "CPU Profiler" for correlation
6. Click Record, use app normally for 2-3 minutes
7. Click Stop
8. Expand Power Profiler track, examine per-app lanes:
   - CPU Power Impact: Computation, timers, parsing
   - GPU Power Impact: Animations, blur, Metal
   - Display Power Impact: Brightness, content type
   - Network Power Impact: Requests, downloads, polling
```

**Why wireless**: When device is charging via cable, power metrics show 0.

### Timer Tolerance (1 min fix)

```swift
// BAD: No tolerance, prevents system batching
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in self.updateUI() }

// GOOD: 10% tolerance for system batching
let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in self.updateUI() }
timer.tolerance = 0.1

// BETTER: Combine Timer (auto-cleanup)
Timer.publish(every: 1.0, tolerance: 0.1, on: .main, in: .default)
    .autoconnect()
    .sink { [weak self] _ in self?.refresh() }
    .store(in: &cancellables)

// BEST: Event-driven, no timer
NotificationCenter.default.publisher(for: .dataDidUpdate)
    .sink { [weak self] _ in self?.updateUI() }
    .store(in: &cancellables)
```

### Push vs Poll (100x efficiency)

```swift
// BAD: Polling every 5 seconds (radio active 100% of time)
Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
    self?.fetchLatestData()
}

// GOOD: Server pushes when data changes
func application(_ application: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                 fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    Task {
        do {
            let hasNewData = try await fetchLatestData()
            completionHandler(hasNewData ? .newData : .noData)
        } catch { completionHandler(.failed) }
    }
}
```

### Location Accuracy Reduction

```swift
// BAD: Best accuracy drains GPS constantly
locationManager.desiredAccuracy = kCLLocationAccuracyBest
locationManager.startUpdatingLocation()

// GOOD: Appropriate accuracy + distance filter
locationManager.desiredAccuracy = kCLLocationAccuracyHundredMeters
locationManager.distanceFilter = 100
locationManager.startMonitoringSignificantLocationChanges()

// BEST: iOS 26+ async with stationary detection
for try await update in CLLocationUpdate.liveUpdates() {
    if update.stationary { break }  // System pauses automatically
    handleLocation(update.location)
}
```

### Lazy Loading (eliminates CPU spikes)

```swift
// BAD: Creates ALL views upfront (CPU spike from 1 to 21)
VStack { ForEach(videos) { VideoCardView(video: $0) } }

// GOOD: Creates only visible views (CPU impact 4.3)
LazyVStack { ForEach(videos) { VideoCardView(video: $0) } }
```

### Background Task Completion

```swift
// BAD: Long-running, never ends task
backgroundTask = application.beginBackgroundTask { }
performLongOperation()

// GOOD: End immediately when done
backgroundTask = application.beginBackgroundTask(withName: "Save State") { [weak self] in
    self?.saveProgress()
    if let task = self?.backgroundTask { application.endBackgroundTask(task) }
    self?.backgroundTask = .invalid
}
saveEssentialState()
application.endBackgroundTask(backgroundTask)
backgroundTask = .invalid
```

---

## Decision Tree

### Identify Dominant Subsystem

```
User reports energy issue?
|
|-- Run Power Profiler (15 min)
|   |
|   |-- CPU Power Impact dominant?
|   |   |-- Continuous? -> Timer leak, polling, tight loop
|   |   |-- Spikes during actions? -> Eager loading, repeated parsing
|   |   +-- High background CPU? -> Location, BGTasks, audio session
|   |
|   |-- Network Power Impact dominant?
|   |   |-- Many small requests? -> Batch into fewer large requests
|   |   |-- Regular intervals? -> Polling pattern, convert to push
|   |   +-- Large foreground downloads? -> Use discretionary background URLSession
|   |
|   |-- GPU Power Impact dominant?
|   |   |-- Continuous animations? -> Stop when view not visible
|   |   |-- Blur effects? -> Remove or use solid colors
|   |   +-- High frame rate? -> Audit secondary frame rates
|   |
|   |-- Display Power Impact dominant?
|   |   +-- Light backgrounds on OLED? -> Dark Mode (up to 70% savings)
|   |
|   +-- Location (shown in CPU + location icon)?
|       |-- Continuous updates? -> Significant-change monitoring
|       |-- High accuracy? -> Reduce to hundredMeters
|       +-- Background location? -> Evaluate if truly needed
```

### Symptom: App at Top of Battery Settings

```
App at top of Battery Settings?
|
|-- Step 1: Run Power Profiler (15 min)
|   |-- CPU high? -> Check timers, polling, eager loading
|   |-- Network high? -> Check request frequency, batching
|   |-- GPU high? -> Check animations, blur effects
|   +-- Display high? -> Check Dark Mode support
|
+-- Step 2: Check background section
    |-- High background time?
    |   |-- Location icon visible? -> Continuous location
    |   |-- Audio active? -> Session not deactivated
    |   +-- BGTasks running long? -> Not completing promptly
    +-- Background time appropriate? -> Issue is foreground
```

### Symptom: Device Gets Hot

```
Device gets hot?
|
|-- During specific action?
|   |-- Video/camera? -> Check encoding efficiency, release session
|   |-- Scroll/animation? -> GPU effects, frame rate too high
|   +-- Data processing? -> Cache parsed results, move to background
|
|-- During normal use? -> Run Power Profiler
|   |-- CPU high continuously -> Timer, polling, tight loop
|   |-- GPU high continuously -> Animation leak
|   +-- Network high continuously -> Polling pattern
|
+-- Only in background?
    |-- Location continuous -> Reduce accuracy, stop when done
    |-- Audio session active -> Deactivate when not playing
    +-- BGTask too long -> Complete faster, requiresExternalPower
```

### Symptom: Background Battery Drain

```
High background battery?
|
|-- Check Info.plist background modes
|   |-- "location" enabled? -> Need it? Use significant-change, lowest accuracy
|   |-- "audio" enabled? -> Not playing? Deactivate session
|   |-- "fetch" enabled? -> earliestBeginDate reasonable?
|   +-- "remote-notification" -> Check handler efficiency
|
|-- Check BGTaskScheduler
|   |-- Refresh too frequent? -> Increase earliestBeginDate
|   |-- Processing without power? -> Add requiresExternalPower = true
|   +-- Not completing? -> Always call setTaskCompleted
|
+-- Check beginBackgroundTask
    |-- endBackgroundTask called promptly?
    +-- Multiple overlapping tasks? -> Track IDs, end each
```

### Symptom: High Cellular Energy

```
High drain on cellular?
|
|-- URLSession configuration
|   |-- allowsExpensiveNetworkAccess = true? -> Set false for non-urgent
|   |-- isDiscretionary = false? -> Set true for background downloads
|   +-- waitsForConnectivity = false? -> Set true to avoid retries
|
|-- Request patterns
|   |-- Many small requests? -> Batch
|   |-- Polling? -> Push notifications
|   +-- Large foreground downloads? -> Background URLSession
|
+-- Low Data Mode
    +-- Check allowsConstrainedNetworkAccess, isLowDataModeEnabled
```

---

## Anti-Patterns

**Polling instead of push**. Polling every 5 seconds keeps radio active 100% of the time. Push notifications activate radio only when data changes. Polling uses 100x more energy.

**Best accuracy for non-navigation**. `kCLLocationAccuracyBest` uses GPS + WiFi + cellular triangulation. 95% of apps only need `kCLLocationAccuracyHundredMeters`.

**Animations running when not visible**. GPU continues rendering offscreen. Stop in `viewWillDisappear`, resume in `viewWillAppear`.

**Timer without tolerance**. Forces exact wake schedule, prevents system batching. Set tolerance to at least 10% of interval.

**VStack with large ForEach**. Creates ALL views upfront. Use `LazyVStack` for on-demand creation.

**Repeated parsing in frequently-called methods**. JSON parsed on every location update or timer fire. Cache with `lazy var`.

**Audio session never deactivated**. Hardware stays powered. Call `setActive(false, options: .notifyOthersOnDeactivation)` when playback stops.

**beginBackgroundTask without prompt end**. Running until expiration wastes energy. Call `endBackgroundTask` immediately when work completes.

**Ship now, optimize later**. Battery drain is immediately visible. Users see your app at top of Battery Settings on day one. A 15-minute Power Profiler session before launch catches major issues.

---

## Deep Patterns

### Background Execution (EMRCA)

Principles from WWDC25-227:
- **E**fficient: Lightweight, purpose-driven tasks
- **M**inimal: Keep background work to minimum
- **R**esilient: Save incremental progress, handle expiration
- **C**ourteous: Honor user preferences and system conditions
- **A**daptive: Work with system priorities, don't fight constraints

#### BGProcessingTask (Long Operations)

```swift
func scheduleBackgroundProcessing() {
    let request = BGProcessingTaskRequest(identifier: "com.app.maintenance")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = true  // Only when charging
    try? BGTaskScheduler.shared.submit(request)
}

BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.app.maintenance", using: nil) { task in
    self.handleMaintenance(task: task as! BGProcessingTask)
}
```

#### iOS 26+ BGContinuedProcessingTask

Continue user-initiated tasks with progress UI:

```swift
let request = BGContinuedProcessingTaskRequest(
    identifier: "com.app.export",
    title: "Exporting Photos",
    subtitle: "0 of 100 photos"
)
try? BGTaskScheduler.shared.submit(request)

BGTaskScheduler.shared.register("com.app.export") { task in
    let continuedTask = task as! BGContinuedProcessingTask
    continuedTask.progress.totalUnitCount = 100

    var shouldContinue = true
    continuedTask.expirationHandler = { shouldContinue = false }

    for i in 0..<100 {
        guard shouldContinue else { break }
        performExportStep(i)
        continuedTask.progress.completedUnitCount = Int64(i + 1)
    }
    continuedTask.setTaskCompleted(success: shouldContinue)
}
```

### Frame Rate Auditing

Secondary animations at higher frame rates than needed waste GPU power. Up to 20% battery savings by aligning frame rates.

```swift
let displayLink = CADisplayLink(target: self, selector: #selector(updateAnimation))
displayLink.preferredFrameRateRange = CAFrameRateRange(
    minimum: 10, maximum: 30, preferred: 30  // Match primary content
)
displayLink.add(to: .current, forMode: .default)
```

### Low Power Mode Response

```swift
if ProcessInfo.processInfo.isLowPowerModeEnabled {
    reduceEnergyUsage()
}

NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)
    .sink { [weak self] _ in
        if ProcessInfo.processInfo.isLowPowerModeEnabled {
            self?.reduceEnergyUsage()
        } else {
            self?.restoreNormalOperation()
        }
    }
    .store(in: &cancellables)

func reduceEnergyUsage() {
    // Increase timer intervals
    // Reduce animation frame rates
    // Defer network requests
    // Stop non-critical location updates
}
```

### On-Device Power Profiler (Without Mac)

From WWDC25-226: Capture traces in real-world conditions.

```
1. Settings > Privacy & Security > Developer Mode > Enable
2. Settings > Developer > Performance Trace > Enable
3. Control Center > Add "Performance Trace" shortcut
4. Swipe down > Tap icon > Start (records up to 10 hours)
5. Share trace via AirDrop to Mac
```

### Production Monitoring with MetricKit

```swift
class EnergyMetricsManager: NSObject, MXMetricManagerSubscriber {
    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            if let cpu = payload.cpuMetrics {
                logMetric("foreground_cpu", value: cpu.cumulativeCPUTime)
            }
            if let location = payload.locationActivityMetrics {
                logMetric("background_location", value: location.cumulativeBackgroundLocationTime)
            }
        }
    }
}
```

Xcode Organizer > Battery Usage: Foreground vs background energy breakdown, category breakdown, version comparison.

### Real-World Examples

**Video app eager loading (WWDC25-226)**: VStack creating all thumbnails upfront caused CPU power impact 21. Changed to LazyVStack, dropped to 4.3.

**Location-based suggestions (WWDC25-226)**: JSON parsed on every location update during commute. Cached with `lazy var`, eliminated CPU spikes.

**Music app audio session**: Session never deactivated after stop. Added `setActive(false, options: .notifyOthersOnDeactivation)`, eliminated background drain.

---

## Diagnostics

### 30-Second Check
- Device plugged in? (Power metrics show 0)
- Debug build? (Less optimized than release)
- Low Power Mode on? (May affect measurements)

### 5-Minute Check (Power Profiler)
- Which subsystem is dominant? (CPU/GPU/Network/Display)
- Sustained or spiky?
- Foreground or background?

### 15-Minute Investigation
- If CPU: Run Time Profiler to identify function
- If Network: Check request frequency and size
- If GPU: Check animation frame rates
- If Background: Check Info.plist modes

### Common Quick Fixes

| Finding | Fix | Time |
|---------|-----|------|
| Timer without tolerance | `.tolerance = 0.1` | 1 min |
| VStack with large ForEach | Change to LazyVStack | 1 min |
| allowsExpensiveNetworkAccess = true | Set false | 1 min |
| Missing stopUpdatingLocation | Add stop call | 2 min |
| No Dark Mode | Add asset variants | 30 min |
| Audio session always active | setActive(false) | 5 min |

### Background Drain Patterns

| Pattern | Power Profiler Signature | Fix |
|---------|------------------------|-----|
| Continuous location | CPU lane + location icon | significant-change |
| Audio session leak | CPU lane steady | setActive(false) |
| Timer not invalidated | CPU spikes at intervals | invalidate in background |
| Polling from background | Network lane at intervals | Push notifications |
| BGTask too long | CPU sustained | Faster completion |

### Audit Checklists

**Timers**: Tolerance >= 10%, invalidated when done, using Combine, no polling that could be push, stopped on background.

**Network**: Requests batched, discretionary for non-urgent, waitsForConnectivity, allowsExpensiveNetworkAccess=false for deferrable, push not poll.

**Location**: Appropriate accuracy (not Best unless navigation), distanceFilter set, stopped when done, significant-change for background, background justified.

**Background**: endBackgroundTask called promptly, BGProcessingTask uses requiresExternalPower, background modes limited, audio deactivated, EMRCA followed.

**Display/GPU**: Dark Mode supported, animations stop when hidden, frame rates appropriate, blur minimized, Metal has frame limiting.

**Disk I/O**: Writes batched, SQLite WAL mode, no rapid create/delete, SwiftData/Core Data for frequent updates.

### Key Energy Savings

| Optimization | Potential Savings |
|--------------|------------------|
| Dark Mode on OLED | Up to 70% display power |
| Frame rate alignment | Up to 20% GPU power |
| Push vs poll | 100x network efficiency |
| Location accuracy reduction | 50-90% GPS power |
| Timer tolerance | Significant CPU savings |
| Lazy loading | Eliminates startup CPU spikes |

---

## Related

**WWDC**: 2019-417, 2019-707, 2020-10095, 2022-10083, 2025-226, 2025-227

**Docs**: /documentation/backgroundtasks, /documentation/corelocation, /documentation/metrickit

**Skills**: ax-energy-ref, ax-performance, ax-networking
