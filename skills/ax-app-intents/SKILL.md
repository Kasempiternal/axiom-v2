---
name: ax-app-intents
description: "App Intents for Siri/Shortcuts, parameterized intents, discovery."
license: MIT
metadata:
  version: "1.0.0"
---

# App Intents & App Shortcuts

Expose app functionality to Siri, Apple Intelligence, Shortcuts, Spotlight, Action Button, Control Center, widgets, and Live Activities. Covers AppIntent, AppEntity, AppEnum, AppShortcutsProvider, parameterized phrases, IndexedEntity, assistant schemas, and discovery UI.

## Quick Patterns

### AppIntent — Define an Action

```swift
struct OrderSoupIntent: AppIntent {
    static var title: LocalizedStringResource = "Order Soup"
    static var description: IntentDescription = "Orders soup from the restaurant"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Soup")
    var soup: SoupEntity

    @Parameter(title: "Quantity")
    var quantity: Int?

    static var parameterSummary: some ParameterSummary {
        Summary("Order \(\.$quantity) \(\.$soup)")
    }

    func perform() async throws -> some IntentResult {
        guard let quantity, quantity > 0 else {
            throw $quantity.needsValue("How many soups?")
        }
        try await OrderService.shared.order(soup: soup, quantity: quantity)
        return .result(dialog: "Ordered \(quantity) \(soup.name)")
    }
}
```

### AppEntity — Represent App Content

```swift
struct SoupEntity: AppEntity {
    var id: String
    var name: String
    var price: Decimal

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Soup"
    static var defaultQuery = SoupQuery()

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(name)", subtitle: "$\(price)")
    }
}

struct SoupQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [SoupEntity] {
        try await SoupService.shared.fetch(ids: identifiers)
    }
    func suggestedEntities() async throws -> [SoupEntity] {
        try await SoupService.shared.popular(limit: 10)
    }
}
```

### AppEnum — Enumeration Parameters

```swift
enum SoupSize: String, AppEnum {
    case small, medium, large

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Size"
    static var caseDisplayRepresentations: [SoupSize: DisplayRepresentation] = [
        .small: "Small (8 oz)", .medium: "Medium (12 oz)", .large: "Large (16 oz)"
    ]
}
```

### AppShortcutsProvider — Instant Discovery

```swift
struct MyAppShortcuts: AppShortcutsProvider {
    static var shortcutTileColor: ShortcutTileColor = .teal

    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        // Generic (asks for params)
        AppShortcut(
            intent: OrderSoupIntent(),
            phrases: ["Order soup in \(.applicationName)"],
            shortTitle: "Order Soup",
            systemImageName: "cup.and.saucer.fill"
        )
        // Parameterized (skips clarification)
        AppShortcut(
            intent: OrderSoupIntent(soup: .tomato, quantity: 1),
            phrases: ["Order tomato soup in \(.applicationName)"],
            shortTitle: "Tomato Soup",
            systemImageName: "flame.fill"
        )
    }

    // iOS 17+ — prevent false triggers
    static var negativePhrases: [NegativeAppShortcutPhrase] {
        NegativeAppShortcutPhrases {
            "Cancel soup order"
            "Stop ordering"
        }
    }
}
```

### Entity String Search

```swift
extension SoupQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [SoupEntity] {
        try await SoupService.shared.search(query: string)
    }
}
```

### Confirmation for Destructive Actions

```swift
func perform() async throws -> some IntentResult {
    try await requestConfirmation(
        result: .result(dialog: "Delete '\(task.title)'?"),
        confirmationActionName: .init(stringLiteral: "Delete")
    )
    try await TaskService.shared.delete(task: task)
    return .result(dialog: "Task deleted")
}
```

### Foreground Continuation with opensIntent

```swift
struct CreateEventIntent: AppIntent {
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        let event = try await EventService.shared.create(title: title)
        return .result(
            value: EventEntity(from: event),
            opensIntent: OpenEventIntent(event: EventEntity(from: event))
        )
    }
}

struct OpenEventIntent: AppIntent {
    static var openAppWhenRun: Bool = true
    @Parameter(title: "Event") var event: EventEntity

    func perform() async throws -> some IntentResult {
        await MainActor.run { EventCoordinator.shared.show(event.id) }
        return .result()
    }
}
```

---

## Decision Tree

```
Starting App Intents integration?
├── Need action available in Siri/Shortcuts?
│   ├── Simple action, no parameters → AppIntent + AppShortcut (basic phrases)
│   ├── Action with entity parameter → AppIntent + AppEntity + EntityQuery
│   ├── Action with enum parameter → AppIntent + AppEnum
│   └── Common combos users repeat → Parameterized AppShortcut (skip clarification)
├── Need content searchable in Spotlight/Shortcuts?
│   ├── Small bounded list → EnumerableEntityQuery (allEntities)
│   ├── Large/unbounded list → EntityQuery + suggestedEntities + EntityStringQuery
│   └── Already using Spotlight → IndexedEntity (auto-generates Find action)
├── Need instant discovery (no user setup)?
│   └── AppShortcutsProvider with 3-5 core shortcuts
├── Need Apple Intelligence model integration?
│   └── Expose @Property on entities + use AttributedString for rich text
├── Need assistant schema (books/email/photos)?
│   └── Adopt pre-built schema protocol (BooksOpenBookIntent, etc.)
├── Need to prevent false Siri triggers?
│   └── NegativeAppShortcutPhrase (iOS 17+)
├── Need to promote shortcuts in UI?
│   ├── After action completion → SiriTipView
│   └── Settings/help screen → ShortcutsLink
└── Running on macOS?
    ├── Spotlight shows intents if all required params in parameterSummary
    └── Automations work automatically (no extra code)
```

---

## Anti-Patterns

### Coupling models to AppEntity

```swift
// BAD: Core model conforms to AppEntity
struct Book: AppEntity { ... }

// GOOD: Separate entity wrapping model
struct BookEntity: AppEntity {
    init(from book: Book) { self.id = book.id; self.title = book.title }
}
```

### Returning all entities as suggestions

```swift
// BAD: Could be thousands
func suggestedEntities() async throws -> [TaskEntity] {
    try await TaskService.shared.allTasks()
}

// GOOD: Recent/relevant subset
func suggestedEntities() async throws -> [TaskEntity] {
    try await TaskService.shared.recentTasks(limit: 10)
}
```

### Using String instead of AttributedString for model output

```swift
// BAD: Loses rich text from Apple Intelligence
@Parameter(title: "Content") var content: String

// GOOD: Preserves bold, lists, tables
@Parameter(title: "Content") var content: AttributedString
```

### Too many App Shortcuts

```swift
// BAD: Combinatorial explosion
for size in CoffeeSize.allCases {
    for type in CoffeeType.allCases {
        AppShortcut(intent: OrderIntent(type: type, size: size), ...)
    }
}

// GOOD: Generic + 2-3 common parameterized cases
AppShortcut(intent: OrderIntent(), ...)           // Generic
AppShortcut(intent: OrderIntent(type: .latte), ...)  // Common case
```

### Accessing MainActor from background intent

```swift
// BAD: Crash when openAppWhenRun = false
func perform() async throws -> some IntentResult {
    UIApplication.shared.open(url) // MainActor only!
}

// GOOD: Wrap in MainActor or use opensIntent
func perform() async throws -> some IntentResult {
    await MainActor.run { UIApplication.shared.open(url) }
    return .result()
}
```

### Missing parameterSummary required params (macOS Spotlight)

```swift
// BAD: Won't appear in Spotlight — notes is required but not in summary
@Parameter(title: "Notes") var notes: String
static var parameterSummary: some ParameterSummary {
    Summary("Create '\(\.$title)'")  // Missing notes!
}

// GOOD: Make optional, provide default, or include in summary
@Parameter(title: "Notes") var notes: String?  // Option 1: optional
@Parameter(title: "Notes") var notes: String = ""  // Option 2: default
```

### Long complex Siri phrases

```swift
// BAD: Too wordy, users won't remember
"I would like to order a coffee from \(.applicationName) please"

// GOOD: 3-6 words, verb-first
"Order coffee in \(.applicationName)"
```

---

## Deep Patterns

### IndexedEntity — Auto-Generated Find Actions

Adopt `IndexedEntity` to auto-generate Find actions from Spotlight integration. Maps `@Property` to Spotlight attributes via indexing keys.

```swift
struct EventEntity: AppEntity, IndexedEntity {
    var id: UUID

    @Property(title: "Title", indexingKey: \.eventTitle)
    var title: String

    @Property(title: "Start Date", indexingKey: \.startDate)
    var startDate: Date

    @Property(title: "Notes", customIndexingKey: "eventNotes")
    var notes: String?

    static var typeDisplayRepresentation: TypeDisplayRepresentation = "Event"

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(startDate.formatted())")
    }
}
// Users get: "Find Events where Title contains 'Team' and Start Date is today"
```

**Standard indexing keys**: `\.eventTitle`, `\.startDate`, `\.endDate`, `\.eventLocation`
**Custom keys**: `customIndexingKey: "myCustomAttribute"` for non-standard attributes

### Authentication Policies

```swift
static var authenticationPolicy: IntentAuthenticationPolicy = .alwaysAllowed           // Public info
static var authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication   // Logged-in user
static var authenticationPolicy: IntentAuthenticationPolicy = .requiresLocalDeviceAuthentication  // Face ID/Touch ID
```

### Entity Property Exposure for Apple Intelligence

Models receive JSON of exposed `@Property` values + `displayRepresentation` + `typeDisplayRepresentation`. Expose all properties you want the model to reason over.

Output types from Use Model action: Text (AttributedString), Number, Boolean, Dictionary, Date, App Entities. The runtime auto-converts types when connected to If/other actions.

### Assistant Schemas

Pre-built intent protocols for common app categories:

| Schema | Use Cases |
|--------|-----------|
| BooksIntents | Navigate pages, open books, play audiobooks |
| BrowserIntents | Bookmarks, history, window management |
| CameraIntents | Capture modes, device switching |
| EmailIntents | Draft, reply, forward, archive |
| PhotosIntents | Album/asset management, editing |
| PresentationsIntents | Slide creation, media, playback |
| SpreadsheetsIntents | Sheet management, content |
| DocumentsIntents | File management, page manipulation |

```swift
import BooksIntents

struct OpenBookIntent: BooksOpenBookIntent {
    @Parameter(title: "Book") var target: BookEntity
    func perform() async throws -> some IntentResult {
        await MainActor.run { BookReader.shared.open(book: target) }
        return .result()
    }
}
```

### PredictableIntent — Spotlight Suggestions

```swift
struct OrderCoffeeIntent: AppIntent, PredictableIntent {
    // Spotlight learns usage patterns and surfaces suggestions proactively
}
```

### Dynamic Shortcut Updates

```swift
func markAsFavorite(_ session: Session) {
    favoriteSessions.append(session)
    MeditationAppShortcuts.updateAppShortcutParameters()  // Refresh stored shortcuts
}
```

### Discovery UI Components

**SiriTipView** — show after user completes an action:

```swift
SiriTipView(intent: ReorderIntent(), isVisible: $showTip)
    .siriTipViewStyle(.dark)
```

**ShortcutsLink** — link to Shortcuts app from settings:

```swift
ShortcutsLink()  // Opens app's page in Shortcuts app
```

**ShortcutTileColor** options: `.blue`, `.grape`, `.grayBlue`, `.grayBrown`, `.grayGreen`, `.lightBlue`, `.lime`, `.navy`, `.orange`, `.pink`, `.purple`, `.red`, `.tangerine`, `.teal`, `.yellow`

### Error Handling

```swift
enum OrderError: Error, CustomLocalizedStringResourceConvertible {
    case outOfStock(itemName: String)
    case paymentFailed

    var localizedStringResource: LocalizedStringResource {
        switch self {
        case .outOfStock(let name): "Sorry, \(name) is out of stock"
        case .paymentFailed: "Payment failed. Please check your payment method"
        }
    }
}
```

---

## Diagnostics

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Intent not in Shortcuts app | `isDiscoverable = false` or missing | Set `isDiscoverable = true` (default) |
| Parameter won't resolve | Missing `defaultQuery` on entity | Add `static var defaultQuery = MyQuery()` |
| Intent crashes in background | Accessing MainActor without isolation | Wrap in `await MainActor.run {}` or set `openAppWhenRun = true` |
| Entity query returns empty | `entities(for:)` not implemented | Implement required EntityQuery methods |
| Shortcut not in Spotlight | Missing from AppShortcutsProvider | Add AppShortcut entry with phrases |
| Siri doesn't recognize phrase | Missing `\(.applicationName)` in phrase | Include app name interpolation |
| Siri triggers wrong app | Ambiguous phrases | Add NegativeAppShortcutPhrase (iOS 17+) |
| Not visible in macOS Spotlight | Required param missing from parameterSummary | Make optional, add default, or include in summary |
| App Shortcuts not updating | Data changed but shortcuts stale | Call `updateAppShortcutParameters()` |
| SiriTipView shows empty | Intent not in AppShortcutsProvider | Add intent to appShortcuts array |

---

## Related

- **ax-widgets** — WidgetKit interactive widgets, Live Activities
- **ax-app-intents** (this skill) covers both App Intents and App Shortcuts
- **ax-privacy** — Privacy manifests, deep link debugging, Spotlight indexing
- **ax-swiftui** — SwiftUI views for SiriTipView/ShortcutsLink integration
