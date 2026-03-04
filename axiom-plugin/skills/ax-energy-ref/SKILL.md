---
name: ax-energy-ref
description: Energy optimization API reference - timer/network/location/background/display APIs, Power Profiler recording, iOS 26 BGContinuedProcessingTask, MetricKit energy monitoring, push notification setup
license: MIT
---

# Energy API Reference

## Quick Patterns

### Timer APIs

```swift
// NSTimer with tolerance
let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    self?.updateUI()
}
timer.tolerance = 0.1  // 10% minimum

// Combine Timer
Timer.publish(every: 1.0, tolerance: 0.1, on: .main, in: .default)
    .autoconnect()
    .sink { [weak self] _ in self?.refresh() }
    .store(in: &cancellables)

// DispatchSource timer with leeway
let timer = DispatchSource.makeTimerSource(queue: queue)
timer.schedule(deadline: .now(), repeating: .seconds(1), leeway: .milliseconds(100))
timer.setEventHandler { [weak self] in self?.performWork() }
timer.resume()
```

### URLSession Energy-Conscious Config

```swift
let config = URLSessionConfiguration.default
config.waitsForConnectivity = true
config.allowsExpensiveNetworkAccess = false
config.allowsConstrainedNetworkAccess = false
let session = URLSession(configuration: config)
```

### Discretionary Background Download

```swift
let config = URLSessionConfiguration.background(withIdentifier: "com.app.downloads")
config.isDiscretionary = true
config.sessionSendsLaunchEvents = true
let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)

let task = session.downloadTask(with: url)
task.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 60 * 60)
task.countOfBytesClientExpectsToSend = 200
task.countOfBytesClientExpectsToReceive = 500_000
task.resume()
```

### Location Accuracy Options

| Constant | Accuracy | Battery Impact | Use Case |
|----------|----------|----------------|----------|
| `kCLLocationAccuracyBestForNavigation` | ~1m | Extreme | Turn-by-turn only |
| `kCLLocationAccuracyBest` | ~10m | Very High | Fitness tracking |
| `kCLLocationAccuracyNearestTenMeters` | ~10m | High | Precise positioning |
| `kCLLocationAccuracyHundredMeters` | ~100m | Medium | Store locators |
| `kCLLocationAccuracyKilometer` | ~1km | Low | Weather, general |
| `kCLLocationAccuracyThreeKilometers` | ~3km | Very Low | Regional content |

---

## Decision Tree

```
Need energy API reference?
|
|-- Timer APIs -> Part 1
|-- Network efficiency -> Part 2
|-- Location efficiency -> Part 3
|-- Background execution -> Part 4
|-- Display/GPU efficiency -> Part 5
|-- Disk I/O -> Part 6
|-- Low Power Mode / Thermal -> Part 7
|-- MetricKit monitoring -> Part 8
+-- Push notifications -> Part 9
```

---

## Anti-Patterns

**DispatchSource timer without leeway**. Forces exact wake, same problem as NSTimer without tolerance.

**Background URLSession without discretionary**. System treats as urgent, wastes energy on immediate delivery.

**CLLocationManager without distanceFilter**. Receives update on every tiny movement. Set `distanceFilter` to reduce frequency.

**beginBackgroundTask without endBackgroundTask**. Task runs until system expiration (~30s), wasting energy.

**Playing silent audio for keep-alive**. Anti-pattern. Use proper BGTask APIs instead.

---

## Deep Patterns

### Part 1: Timer Efficiency APIs

#### NSTimer with Tolerance

```swift
let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
    self?.updateUI()
}
timer.tolerance = 0.1  // 10% minimum recommended
RunLoop.current.add(timer, forMode: .common)

deinit { timer.invalidate() }
```

#### Combine Timer Publisher

```swift
import Combine

class ViewModel: ObservableObject {
    private var cancellables = Set<AnyCancellable>()

    func startPolling() {
        Timer.publish(every: 1.0, tolerance: 0.1, on: .main, in: .default)
            .autoconnect()
            .sink { [weak self] _ in self?.refresh() }
            .store(in: &cancellables)
    }

    func stopPolling() { cancellables.removeAll() }
}
```

#### DispatchSource Timer (Low-Level)

```swift
let queue = DispatchQueue(label: "com.app.timer")
let timer = DispatchSource.makeTimerSource(queue: queue)
timer.schedule(deadline: .now(), repeating: .seconds(1), leeway: .milliseconds(100))
timer.setEventHandler { [weak self] in self?.performWork() }
timer.resume()
timer.cancel()  // When done
```

#### Event-Driven Alternative (File Monitoring)

```swift
let fileDescriptor = open(filePath.path, O_EVTONLY)
let source = DispatchSource.makeFileSystemObjectSource(
    fileDescriptor: fileDescriptor, eventMask: [.write, .delete], queue: .main
)
source.setEventHandler { [weak self] in self?.handleFileChange() }
source.setCancelHandler { close(fileDescriptor) }
source.resume()
```

### Part 2: Network Efficiency APIs

#### URLSession Configuration

```swift
// Energy-conscious defaults
let config = URLSessionConfiguration.default
config.waitsForConnectivity = true         // Don't fail immediately
config.allowsExpensiveNetworkAccess = false // Prefer WiFi
config.allowsConstrainedNetworkAccess = false // Respect Low Data Mode
let session = URLSession(configuration: config)
```

#### Discretionary Background Downloads

```swift
let config = URLSessionConfiguration.background(withIdentifier: "com.app.downloads")
config.isDiscretionary = true              // System chooses optimal time
config.sessionSendsLaunchEvents = true
config.timeoutIntervalForResource = 24 * 60 * 60  // 24 hours
config.timeoutIntervalForRequest = 60

let session = URLSession(configuration: config, delegate: self, delegateQueue: nil)

let task = session.downloadTask(with: url)
task.earliestBeginDate = Date(timeIntervalSinceNow: 2 * 60 * 60)
task.countOfBytesClientExpectsToSend = 200
task.countOfBytesClientExpectsToReceive = 500_000
task.resume()
```

#### Background Session Delegate

```swift
class DownloadDelegate: NSObject, URLSessionDownloadDelegate {
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask,
                    didFinishDownloadingTo location: URL) {
        let destination = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("downloaded.data")
        try? FileManager.default.moveItem(at: location, to: destination)
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            if let handler = AppDelegate.shared.backgroundCompletionHandler {
                handler()
                AppDelegate.shared.backgroundCompletionHandler = nil
            }
        }
    }
}
```

### Part 3: Location Efficiency APIs

#### CLLocationManager Configuration

```swift
import CoreLocation

class LocationService: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()

    func configure() {
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 100
        manager.pausesLocationUpdatesAutomatically = true

        // Background (if needed)
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
    }

    func startTracking() {
        manager.requestWhenInUseAuthorization()
        manager.startUpdatingLocation()
    }

    func startSignificantChangeTracking() {
        manager.startMonitoringSignificantLocationChanges()
    }

    func stopTracking() {
        manager.stopUpdatingLocation()
        manager.stopMonitoringSignificantLocationChanges()
    }
}
```

#### iOS 26+ CLLocationUpdate (Async API)

```swift
func trackLocation() async throws {
    for try await update in CLLocationUpdate.liveUpdates() {
        if update.stationary { break }  // System pauses automatically
        if let location = update.location { handleLocation(location) }
    }
}
```

#### CLMonitor for Region Monitoring

```swift
func setupRegionMonitoring() async {
    let monitor = CLMonitor("significant-changes")
    let condition = CLMonitor.CircularGeographicCondition(
        center: currentLocation.coordinate, radius: 500
    )
    await monitor.add(condition, identifier: "home-region")

    for try await event in monitor.events {
        switch event.state {
        case .satisfied: handleRegionEntry()
        case .unsatisfied: handleRegionExit()
        default: break
        }
    }
}
```

### Part 4: Background Execution APIs

#### beginBackgroundTask (Short Tasks)

```swift
var backgroundTask: UIBackgroundTaskIdentifier = .invalid

func applicationDidEnterBackground(_ application: UIApplication) {
    backgroundTask = application.beginBackgroundTask(withName: "Save State") { [weak self] in
        self?.endBackgroundTask()
    }
    saveState()
    endBackgroundTask()
}

private func endBackgroundTask() {
    guard backgroundTask != .invalid else { return }
    UIApplication.shared.endBackgroundTask(backgroundTask)
    backgroundTask = .invalid
}
```

#### BGAppRefreshTask

```swift
import BackgroundTasks

// Register at launch
BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.app.refresh", using: nil) { task in
    self.handleAppRefresh(task: task as! BGAppRefreshTask)
}

// Schedule
func scheduleAppRefresh() {
    let request = BGAppRefreshTaskRequest(identifier: "com.app.refresh")
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    try? BGTaskScheduler.shared.submit(request)
}

// Handle
func handleAppRefresh(task: BGAppRefreshTask) {
    scheduleAppRefresh()  // Schedule next
    let fetchTask = Task {
        do {
            let hasNewData = try await fetchLatestData()
            task.setTaskCompleted(success: hasNewData)
        } catch { task.setTaskCompleted(success: false) }
    }
    task.expirationHandler = { fetchTask.cancel() }
}
```

#### BGProcessingTask

```swift
BGTaskScheduler.shared.register(forTaskWithIdentifier: "com.app.maintenance", using: nil) { task in
    self.handleMaintenance(task: task as! BGProcessingTask)
}

func scheduleMaintenance() {
    let request = BGProcessingTaskRequest(identifier: "com.app.maintenance")
    request.requiresNetworkConnectivity = true
    request.requiresExternalPower = true
    try? BGTaskScheduler.shared.submit(request)
}

func handleMaintenance(task: BGProcessingTask) {
    let operation = MaintenanceOperation()
    task.expirationHandler = { operation.cancel() }
    operation.completionBlock = { task.setTaskCompleted(success: !operation.isCancelled) }
    OperationQueue.main.addOperation(operation)
}
```

#### iOS 26+ BGContinuedProcessingTask

```swift
// Info.plist: Add to BGTaskSchedulerPermittedIdentifiers

BGTaskScheduler.shared.register("com.app.export") { task in
    let continuedTask = task as! BGContinuedProcessingTask
    var shouldContinue = true
    continuedTask.expirationHandler = { shouldContinue = false }

    continuedTask.progress.totalUnitCount = 100
    for i in 0..<100 {
        guard shouldContinue else { break }
        performExportStep(i)
        continuedTask.progress.completedUnitCount = Int64(i + 1)
    }
    continuedTask.setTaskCompleted(success: shouldContinue)
}

// Submit
let request = BGContinuedProcessingTaskRequest(
    identifier: "com.app.export",
    title: "Exporting Photos",
    subtitle: "0 of 100 photos"
)
request.strategy = .fail  // Fail if can't start immediately
try? BGTaskScheduler.shared.submit(request)
```

#### EMRCA Principles (WWDC25-227)

| Principle | Meaning | Implementation |
|-----------|---------|----------------|
| **E**fficient | Lightweight, purpose-driven | Do one thing well |
| **M**inimal | Keep work to minimum | Don't expand scope |
| **R**esilient | Save progress, handle expiration | Checkpoint frequently |
| **C**ourteous | Honor preferences | Check Low Power Mode |
| **A**daptive | Work with system | Don't fight constraints |

### Part 5: Display & GPU Efficiency APIs

#### Dark Mode Support

```swift
let isDarkMode = traitCollection.userInterfaceStyle == .dark

// Dynamic colors
let dynamicColor = UIColor { traitCollection in
    traitCollection.userInterfaceStyle == .dark ? .black : .white
    // True black on OLED = pixels off = 0 power
}

// React to changes
override func traitCollectionDidChange(_ prev: UITraitCollection?) {
    super.traitCollectionDidChange(prev)
    if traitCollection.hasDifferentColorAppearance(comparedTo: prev) {
        updateColorsForAppearance()
    }
}
```

#### Frame Rate Control

```swift
class AnimationController {
    private var displayLink: CADisplayLink?

    func startAnimation() {
        displayLink = CADisplayLink(target: self, selector: #selector(update))
        displayLink?.preferredFrameRateRange = CAFrameRateRange(
            minimum: 10, maximum: 30, preferred: 30
        )
        displayLink?.add(to: .current, forMode: .default)
    }

    func stopAnimation() {
        displayLink?.invalidate()
        displayLink = nil
    }
}
```

#### Stop Animations When Not Visible

```swift
class AnimatedViewController: UIViewController {
    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        startAnimations()
    }
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopAnimations()  // Critical for energy
    }
}
```

### Part 6: Disk I/O Efficiency APIs

#### Batch Writes

```swift
// BAD: Multiple small writes
for item in items {
    try JSONEncoder().encode(item).write(to: fileURL)
}

// GOOD: Single batched write
try JSONEncoder().encode(items).write(to: fileURL)
```

#### SQLite WAL Mode

```swift
sqlite3_open(dbPath, &db)
var statement: OpaquePointer?
sqlite3_prepare_v2(db, "PRAGMA journal_mode=WAL", -1, &statement, nil)
sqlite3_step(statement)
sqlite3_finalize(statement)
```

#### XCTStorageMetric

```swift
func testDiskWritePerformance() {
    measure(metrics: [XCTStorageMetric()]) { saveUserData() }
}
```

### Part 7: Low Power Mode & Thermal APIs

#### Low Power Mode Detection

```swift
class PowerStateManager {
    private var cancellables = Set<AnyCancellable>()

    init() {
        updateForPowerState()
        NotificationCenter.default.publisher(for: .NSProcessInfoPowerStateDidChange)
            .sink { [weak self] _ in self?.updateForPowerState() }
            .store(in: &cancellables)
    }

    private func updateForPowerState() {
        if ProcessInfo.processInfo.isLowPowerModeEnabled {
            // Increase timer intervals, reduce frame rates
            // Defer network, stop non-critical location
        }
    }
}
```

#### Thermal State Response

```swift
NotificationCenter.default.addObserver(
    self, selector: #selector(thermalStateChanged),
    name: ProcessInfo.thermalStateDidChangeNotification, object: nil
)

@objc private func thermalStateChanged() {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: restoreFullFunctionality()
    case .fair: reduceNonEssentialWork()
    case .serious: suspendBackgroundTasks(); reduceAnimationQuality()
    case .critical: minimizeAllActivity()
    @unknown default: break
    }
}
```

### Part 8: MetricKit Energy Monitoring

```swift
import MetricKit

class MetricsManager: NSObject, MXMetricManagerSubscriber {
    func startMonitoring() { MXMetricManager.shared.add(self) }

    func didReceive(_ payloads: [MXMetricPayload]) {
        for payload in payloads {
            if let cpu = payload.cpuMetrics {
                logMetric("cpu_foreground", value: cpu.cumulativeCPUTime)
            }
            if let location = payload.locationActivityMetrics {
                logMetric("background_location", value: location.cumulativeBackgroundLocationTime)
            }
            if let network = payload.networkTransferMetrics {
                logMetric("cellular_upload", value: network.cumulativeCellularUpload)
                logMetric("cellular_download", value: network.cumulativeCellularDownload)
            }
            if let disk = payload.diskIOMetrics {
                logMetric("disk_writes", value: disk.cumulativeLogicalWrites)
            }
            if let gpu = payload.gpuMetrics {
                logMetric("gpu_time", value: gpu.cumulativeGPUTime)
            }
        }
    }
}
```

Xcode Organizer > Battery Usage categories: Audio, Networking, Processing (CPU + GPU), Display, Bluetooth, Location, Camera, Torch, NFC, Other.

### Part 9: Push Notification APIs

#### Registration

```swift
import UserNotifications

UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in }
UIApplication.shared.registerForRemoteNotifications()

// AppDelegate
func application(_ app: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
    let tokenString = token.map { String(format: "%02.2hhx", $0) }.joined()
    sendTokenToServer(tokenString)
}
```

#### Background Push Handler

```swift
func application(_ application: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                 fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    guard let aps = userInfo["aps"] as? [String: Any],
          aps["content-available"] as? Int == 1 else {
        completionHandler(.noData); return
    }
    Task {
        do {
            let hasNewData = try await fetchLatestContent()
            completionHandler(hasNewData ? .newData : .noData)
        } catch { completionHandler(.failed) }
    }
}
```

#### Server Payloads

```json
// Alert (user-visible)
{ "aps": { "alert": { "title": "New Message", "body": "From John" }, "sound": "default" } }

// Background (silent)
{ "aps": { "content-available": 1 }, "update_type": "new_content" }
```

#### Push Priority

| Priority | Header | Use Case |
|----------|--------|----------|
| High (10) | `apns-priority: 10` | Time-sensitive alerts |
| Low (5) | `apns-priority: 5` | Deferrable updates (energy efficient) |

### Power Profiler Recording

#### Tethered (with Mac)

```
1. Connect iPhone wirelessly (Xcode > Window > Devices and Simulators > Connect via network)
2. Xcode > Product > Profile (Cmd+I) > Blank template
3. "+" > Add "Power Profiler" (optionally "CPU Profiler")
4. Select app > Record > Use normally 2-3 min > Stop
5. Expand track: CPU, GPU, Display, Network lanes
```

#### On-Device (without Mac, WWDC25-226)

```
1. Settings > Developer Mode > Enable
2. Settings > Developer > Performance Trace > Enable
3. Control Center > Add Performance Trace shortcut
4. Record up to 10 hours > Share via AirDrop
```

---

## Diagnostics

### Expert Review Checklist (50 items)

**Timers (10)**: Tolerance >= 10%, invalidated in deinit, no background timers, Combine preferred, no sub-second without justification, event-driven considered, no sync via polling, invalidated before recreating, clear stop condition, background usage justified.

**Network (10)**: waitsForConnectivity, allowsExpensiveNetworkAccess appropriate, allowsConstrainedNetworkAccess appropriate, discretionary for non-urgent, push not poll, batched requests, compressed payloads, background URLSession for large transfers, exponential backoff, connection reuse.

**Location (10)**: Accuracy appropriate, distanceFilter set, updates stopped when done, pausesLocationUpdatesAutomatically = true, background only if essential, significant-change for background, CLMonitor for regions, permission matches need, stationary detection used, icon explained to users.

**Background (10)**: endBackgroundTask called promptly, expiration handlers implemented, requiresExternalPower when possible, EMRCA followed, modes limited, audio deactivated when idle, progress saved incrementally, within time limits, Low Power Mode checked, thermal monitored.

**Display/GPU (10)**: Dark Mode supported, animations stop when hidden, frame rates appropriate, secondary animations lower priority, blur minimized, Metal frame limiting, brightness-independent design, no hidden animations, GPU visibility checks, ProMotion considered.

---

## Related

**WWDC**: 2019-417, 2019-707, 2020-10095, 2022-10083, 2025-226, 2025-227

**Docs**: /documentation/backgroundtasks, /documentation/corelocation, /documentation/metrickit, /documentation/usernotifications

**Skills**: ax-energy, ax-performance, ax-networking
