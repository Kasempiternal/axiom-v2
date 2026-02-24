---
name: ax-background-tasks
description: BGTaskScheduler, background URL sessions, silent push, beginBackgroundTask, and BGContinuedProcessingTask patterns for iOS
license: MIT
---

# Background Tasks

## Quick Patterns

```swift
// BGAPPREFRESH (iOS 13+) - keep content fresh, ~30s runtime
// Info.plist: BGTaskSchedulerPermittedIdentifiers + UIBackgroundModes=fetch

// Register in didFinishLaunchingWithOptions BEFORE return
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.app.refresh", using: nil
) { task in
    self.handleRefresh(task: task as! BGAppRefreshTask)
}

// Schedule when app backgrounds
let request = BGAppRefreshTaskRequest(identifier: "com.app.refresh")
request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
try BGTaskScheduler.shared.submit(request)

// Handler
func handleRefresh(task: BGAppRefreshTask) {
    task.expirationHandler = { self.cancel() }  // set FIRST
    scheduleNextRefresh()                        // continuous pattern
    fetchData { result in
        task.setTaskCompleted(success: result.isSuccess)  // ALL paths
    }
}

// BGPROCESSINGTASK (iOS 13+) - maintenance, minutes runtime
// Info.plist: UIBackgroundModes=processing
let req = BGProcessingTaskRequest(identifier: "com.app.maintenance")
req.requiresExternalPower = true   // CPU-intensive work
req.requiresNetworkConnectivity = true  // cloud sync

// BGCONTINUEDPROCESSINGTASK (iOS 26+) - user-initiated continuation
let req = BGContinuedProcessingTaskRequest(
    identifier: "com.app.export.photos",
    title: "Exporting Photos", subtitle: "0 of 100"
)
req.strategy = .fail  // reject if can't start now

// BACKGROUND URLSESSION - survives app termination
let config = URLSessionConfiguration.background(withIdentifier: "com.app.dl")
config.sessionSendsLaunchEvents = true
config.isDiscretionary = true
let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)

// BEGINBACKGROUNDTASK - ~30s for state saving on background
let id = UIApplication.shared.beginBackgroundTask { UIApplication.shared.endBackgroundTask(id) }
saveState { UIApplication.shared.endBackgroundTask(id) }

// SWIFTUI backgroundTask modifier
.backgroundTask(.appRefresh("com.app.refresh")) {
    scheduleNext()
    await fetchContent()  // completes when closure returns
}
```

## Decision Tree

```
Need background execution?
|
+-- User explicitly initiated action (button tap)?
|   +-- iOS 26+? --> BGContinuedProcessingTask (progress UI)
|   +-- iOS 13-25? --> beginBackgroundTask + save progress
|
+-- Keep content fresh throughout day?
|   +-- Work <= 30 seconds? --> BGAppRefreshTask
|   +-- Need several minutes? --> BGProcessingTask with constraints
|
+-- Deferrable maintenance (DB cleanup, ML training)?
|   --> BGProcessingTask with requiresExternalPower=true
|
+-- Large downloads/uploads?
|   --> Background URLSession (survives app termination)
|
+-- Server triggers data fetch?
|   --> Silent push notification (content-available:1)
|
+-- Short critical work when backgrounding?
|   --> beginBackgroundTask (~30s)
|
Task never runs?
+-- Info.plist identifier matches code exactly (case-sensitive)?
+-- Registration in didFinishLaunchingWithOptions before return?
+-- App not swiped away from App Switcher?
+-- UIBackgroundModes includes "fetch" or "processing"?
+-- Background App Refresh enabled in Settings?
|
Task terminates early?
+-- Expiration handler set as FIRST line?
+-- setTaskCompleted called in ALL code paths?
+-- Work duration within task type limits?
+-- Using BGProcessingTask for >30s work?
|
Works in dev, not production?
+-- Low Power Mode enabled?
+-- Battery < 20%?
+-- App rarely used (low system priority)?
+-- Force-quit from App Switcher?
```

## Anti-Patterns

```swift
// WRONG: registering after app launch
func someButtonTapped() {
    BGTaskScheduler.shared.register(...)  // too late!
}

// CORRECT: register in didFinishLaunchingWithOptions before return true
func application(_:didFinishLaunchingWithOptions:) -> Bool {
    BGTaskScheduler.shared.register(...)
    return true
}
```

```swift
// WRONG: missing setTaskCompleted in error path
func handleRefresh(task: BGAppRefreshTask) {
    fetchData { result in
        if case .success = result {
            task.setTaskCompleted(success: true)
        }
        // failure path: NEVER signals completion!
    }
}

// CORRECT: call in ALL paths
func handleRefresh(task: BGAppRefreshTask) {
    fetchData { result in
        task.setTaskCompleted(success: result.isSuccess)
    }
}
```

```swift
// WRONG: no expiration handler, or set too late
func handleRefresh(task: BGAppRefreshTask) {
    doWork()
    task.expirationHandler = { ... }  // too late if already expired!
}

// CORRECT: set expiration handler FIRST
func handleRefresh(task: BGAppRefreshTask) {
    task.expirationHandler = { self.cancel() }
    doWork()
}
```

```swift
// WRONG: expecting polling intervals in background
Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in fetchData() }

// CORRECT: BGAppRefreshTask runs on system schedule (user usage patterns)
// For real-time: use silent push notifications
```

```swift
// WRONG: not saving progress for long tasks
func handleMaintenance(task: BGProcessingTask) {
    processAllItems()  // if expired mid-way, all progress lost
}

// CORRECT: checkpoint after each chunk
func handleMaintenance(task: BGProcessingTask) {
    var shouldContinue = true
    task.expirationHandler = { shouldContinue = false }
    for item in items {
        guard shouldContinue else { saveProgress(); break }
        process(item)
        saveProgress()  // checkpoint
    }
    task.setTaskCompleted(success: shouldContinue)
}
```

## Deep Patterns

### BGAppRefreshTask: Complete Implementation

```swift
// Registration (AppDelegate)
func application(_ app: UIApplication,
                 didFinishLaunchingWithOptions opts: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    BGTaskScheduler.shared.register(
        forTaskWithIdentifier: "com.app.refresh", using: nil
    ) { task in
        self.handleAppRefresh(task: task as! BGAppRefreshTask)
    }
    return true
}

// Scheduling (on background transition)
func scheduleAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.app.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    do {
        try BGTaskScheduler.shared.submit(request)
    } catch BGTaskScheduler.Error.notPermitted {
        // Background App Refresh disabled
    } catch BGTaskScheduler.Error.tooManyPendingTaskRequests {
        // Already scheduled
    } catch BGTaskScheduler.Error.unavailable {
        // Not available (Simulator)
    } catch { print("Schedule failed: \(error)") }
}

// Handler
func handleAppRefresh(task: BGAppRefreshTask) {
    task.expirationHandler = { [weak self] in
        self?.currentOperation?.cancel()
    }
    scheduleAppRefresh()  // continuous
    fetchLatestContent { result in
        task.setTaskCompleted(success: result.isSuccess)
    }
}
```

### BGProcessingTask: Maintenance with Checkpointing

```swift
BGTaskScheduler.shared.register(
    forTaskWithIdentifier: "com.app.maintenance", using: nil
) { task in
    self.handleMaintenance(task: task as! BGProcessingTask)
}

func scheduleMaintenance() {
    guard needsMaintenance() else { return }
    let request = BGProcessingTaskRequest(identifier: "com.app.maintenance")
    request.requiresExternalPower = true      // disables CPU monitor
    request.requiresNetworkConnectivity = true
    try? BGTaskScheduler.shared.submit(request)
}

func handleMaintenance(task: BGProcessingTask) {
    var shouldContinue = true
    task.expirationHandler = {
        shouldContinue = false
    }
    Task {
        for chunk in workChunks {
            guard shouldContinue else { saveProgress(); break }
            try await processChunk(chunk)
            saveProgress()
        }
        task.setTaskCompleted(success: shouldContinue)
    }
}
```

### BGContinuedProcessingTask (iOS 26+)

User-initiated work with system progress UI. Dynamic registration.

```swift
// Info.plist: "com.app.export.*" (wildcard)

func userTappedExport() {
    BGTaskScheduler.shared.register(
        forTaskWithIdentifier: "com.app.export.photos"
    ) { task in
        self.handleExport(task: task as! BGContinuedProcessingTask)
    }

    let request = BGContinuedProcessingTaskRequest(
        identifier: "com.app.export.photos",
        title: "Exporting Photos",
        subtitle: "0 of 100 photos"
    )
    request.strategy = .fail  // or .enqueue (default)
    try? BGTaskScheduler.shared.submit(request)
}

func handleExport(task: BGContinuedProcessingTask) {
    var shouldContinue = true
    task.expirationHandler = { shouldContinue = false }

    // MANDATORY: progress reporting (no updates = auto-expire)
    task.progress.totalUnitCount = Int64(photos.count)
    task.progress.completedUnitCount = 0

    Task {
        for (i, photo) in photos.enumerated() {
            guard shouldContinue else { break }
            await exportPhoto(photo)
            task.progress.completedUnitCount = Int64(i + 1)
        }
        task.setTaskCompleted(success: shouldContinue)
    }
}

// Check GPU availability (iOS 26+)
if BGTaskScheduler.shared.supportedResources.contains(.gpu) { /* GPU OK */ }
```

### SwiftUI backgroundTask Modifier

```swift
@main
struct MyApp: App {
    @Environment(\.scenePhase) var scenePhase

    var body: some Scene {
        WindowGroup { ContentView() }
        .onChange(of: scenePhase) { newPhase in
            if newPhase == .background { scheduleAppRefresh() }
        }
        .backgroundTask(.appRefresh("com.app.refresh")) {
            scheduleAppRefresh()
            await fetchLatestContent()
            // implicit setTaskCompleted when closure returns
            // automatic cancellation on expiration
        }
        .backgroundTask(.urlSession("com.app.downloads")) {
            await processDownloadedFiles()
        }
    }
}
```

### Swift Concurrency + Expiration Bridge

```swift
func handleAppRefresh(task: BGAppRefreshTask) {
    let workTask = Task {
        try await withTaskCancellationHandler {
            try await fetchAndProcessData()
            task.setTaskCompleted(success: true)
        } onCancel: {
            // lightweight, runs on arbitrary thread
        }
    }
    task.expirationHandler = { workTask.cancel() }
}

func fetchAndProcessData() async throws {
    for item in items {
        try Task.checkCancellation()  // throws CancellationError
        try await process(item)
    }
}
```

### Background URLSession

```swift
lazy var backgroundSession: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: "com.app.downloads")
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = true
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
}()

// AppDelegate
var bgSessionHandler: (() -> Void)?
func application(_ app: UIApplication,
                 handleEventsForBackgroundURLSession id: String,
                 completionHandler: @escaping () -> Void) {
    bgSessionHandler = completionHandler
}

// URLSessionDelegate
func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                didFinishDownloadingTo location: URL) {
    // MUST move file immediately -- temp deleted after return
    try? FileManager.default.moveItem(at: location, to: destinationURL)
}
func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async { self.bgSessionHandler?(); self.bgSessionHandler = nil }
}
```

### Silent Push Notification Trigger

```json
{ "aps": { "content-available": 1 }, "custom": "data" }
```

Use `apns-priority: 5` for energy efficiency. Rate-limited: 14 pushes may yield 7 launches.

```swift
func application(_ app: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                 fetchCompletionHandler handler: @escaping (UIBackgroundFetchResult) -> Void) {
    Task {
        do {
            let new = try await fetchLatestData()
            handler(new ? .newData : .noData)
        } catch { handler(.failed) }
    }
}
```

### beginBackgroundTask (State Saving)

```swift
var bgTaskID: UIBackgroundTaskIdentifier = .invalid

func applicationDidEnterBackground(_ app: UIApplication) {
    bgTaskID = app.beginBackgroundTask(withName: "Save") { [weak self] in
        self?.saveProgress()
        if let id = self?.bgTaskID { app.endBackgroundTask(id) }
        self?.bgTaskID = .invalid
    }
    saveState { [weak self] in
        guard let self, self.bgTaskID != .invalid else { return }
        UIApplication.shared.endBackgroundTask(self.bgTaskID)
        self.bgTaskID = .invalid
    }
}
```

Call `endBackgroundTask` as soon as work completes, not just in expiration handler.

### Task Type Reference

| Type | Runtime | When Runs | Info.plist Mode |
|------|---------|-----------|-----------------|
| BGAppRefreshTask | ~30s | User usage patterns | `fetch` |
| BGProcessingTask | Minutes | Charging, idle (overnight) | `processing` |
| BGContinuedProcessingTask | Extended | User-initiated (iOS 26+) | `processing` |
| beginBackgroundTask | ~30s | Immediately on background | None |
| Background URLSession | As needed | System-optimal, survives termination | None |
| Silent push | ~30s | Server-triggered | `remote-notification` |

### The 7 Scheduling Factors (WWDC 2020-10063)

| Factor | Impact |
|--------|--------|
| Critically Low Battery (<20%) | Discretionary work paused |
| Low Power Mode | Background activity limited |
| App Usage | More frequent = higher priority |
| App Switcher | Swiped away = no background |
| Background App Refresh setting | Off = no BGAppRefresh |
| System Budgets | Deplete with launches, refill daily |
| Rate Limiting | System spaces launches |

### Info.plist Configuration

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
    <string>com.app.refresh</string>
    <string>com.app.maintenance</string>
    <string>com.app.export.*</string>   <!-- wildcard, iOS 26+ -->
</array>
<key>UIBackgroundModes</key>
<array>
    <string>fetch</string>
    <string>processing</string>
</array>
```

## Diagnostics

### LLDB Testing Commands

```lldb
// Trigger task launch (pause debugger first)
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateLaunchForTaskWithIdentifier:@"com.app.refresh"]

// Trigger expiration
e -l objc -- (void)[[BGTaskScheduler sharedScheduler] _simulateExpirationForTaskWithIdentifier:@"com.app.refresh"]
```

### Console Filter

```
subsystem:com.apple.backgroundtaskscheduler
```

Expected log sequence: Registered handler > Scheduling task > Starting task > Task completed.

### Check Pending Tasks

```swift
BGTaskScheduler.shared.getPendingTaskRequests { requests in
    for r in requests { print("Pending: \(r.identifier), earliest: \(r.earliestBeginDate ?? Date())") }
}
```

### System Constraint Checks

```swift
// Low Power Mode
ProcessInfo.processInfo.isLowPowerModeEnabled

// Background App Refresh
UIApplication.shared.backgroundRefreshStatus  // .available, .denied, .restricted

// Thermal state
ProcessInfo.processInfo.thermalState  // .nominal, .fair, .serious, .critical
```

### Task Never Runs Checklist

1. Info.plist identifier matches code exactly (case-sensitive)
2. UIBackgroundModes includes `fetch` and/or `processing`
3. Registration in `didFinishLaunchingWithOptions` before `return true`
4. App not swiped away from App Switcher
5. Background App Refresh enabled in Settings
6. Battery > 20%, Low Power Mode off
7. LLDB `_simulateLaunchForTaskWithIdentifier` triggers handler

### Task Terminates Early Checklist

1. Expiration handler set as FIRST line in handler
2. `setTaskCompleted(success:)` called in ALL code paths
3. Work duration within task type limits (~30s refresh, minutes processing)
4. Network operations use background URLSession for large transfers
5. Expiration handler actually cancels in-progress work

### Works in Dev, Not Production

1. Debugger attached changes timing behavior
2. Check `ProcessInfo.isLowPowerModeEnabled`
3. Check `UIApplication.backgroundRefreshStatus`
4. User may have force-quit from App Switcher
5. Rarely-used apps get lower scheduling priority
6. Add analytics logging for schedule/launch/complete events

### File Protection for Background Tasks

Files must be accessible when device is locked:

```swift
try data.write(to: url, options: .completeFileProtectionUntilFirstUserAuthentication)
```

### Prevent Duplicate Scheduling

```swift
BGTaskScheduler.shared.getPendingTaskRequests { requests in
    if !requests.contains(where: { $0.identifier == "com.app.refresh" }) {
        self.scheduleRefresh()
    }
}
```

## Related

- **ax-energy** -- Battery impact of background tasks, energy optimization
- **ax-networking** -- Background URLSession patterns, network conditions
- **ax-media** -- Background audio playback with AVAudioSession
- **ax-privacy** -- Permission UX for background refresh settings
