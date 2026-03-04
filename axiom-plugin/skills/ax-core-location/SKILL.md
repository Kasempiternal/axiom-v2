---
name: ax-core-location
description: Core Location authorization, monitoring, geofencing, background location, geocoding, and Core Spotlight indexing patterns for iOS
license: MIT
---

# Core Location & Spotlight

## Quick Patterns

```swift
// LOCATION UPDATES (iOS 17+)
Task {
    for try await update in CLLocationUpdate.liveUpdates() {
        if update.authorizationDenied { showManualPicker(); break }
        if update.isStationary { saveLastLocation(update.location); continue }
        if let loc = update.location { process(loc) }
    }
}

// DECLARATIVE AUTH (iOS 18+)
let session = CLServiceSession(authorization: .whenInUse)
// For precise location:
let navSession = CLServiceSession(authorization: .whenInUse, fullAccuracyPurposeKey: "Nav")

// GEOFENCING (iOS 17+)
let monitor = await CLMonitor("Fences")
await monitor.add(
    CLMonitor.CircularGeographicCondition(center: coord, radius: 100),
    identifier: "Target"
)
for try await event in monitor.events {
    if event.state == .satisfied { handleEntry(event.identifier) }
}

// BACKGROUND LOCATION
var bgSession: CLBackgroundActivitySession?  // must be property, not local
bgSession = CLBackgroundActivitySession()    // start from foreground

// GEOCODING
let placemarks = try await CLGeocoder().reverseGeocodeLocation(location)
let city = placemarks.first?.locality

// CORE SPOTLIGHT INDEXING
let attrs = CSSearchableItemAttributeSet(contentType: .item)
attrs.title = "Order #1234"
attrs.contentDescription = "Medium latte"
attrs.keywords = ["coffee", "latte"]
let item = CSSearchableItem(uniqueIdentifier: "order-1234", domainIdentifier: "orders", attributeSet: attrs)
CSSearchableIndex.default().indexSearchableItems([item])

// NSUSERACTIVITY (current screen)
let activity = NSUserActivity(activityType: "com.app.viewOrder")
activity.title = order.name
activity.isEligibleForSearch = true
activity.isEligibleForPrediction = true
activity.persistentIdentifier = order.id.uuidString
activity.becomeCurrent()
```

## Decision Tree

```
Location task?
|
+-- Need user's position?
|   +-- Continuous tracking? --> CLLocationUpdate.liveUpdates()
|   |   +-- Navigation --> .automotiveNavigation or .otherNavigation
|   |   +-- Fitness --> .fitness
|   |   +-- General --> .default (or omit)
|   +-- One-time location? --> liveUpdates(), take first, cancel Task
|
+-- Geofencing (entry/exit)?
|   --> CLMonitor with CircularGeographicCondition (max 20 conditions)
|   --> Minimum ~100m radius for reliability
|
+-- Beacon proximity?
|   --> CLMonitor with BeaconIdentityCondition
|
+-- Background location?
|   --> CLBackgroundActivitySession (hold as property, start from foreground)
|   --> Background Modes capability: Location updates
|   --> .whenInUse works with CLBackgroundActivitySession (blue indicator)
|
+-- Authorization strategy?
|   +-- Start with .whenInUse (5-10% denial rate)
|   +-- Upgrade to .always only when user triggers background feature
|   +-- NEVER request .always on first launch (30-60% denial rate)
|
+-- Location not working?
    +-- Check authorizationStatus (not .denied or .restricted?)
    +-- Check locationServicesEnabled() system-wide
    +-- Check Info.plist usage description keys present
    +-- Check Task not cancelled/deallocated
    +-- Background: CLBackgroundActivitySession held? Started from foreground?
    +-- Geofence: < 20 conditions? Radius >= 100m? Awaiting monitor.events?

Spotlight / content indexing?
|
+-- Index all app content --> CSSearchableItem (batch)
+-- Current screen activity --> NSUserActivity
+-- App Intents entity --> IndexedEntity + CSSearchableItem(appEntity:)
+-- Handoff between devices --> NSUserActivity.isEligibleForHandoff
```

## Anti-Patterns

```swift
// WRONG: requesting Always auth on first launch (30-60% denial)
manager.requestAlwaysAuthorization()

// CORRECT: start with When In Use, upgrade when user needs background feature
CLServiceSession(authorization: .whenInUse)
// later, when user creates geofence reminder:
CLServiceSession(authorization: .always)
```

```swift
// WRONG: continuous updates for geofencing (10x battery drain)
for try await update in CLLocationUpdate.liveUpdates() {
    if isNearTarget(update.location) { trigger() }
}

// CORRECT: system-managed geofencing
let monitor = await CLMonitor("Fences")
await monitor.add(CLMonitor.CircularGeographicCondition(center: c, radius: 100), identifier: "t")
for try await event in monitor.events { ... }
```

```swift
// WRONG: ignoring stationary detection (wasted battery)
for try await update in CLLocationUpdate.liveUpdates() { process(update.location) }

// CORRECT: check stationary state
for try await update in CLLocationUpdate.liveUpdates() {
    if update.isStationary { saveLastLocation(update.location); continue }
    if let loc = update.location { process(loc) }
}
```

```swift
// WRONG: no denial handling (silent failure)
for try await update in CLLocationUpdate.liveUpdates() {
    guard let loc = update.location else { continue }
}

// CORRECT: handle denial gracefully
for try await update in CLLocationUpdate.liveUpdates() {
    if update.authorizationDenied { showManualLocationPicker(); break }
    if update.authorizationDeniedGlobally { showLocationDisabledMessage(); break }
    if let loc = update.location { process(loc) }
}
```

```swift
// WRONG: never stopping updates (battery drain, location icon persists)
func viewDidLoad() {
    Task { for try await update in CLLocationUpdate.liveUpdates() { ... } }
}

// CORRECT: cancel when done
var locationTask: Task<Void, Error>?
func startTracking() {
    locationTask = Task { for try await update in CLLocationUpdate.liveUpdates() { ... } }
}
func stopTracking() { locationTask?.cancel(); locationTask = nil }
```

```swift
// WRONG: local variable deallocates immediately
func startTracking() {
    let session = CLBackgroundActivitySession()  // dies at end of function!
}

// CORRECT: hold as property
var bgSession: CLBackgroundActivitySession?
func startTracking() { bgSession = CLBackgroundActivitySession() }
```

```swift
// WRONG: navigation accuracy for weather app
CLLocationUpdate.liveUpdates(.automotiveNavigation)

// CORRECT: match accuracy to need
CLLocationUpdate.liveUpdates(.default)  // weather/city-level
```

```swift
// WRONG: index items one at a time
for order in orders { CSSearchableIndex.default().indexSearchableItems([order.item]) }

// CORRECT: batch index
CSSearchableIndex.default().indexSearchableItems(orders.map { $0.item })
```

## Deep Patterns

### CLLocationUpdate (iOS 17+)

```swift
// Configurations
CLLocationUpdate.liveUpdates()                    // default
CLLocationUpdate.liveUpdates(.automotiveNavigation) // ~5m, highest battery
CLLocationUpdate.liveUpdates(.otherNavigation)      // walking/cycling
CLLocationUpdate.liveUpdates(.fitness)              // ~10m
CLLocationUpdate.liveUpdates(.airborne)             // airplane apps

// Key properties
update.location                    // CLLocation? (nil if unavailable)
update.isStationary                // device stopped moving
update.authorizationDenied         // user denied
update.authorizationDeniedGlobally // location services off system-wide
update.accuracyLimited             // reduced accuracy (~15-20 min updates)
update.locationUnavailable         // cannot determine location
update.insufficientlyInUse         // can't request auth (not foreground)
```

Automatic pause/resume: when device becomes stationary, final update has `isStationary = true`, updates pause to save battery, resume when device moves.

### CLServiceSession (iOS 18+)

Declarative authorization -- tell Core Location what you need.

```swift
CLServiceSession(authorization: .whenInUse)
CLServiceSession(authorization: .always)
CLServiceSession(authorization: .whenInUse, fullAccuracyPurposeKey: "NavPurpose")

// Diagnostics
for try await diag in session.diagnostics {
    if diag.authorizationDenied { handleDenial() }
    if diag.authorizationDeniedGlobally { handleGlobalDisabled() }
    if diag.insufficientlyInUse { /* not in foreground */ }
    if diag.alwaysAuthorizationDenied { handleAlwaysDenied() }
}
```

Layer sessions (don't replace): base session + navigation session active simultaneously.

Implicit sessions: iterating `liveUpdates()` or `monitor.events` creates implicit `.whenInUse` session. Disable with `NSLocationRequireExplicitServiceSession = true` in Info.plist.

### CLMonitor (Geofencing, iOS 17+)

```swift
let monitor = await CLMonitor("MyMonitor")

// Geographic condition
let geo = CLMonitor.CircularGeographicCondition(
    center: CLLocationCoordinate2D(latitude: 37.33, longitude: -122.01),
    radius: 100  // meters, minimum ~100m effective
)
await monitor.add(geo, identifier: "ApplePark")
await monitor.add(geo, identifier: "Work", assuming: .unsatisfied)

// Beacon condition
CLMonitor.BeaconIdentityCondition(uuid: myUUID)
CLMonitor.BeaconIdentityCondition(uuid: myUUID, major: 100)
CLMonitor.BeaconIdentityCondition(uuid: myUUID, major: 100, minor: 5)

// Await events (REQUIRED -- events only become lastEvent after handling)
for try await event in monitor.events {
    switch event.state {
    case .satisfied: handleEntry(event.identifier)
    case .unsatisfied: handleExit(event.identifier)
    case .unknown: break
    @unknown default: break
    }
}

// Check state
if let record = await monitor.record(for: "ApplePark") {
    print("State: \(record.lastEvent.state)")
}
let allIds = await monitor.identifiers
await monitor.remove("ApplePark")
```

**Constraints**: max 20 conditions per app. Min ~100m radius. One monitor instance per name. Reinitialize with same name on app launch. Entry timing: seconds to minutes. Exit: 3-5 minutes.

### Dynamic Region Management (20-Region Limit)

```swift
func updateMonitored(userLocation: CLLocation) async {
    let nearby = fetchNearbyPOIs(around: userLocation, limit: 20)
    for id in await monitor.identifiers {
        if !nearby.contains(where: { $0.id == id }) { await monitor.remove(id) }
    }
    for poi in nearby {
        await monitor.add(
            CLMonitor.CircularGeographicCondition(center: poi.coordinate, radius: 100),
            identifier: poi.id
        )
    }
}
```

### Background Location

Requirements:
1. Background Modes capability: Location updates
2. `CLBackgroundActivitySession` created AND held as property
3. Session started from foreground

```swift
var bgSession: CLBackgroundActivitySession?

func startBackgroundTracking() {
    bgSession = CLBackgroundActivitySession()  // must be in foreground
    Task {
        for try await update in CLLocationUpdate.liveUpdates() { process(update) }
    }
}

func stopBackgroundTracking() {
    bgSession?.invalidate()
    bgSession = nil
}
```

Blue status bar appears with When In Use + CLBackgroundActivitySession.

**Relaunch recovery**: persist "was tracking" state, recreate session in `didFinishLaunchingWithOptions`.

### Authorization Reference

| Status | Description |
|--------|-------------|
| `.notDetermined` | User hasn't decided |
| `.restricted` | Parental controls |
| `.denied` | User refused |
| `.authorizedWhenInUse` | Foreground + background with indicator |
| `.authorizedAlways` | Full background |

Accuracy: `.fullAccuracy` (precise) vs `.reducedAccuracy` (~5km, updates every 15-20 min).

### Info.plist Keys

```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>Show restaurants within walking distance</string>

<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Send reminders when you arrive at saved places</string>

<!-- Optional: default to reduced accuracy -->
<key>NSLocationDefaultAccuracyReduced</key>
<true/>

<!-- For temporary full accuracy -->
<key>NSLocationTemporaryUsageDescriptionDictionary</key>
<dict>
    <key>NavPurpose</key>
    <string>Precise location enables turn-by-turn directions</string>
</dict>

<!-- Background location -->
<key>UIBackgroundModes</key>
<array><string>location</string></array>
```

### Geocoding

```swift
let geocoder = CLGeocoder()

// Forward: address to coordinate
let placemarks = try await geocoder.geocodeAddressString("1 Apple Park Way")
let location = placemarks.first?.location

// Reverse: coordinate to address
let placemarks = try await geocoder.reverseGeocodeLocation(location)
let pm = placemarks.first
// pm.thoroughfare, pm.locality, pm.administrativeArea, pm.postalCode, pm.country
```

Rate limits: one request at a time, cache results, add delays between sequential requests. Cancel previous: `geocoder.cancelGeocode()`.

### Legacy CLLocationManager (iOS 12-16)

```swift
class LocationManager: NSObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 10
    }
    func start() { manager.startUpdatingLocation() }
    func stop() { manager.stopUpdatingLocation() }
    func locationManager(_ m: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let loc = locs.last else { return }
    }
}
```

Legacy accuracy: `kCLLocationAccuracyBestForNavigation` (~5m), `kCLLocationAccuracyBest` (~10m), `kCLLocationAccuracyHundredMeters`, `kCLLocationAccuracyKilometer`, `kCLLocationAccuracyThreeKilometers`.

### Core Spotlight: CSSearchableItem

```swift
import CoreSpotlight

let attrs = CSSearchableItemAttributeSet(contentType: .item)
attrs.title = "Medium Latte Order"
attrs.contentDescription = "Ordered on December 12"
attrs.keywords = ["coffee", "latte", "order"]
attrs.thumbnailData = imageData
attrs.contentCreationDate = Date()
attrs.rating = NSNumber(value: 5)

let item = CSSearchableItem(
    uniqueIdentifier: order.id.uuidString,
    domainIdentifier: "orders",
    attributeSet: attrs
)
item.expirationDate = Date().addingTimeInterval(365 * 86400)

// Batch index (100-500 items per call)
CSSearchableIndex.default().indexSearchableItems(items)

// Delete by identifier
CSSearchableIndex.default().deleteSearchableItems(withIdentifiers: ["id1"])
// Delete by domain
CSSearchableIndex.default().deleteSearchableItems(withDomainIdentifiers: ["orders"])
// Delete all
CSSearchableIndex.default().deleteAllSearchableItems { _ in }
```

### Core Spotlight: App Entity Integration

```swift
struct OrderEntity: AppEntity, IndexedEntity {
    var id: UUID
    @Property(title: "Coffee", indexingKey: \.title) var coffeeName: String
}

let item = CSSearchableItem(appEntity: orderEntity)
CSSearchableIndex.default().indexSearchableItems([item])
```

### NSUserActivity (Current Screen)

```swift
let activity = NSUserActivity(activityType: "com.app.viewOrder")
activity.title = order.coffeeName
activity.isEligibleForSearch = true
activity.isEligibleForPrediction = true
activity.isEligibleForHandoff = true
activity.persistentIdentifier = order.id.uuidString
activity.appEntityIdentifier = order.id.uuidString  // App Intents

let attrs = CSSearchableItemAttributeSet(contentType: .item)
attrs.title = order.coffeeName
activity.contentAttributeSet = attrs
activity.becomeCurrent()
self.userActivity = activity  // maintain strong reference

// SwiftUI
.userActivity("com.app.viewOrder") { activity in
    activity.title = order.coffeeName
    activity.isEligibleForSearch = true
}

// Continuation (handle Spotlight taps)
.onContinueUserActivity("com.app.viewOrder") { activity in
    if let id = activity.persistentIdentifier { navigateTo(id) }
}

// Deletion
NSUserActivity.deleteSavedUserActivities(withPersistentIdentifiers: ["id"])
```

Use NSUserActivity for current screen + Siri predictions. Use CSSearchableItem for batch indexing all content.

## Diagnostics

### Location Updates Never Arrive

1. `CLLocationManager().authorizationStatus` -- must be `.authorizedWhenInUse` or `.authorizedAlways`
2. `CLLocationManager.locationServicesEnabled()` -- must be `true`
3. Info.plist has `NSLocationWhenInUseUsageDescription` (missing = silent failure)
4. Task is alive (stored as property, not local variable)
5. Check `update.locationUnavailable` (indoors, airplane mode)
6. Check `update.authorizationDenied` / `update.authorizationDeniedGlobally`

### Background Location Not Working

1. Background Modes capability: Location updates checked
2. `CLBackgroundActivitySession` stored as **property** (not local variable)
3. Session created while app in **foreground**
4. On relaunch: recreate session if was tracking
5. `.whenInUse` works with `CLBackgroundActivitySession` (blue indicator)

### Geofence Not Triggering

1. Condition count <= 20 (`await monitor.identifiers.count`)
2. Radius >= 100m
3. Always awaiting `monitor.events` (events only become lastEvent after handling)
4. Monitor reinitialized with same name on app launch
5. Check `lastEvent.accuracyLimited` (reduced accuracy prevents geofencing)
6. Check `lastEvent.conditionLimitExceeded`

### Location Accuracy Poor

1. Check `accuracyAuthorization` -- `.reducedAccuracy` = ~5km
2. Check `update.accuracyLimited`
3. Check `location.horizontalAccuracy` -- negative means invalid
4. Use appropriate LiveConfiguration for use case
5. Request temporary full accuracy with `fullAccuracyPurposeKey`

### Location Icon Won't Disappear

1. Cancel location Task: `locationTask?.cancel()`
2. Invalidate background session: `bgSession?.invalidate()`
3. Remove CLMonitor conditions
4. Stop legacy APIs: `manager.stopUpdatingLocation()`
5. Check MapKit `showsUserLocation`

### Spotlight Items Not Appearing

1. Wait 1-2 minutes for indexing
2. Verify `isEligibleForSearch = true`
3. Check Settings > Siri & Search > App > Show App in Search
4. Provide rich metadata (title, description, keywords)
5. Set expiration dates

### Console Filtering

```bash
log stream --predicate 'subsystem == "com.apple.locationd"' --level debug
log stream --predicate 'subsystem == "com.apple.CoreLocation"' --level debug
```

## Related

- **ax-privacy** -- Permission request UX, deep links to Settings
- **ax-energy** -- Location battery impact, accuracy vs power tradeoff
- **ax-background-tasks** -- BGTaskScheduler for non-location background work
- **ax-app-intents** -- App Intents, IndexedEntity, App Shortcuts
