---
name: ax-widgets
description: WidgetKit timeline providers, Live Activities, Dynamic Island, Control Center controls, interactive widgets, App Groups data sharing.
license: MIT
---
# Widgets & Extensions

## Quick Patterns

### Basic Widget (StaticConfiguration)

```swift
@main
struct MyWidget: Widget {
    let kind: String = "MyWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            MyWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("My Widget")
        .description("Shows your data")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SimpleEntry: TimelineEntry {
    let date: Date
    let data: String
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), data: "Loading...")
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> ()) {
        completion(SimpleEntry(date: Date(), data: "Preview"))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> ()) {
        let shared = UserDefaults(suiteName: "group.com.myapp")!
        let data = shared.string(forKey: "widgetData") ?? "No data"

        var entries: [SimpleEntry] = []
        for offset in 0..<8 {
            let date = Calendar.current.date(byAdding: .minute, value: offset * 15, to: Date())!
            entries.append(SimpleEntry(date: date, data: data))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}
```

### Configurable Widget (iOS 17+)

```swift
struct MyConfigurableWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(
            kind: "ConfigWidget",
            intent: SelectProjectIntent.self,
            provider: ConfigProvider()
        ) { entry in
            ProjectWidgetView(entry: entry)
        }
        .configurationDisplayName("Project Status")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct SelectProjectIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Select Project"

    @Parameter(title: "Project")
    var project: ProjectEntity?
}
```

### Interactive Widget (iOS 17+)

```swift
// Button with App Intent
Button(intent: IncrementIntent()) {
    Label("Add", systemImage: "plus.circle")
}

// Toggle with App Intent
Toggle(isOn: entry.isEnabled, intent: ToggleFeatureIntent()) {
    Text("Feature")
}

// Visual feedback during intent execution
Text(entry.status)
    .invalidatableContent() // Dims while intent runs
```

### App Groups Data Sharing

```swift
// 1. Add App Groups entitlement to BOTH app + extension targets
// 2. Main app — write
let shared = UserDefaults(suiteName: "group.com.myapp")!
shared.set("Updated", forKey: "myKey")
WidgetCenter.shared.reloadAllTimelines()

// 3. Widget — read
let shared = UserDefaults(suiteName: "group.com.myapp")!
let value = shared.string(forKey: "myKey")
```

### Live Activity

```swift
struct DeliveryAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var status: String
        var eta: Date
    }
    var orderNumber: String
}

// Start
let activity = try Activity.request(
    attributes: DeliveryAttributes(orderNumber: "123"),
    content: ActivityContent(
        state: DeliveryAttributes.ContentState(status: "Preparing", eta: .now + 1800),
        staleDate: nil
    ),
    pushType: nil // .token for push updates
)

// Update
await activity.update(ActivityContent(
    state: .init(status: "On the way", eta: .now + 600),
    staleDate: nil
))

// End
await activity.end(nil, dismissalPolicy: .default)
```

### Dynamic Island

```swift
DynamicIsland {
    DynamicIslandExpandedRegion(.leading) { Image(systemName: "box.truck") }
    DynamicIslandExpandedRegion(.trailing) { Text(context.state.status) }
    DynamicIslandExpandedRegion(.bottom) {
        Button(intent: CancelDeliveryIntent()) { Label("Cancel", systemImage: "xmark") }
    }
} compactLeading: {
    Image(systemName: "box.truck")
} compactTrailing: {
    Text(context.state.eta, style: .timer)
} minimal: {
    Image(systemName: "box.truck").foregroundStyle(.tint)
}
```

### Control Center Widget (iOS 18+)

```swift
struct LightControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "Light", provider: LightProvider()) { value in
            ControlWidgetToggle(isOn: value.isOn, action: ToggleLightIntent()) { isOn in
                Label(isOn ? "On" : "Off", systemImage: "lightbulb.fill")
                    .tint(isOn ? .yellow : .gray)
            }
        }
        .displayName("Light")
    }
}

struct LightProvider: ControlValueProvider {
    func currentValue() async throws -> LightValue {
        let isOn = try await HomeManager.shared.fetchLightState()
        return LightValue(isOn: isOn)
    }
    var previewValue: LightValue {
        LightValue(isOn: UserDefaults(suiteName: "group.com.myapp")!.bool(forKey: "lightState"))
    }
}
```

## Decision Tree

```
Widget/Extension Issue?
│
├─ Widget not in gallery?
│  ├─ supportedFamilies() missing → Add it
│  ├─ WidgetBundle missing @main → Add @main
│  └─ "Skip Install" = YES → Set to NO
│
├─ Widget shows stale/empty data?
│  ├─ Using UserDefaults.standard? → Use suiteName: "group.com.myapp"
│  ├─ App Groups in BOTH targets? → Add to extension too
│  ├─ Timeline policy .never? → Change to .atEnd
│  └─ Budget exhausted? → Increase intervals (15+ min)
│
├─ Interactive button does nothing?
│  ├─ Using action: closure? → Use intent: parameter
│  ├─ perform() returns IntentResult? → Must return .result()
│  └─ Calls reloadTimelines()? → Add after data update
│
├─ Live Activity won't start?
│  ├─ Data > 4KB? → Reduce attributes (use IDs, not objects)
│  ├─ Authorization check? → ActivityAuthorizationInfo().areActivitiesEnabled
│  └─ Too many active? → System limit ~3 simultaneous
│
├─ Live Activity won't end?
│  └─ Missing .end() call → Add with dismissalPolicy
│
├─ Control Center slow?
│  ├─ Blocking main thread? → Use ControlValueProvider
│  └─ Missing previewValue? → Add cached fallback
│
└─ watchOS Live Activity missing?
   └─ .supplementalActivityFamilies([.small]) missing
```

## Anti-Patterns

### Network Calls in Widget View
Widget views are archived snapshots — network calls won't execute reliably.
**Fix**: Fetch in TimelineProvider or prefetch in main app, save to shared container.

### UserDefaults.standard in Extension
App and extension have separate containers.
**Fix**: Always use `UserDefaults(suiteName: "group.com.myapp")`.

### Over-Refreshing (Budget Exhaustion)
Budget is 40-70 reloads/day. 1-min intervals exhaust budget in ~1 hour.
**Fix**: Use 15-60 min intervals, 8-20 entries per timeline.

### Missing Dismissal Policy
Live Activities persist indefinitely without `.end()`.
**Fix**: Always call `activity.end(content, dismissalPolicy:)` — `.immediate`, `.default` (~4hrs), or `.after(date)`.

### Exceeding 4KB Limit (Live Activities)
ActivityAttributes + ContentState combined must be < 4KB.
**Fix**: Use IDs/references not objects, asset catalog for images, minimal ContentState.

### Blocking Controls
Synchronous fetches in Control Center widgets freeze UI.
**Fix**: Use async `ControlValueProvider`, provide instant `previewValue` from cache.

## Deep Patterns

### Widget Families Reference

| Family | Size | Platform | Min iOS |
|--------|------|----------|---------|
| systemSmall | ~170×170 | iPhone/iPad | 14 |
| systemMedium | ~360×170 | iPhone/iPad | 14 |
| systemLarge | ~360×380 | iPhone/iPad | 14 |
| systemExtraLarge | ~720×380 | iPad only | 15 |
| accessoryCircular | ~48×48 | Lock Screen | 16 |
| accessoryRectangular | ~160×72 | Lock Screen | 16 |
| accessoryInline | single line | Lock Screen | 16 |

### Timeline Reload Budget

- **Daily budget**: 40-70 reloads (varies by engagement)
- **Budget-exempt**: User-initiated, app foreground, widget added, reboot
- **Strategic** (4/hr): ~48/day, recommended
- **Aggressive** (12/hr): Exhausted by 6 PM
- Reload on data changes + time events. Avoid speculative reloads.

### Push Notifications for Live Activities

```swift
// Start with push
let activity = try Activity.request(attributes: attrs, content: content, pushType: .token)

// Monitor token
for await pushToken in activity.pushTokenUpdates {
    let tokenString = pushToken.map { String(format: "%02x", $0) }.joined()
    await sendTokenToServer(activityID: activity.id, token: tokenString)
}
```

Server payload:
```json
{
  "aps": {
    "timestamp": 1633046400,
    "event": "update",
    "content-state": { "status": "Delivered", "eta": "2024-01-01T12:00:00Z" }
  }
}
```

Standard: ~10-12 pushes/hour. Frequent updates entitlement (iOS 18.2+): `com.apple.developer.activity-push-notification-frequent-updates`.

### SwiftData in Widgets (iOS 17+)

```swift
// Widget reads from shared container
let config = ModelConfiguration(url: FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.myapp"
)!.appendingPathComponent("MyApp.store"))
let container = try ModelContainer(for: MyModel.self, configurations: config)
```
Widget reads only — never write from widget. Main app reloads timelines after writes.

### Liquid Glass / Accented Rendering (iOS 18+)

```swift
.widgetAccentedRenderingMode(.accented) // System glass effects
```

### Cross-Platform Support

- **visionOS**: Use `#if os(visionOS)`, `.ornamentLevel(.default)`
- **CarPlay**: `.supplementalActivityFamilies([.medium])`
- **watchOS**: `.supplementalActivityFamilies([.small])`, `@Environment(\.activityFamily)` for layout
- **macOS**: Live Activities appear automatically in Sequoia+ menu bar

## Diagnostics

### Widget Not Appearing
1. Verify `WidgetBundle` has `@main` and includes your widget
2. Check `supportedFamilies()` is set
3. Extension target → "Skip Install" = NO
4. Clean build (Cmd+Shift+K), restart Xcode

### Data Not Syncing
```swift
// Verify shared container accessible from both targets
let container = FileManager.default.containerURL(
    forSecurityApplicationGroupIdentifier: "group.com.myapp"
)
print("Container: \(container?.path ?? "NIL")") // Must not be NIL
```
Check: Same group ID in both .entitlements files, `UserDefaults(suiteName:)` not `.standard`.

### Live Activity Size Check
```swift
let encoder = JSONEncoder()
let attrSize = try encoder.encode(attributes).count
let stateSize = try encoder.encode(state).count
print("Total: \(attrSize + stateSize) bytes") // Must be < 4096
```

### Timeline Not Refreshing
1. Add `print()` in `getTimeline()` — is it being called?
2. Check Console.app for "budget exhausted"
3. Manual test: `WidgetCenter.shared.reloadAllTimelines()`
4. Simulator doesn't enforce budget — test on device

### Pre-Release Checklist
- [ ] App Groups in BOTH targets
- [ ] Shared UserDefaults with suiteName (not .standard)
- [ ] Timeline intervals ≥ 15 min
- [ ] No network in widget views
- [ ] ActivityAttributes < 4KB
- [ ] Live Activities call .end() with dismissal policy
- [ ] Controls use ControlValueProvider
- [ ] Tested on device (simulator skips budget limits)
- [ ] Tested all supported families

## Related

For App Intents integration, load ax-app-intents. For SwiftUI layout in widgets, load ax-swiftui.
