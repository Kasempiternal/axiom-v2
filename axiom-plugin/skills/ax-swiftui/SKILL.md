---
name: ax-swiftui
description: SwiftUI views, layout, navigation, animations, gestures, architecture, state management, debugging, performance, iOS 26 Liquid Glass.
license: MIT
---
# SwiftUI

## Quick Patterns

### State Management (iOS 17+)

**Property Wrapper Decision Tree:**
```
Which wrapper?
|-- View owns the data?        --> @State
|-- App-wide shared model?     --> @Environment
|-- Need bindings to parent?   --> @Bindable
|-- Just reading passed data?  --> Plain property (no wrapper)
```

**@Observable replaces ObservableObject (iOS 17+):**
```swift
@Observable
class Model {
    var count = 0         // No @Published needed
}

// View automatically tracks accessed properties
struct MyView: View {
    @State private var model = Model()   // Owned
    // OR
    var model: Model                     // Passed in (no wrapper)
    // OR
    @Bindable var model: Model           // Need $model.count bindings
    // OR
    @Environment(Model.self) var model   // From environment
}
```

**Pre-iOS 17 (ObservableObject):**
- `@StateObject` -- view owns the instance
- `@ObservedObject` -- injected from parent
- `@EnvironmentObject` -- shared via environment

### Navigation (iOS 16+)

**NavigationStack with typed path:**
```swift
@State private var path: [Recipe] = []

NavigationStack(path: $path) {
    List(recipes) { recipe in
        NavigationLink(recipe.name, value: recipe)
    }
    .navigationDestination(for: Recipe.self) { recipe in
        RecipeDetail(recipe: recipe)
    }
}

func popToRoot() { path.removeAll() }
```

**NavigationPath for heterogeneous types + deep linking:**
```swift
@State private var path = NavigationPath()

NavigationStack(path: $path) {
    HomeView()
        .navigationDestination(for: Category.self) { CategoryView(category: $0) }
        .navigationDestination(for: Recipe.self) { RecipeDetail(recipe: $0) }
}
.onOpenURL { url in handleDeepLink(url) }

func handleDeepLink(_ url: URL) {
    path.removeLast(path.count)  // Pop to root first
    // Parse URL, append values in parent-to-child order
}
```

**TabView with per-tab stacks (iOS 18+):**
```swift
TabView {
    Tab("Home", systemImage: "house") {
        NavigationStack { HomeView() }
    }
    Tab("Search", systemImage: "magnifyingglass") {
        NavigationStack { SearchView() }
    }
}
```

**Sidebar-adaptable (iPhone tab bar, iPad sidebar):**
```swift
TabView {
    Tab("Watch Now", systemImage: "play") { WatchNowView() }
    TabSection("Collections") {
        Tab("Favorites", systemImage: "star") { FavoritesView() }
    }
    Tab(role: .search) { SearchView() }
}
.tabViewStyle(.sidebarAdaptable)
```

### Common View Patterns

**Gestures -- use @GestureState for temporary state:**
```swift
@GestureState private var dragOffset = CGSize.zero
@State private var position = CGSize.zero

Circle()
    .offset(x: position.width + dragOffset.width,
            y: position.height + dragOffset.height)
    .gesture(
        DragGesture()
            .updating($dragOffset) { value, state, _ in
                state = value.translation
            }
            .onEnded { value in
                position.width += value.translation.width
                position.height += value.translation.height
            }
    )
```

**Gesture composition:**
- `.simultaneously(with:)` -- both at same time (drag + pinch)
- `.sequenced(before:)` -- one must complete first (long press then drag)
- `.exclusively(before:)` -- only one wins (double-tap vs single-tap)

**Adaptive layout -- prefer ViewThatFits or AnyLayout over GeometryReader:**
```swift
// Pick best-fitting variant automatically
ViewThatFits {
    HStack { Image(systemName: "star"); Text("Favorite"); Spacer(); Button("Add") { } }
    VStack { HStack { Image(systemName: "star"); Text("Favorite") }; Button("Add") { } }
}

// Animated H/V switch
var layout: AnyLayout {
    sizeClass == .compact ? AnyLayout(VStackLayout()) : AnyLayout(HStackLayout())
}

// Read container size (preferred over GeometryReader)
.onGeometryChange(for: Int.self) { proxy in
    max(1, Int(proxy.size.width / 150))
} action: { newCount in
    columnCount = newCount
}
```

**App entry point -- thin shell + state controller:**
```swift
@main
struct MyApp: App {
    @State private var appState = AppStateController()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(appState)
                .task { await appState.initialize() }
        }
    }
}

struct RootView: View {
    @Environment(AppStateController.self) private var appState

    var body: some View {
        switch appState.state {
        case .loading: LaunchView()
        case .unauthenticated: AuthFlow()
        case .authenticated(let user): MainTabView(user: user)
        case .error(let error): ErrorRecoveryView(error: error)
        }
    }
}
```

---

## Decision Tree

### View Not Updating?

```
View not updating?
|-- Can reproduce in minimal preview?
|   |-- YES --> Bug in code. Check:
|   |   |-- Modified struct directly without reassignment?
|   |   |   --> Struct Mutation: reassign entire value
|   |   |-- Passed .constant() or new binding each render?
|   |   |   --> Lost Binding: use $state or @Bindable
|   |   |-- View inside if/else conditional?
|   |   |   --> Accidental Recreation: use .opacity() instead
|   |   |-- Object changed but view didn't?
|   |       --> Missing Observer: add @Observable or @StateObject
|   |-- NO --> Cache/Xcode corruption
|       --> Cmd+Opt+P, restart Xcode, nuke DerivedData
```

**Debug tool -- Self._printChanges():**
```swift
var body: some View {
    let _ = Self._printChanges()  // Debug only, never ship
    Text("Hello")
}
// Output: "MyView: @self changed" or "MyView: count changed"
```

### Navigation Broken?

```
Navigation issue?
|-- Taps don't navigate?
|   |-- NavigationLink outside NavigationStack? --> Fix hierarchy
|   |-- Button wrapping NavigationLink? --> Remove Button wrapper
|   |-- navigationDestination inside lazy container? --> Move outside
|-- State lost on tab switch?
|   --> Each tab needs its own NavigationStack
|-- State lost on background?
|   --> Add SceneStorage + Codable NavigationPath
|-- Deep link shows wrong screen?
|   --> Pop to root first, build path parent-to-child
```

### Layout Wrong?

```
Layout issue?
|-- Views overlapping in ZStack?
|   --> Control with .zIndex() or .opacity()
|-- GeometryReader takes all space?
|   --> Constrain with .frame(height:) or use onGeometryChange
|-- Content hidden behind notch?
|   --> Apply .ignoresSafeArea() on container, not children
|-- Text truncated unexpectedly?
|   --> Don't mix .frame() with .fixedSize()
|-- Modifier looks wrong?
|   --> Order matters: .cornerRadius(8).padding() not .padding().cornerRadius(8)
|-- iPad layout broken in Split View?
|   --> Use container size, not UIDevice.idiom or UIScreen.bounds
```

### Performance Slow?

```
Performance issue?
|-- Profile with Instruments (Cmd+I, SwiftUI template)
|-- SwiftUI Update Groups lane empty during slowness?
|   --> Problem outside SwiftUI (network, image loading, etc.)
|-- Long View Body Updates (orange/red bars)?
|   --> Expensive work in body:
|       |-- Formatter creation? --> Cache in model, create once
|       |-- Complex calculation? --> Move to model, cache result
|       |-- Synchronous I/O? --> Load async with .task {}
|-- Too many view updates?
|   --> Use Cause & Effect Graph:
|       |-- All list items update on single change?
|       |   --> Granular per-item view models
|       |-- Environment value changing frequently?
|           --> Use direct parameter instead
```

---

## Anti-Patterns

### State & Binding

```swift
// WRONG: Direct struct mutation
@State var items: [String] = []
items.append("new")  // SwiftUI doesn't see this

// RIGHT: Reassign or mutate through index
if let i = items.firstIndex(where: { $0.id == id }) {
    items[i].isComplete.toggle()
}
```

```swift
// WRONG: .constant() binding is read-only
TextField("Name", text: .constant(name))

// RIGHT: Pass actual binding
TextField("Name", text: $name)
```

```swift
// WRONG: @State for passed-in models (creates copy)
struct DetailView: View {
    @State var item: Item  // Loses parent changes
}

// RIGHT: No wrapper for read, @Bindable for write
struct DetailView: View {
    let item: Item            // Read only
    @Bindable var item: Item  // Need $item bindings
}
```

### Navigation

```swift
// WRONG: Deprecated NavigationView
NavigationView { List { ... } }

// RIGHT: NavigationStack (iOS 16+)
NavigationStack { List { ... } }
```

```swift
// WRONG: View-based NavigationLink (can't programmatically control)
NavigationLink("Recipe") { RecipeDetail(recipe: recipe) }

// RIGHT: Value-based NavigationLink
NavigationLink(recipe.name, value: recipe)
```

```swift
// WRONG: navigationDestination inside lazy container
LazyVGrid(columns: columns) {
    ForEach(items) { item in
        NavigationLink(value: item) { ... }
            .navigationDestination(for: Item.self) { ... }  // May not load
    }
}

// RIGHT: Place outside lazy container
LazyVGrid(columns: columns) { ForEach(items) { ... } }
.navigationDestination(for: Item.self) { ItemDetail(item: $0) }
```

```swift
// WRONG: Shared NavigationStack across tabs
TabView {
    Tab("Home") { HomeView() }   // All share one stack
    Tab("Settings") { SettingsView() }
}

// RIGHT: Per-tab stacks
TabView {
    Tab("Home") { NavigationStack { HomeView() } }
    Tab("Settings") { NavigationStack { SettingsView() } }
}
```

### Architecture

```swift
// WRONG: Logic in view body
var body: some View {
    let formatter = NumberFormatter()  // Created every render
    formatter.numberStyle = .currency
    let sorted = products.sorted { $0.price > $1.price }  // Every render
    return List(sorted) { Text(formatter.string(from: $0.price)!) }
}

// RIGHT: Extract to model/ViewModel
@Observable
class ProductListViewModel {
    let products: [Product]
    private let formatter = NumberFormatter()  // Created once
    var sortedProducts: [Product] { products.sorted { $0.price > $1.price } }
    func formattedPrice(_ p: Product) -> String {
        formatter.string(from: p.price as NSNumber) ?? "$0.00"
    }
}
```

```swift
// WRONG: Boolean soup for app state
var isLoading = true; var isLoggedIn = false; var hasError = false
// What if isLoading && isLoggedIn && hasError are all true?

// RIGHT: Enum-based state machine
enum AppState { case loading, unauthenticated, authenticated(User), error(AppError) }
```

```swift
// WRONG: God ViewModel with 50+ properties
// RIGHT: Split by concern into focused ViewModels
```

### Layout

```swift
// WRONG: Device checks for layout
if UIDevice.current.userInterfaceIdiom == .pad { useWideLayout() }
// iPad in 1/3 Split View is narrower than iPhone Pro Max landscape

// RIGHT: Respond to container size
.onGeometryChange(for: Bool.self) { proxy in
    proxy.size.width > proxy.size.height * 1.2
} action: { isWide = $0 }
```

```swift
// WRONG: UIScreen.main.bounds (returns full screen, not your window)
// WRONG: UIDevice.orientationDidChangeNotification (reports device, not window)
// RIGHT: onGeometryChange or ViewThatFits
```

### Performance

```swift
// WRONG: Formatter created in view body (expensive, every render)
// RIGHT: Cache in model, create once

// WRONG: Synchronous I/O in view body
let data = try? Data(contentsOf: fileURL)
// RIGHT: .task { data = try? await loadData() }

// WRONG: Frequently-changing environment values
.environment(\.scrollOffset, scrollOffset)  // 60+ updates/sec
// RIGHT: Pass via direct parameter or @Observable model
```

### Gestures

```swift
// WRONG: Use onTapGesture for button-like actions
Text("Submit").onTapGesture { submit() }
// No accessibility, no press feedback

// RIGHT: Use Button
Button("Submit") { submit() }.buttonStyle(.bordered)
```

```swift
// WRONG: @State for drag offset (doesn't auto-reset)
// RIGHT: @GestureState for temporary state during gesture
```

---

## Deep Patterns

### Architecture Decision

```
Starting fresh, small/medium app?
  --> Apple's Native Patterns: @Observable + @State/@Environment/@Bindable
Familiar with MVVM from UIKit?
  --> MVVM: ViewModels as presentation adapters with @Observable
Complex app, rigorous testability needed?
  --> Consider TCA: State/Action/Reducer/Store
Complex navigation, deep linking?
  --> Add Coordinator: Route enum + @Observable coordinator + NavigationPath
```

**State-as-Bridge pattern (WWDC 2025):**
Keep UI state changes synchronous (for animations), async work in model:
```swift
Button("Extract") {
    withAnimation { model.isLoading = true }  // Synchronous for animation
    Task {
        await model.extract()                 // Async in model
        withAnimation { model.isLoading = false }
    }
}
```

**Refactoring checklist -- move out of view body:**
- DateFormatter/NumberFormatter creation --> cache in model
- Calculations, sorting, filtering --> computed properties in ViewModel
- API calls, database queries --> service layer
- Business rules (discounts, validation) --> domain model

**Testability verification:**
```swift
// If you can test without importing SwiftUI, architecture is correct
import XCTest
final class OrderTests: XCTestCase {
    func testDiscount() {
        let order = Order(total: 200)
        XCTAssertTrue(order.qualifiesForDiscount)
    }
}
```

### App Composition

**App-level state machine with validated transitions:**
```swift
@Observable @MainActor
class AppStateController {
    private(set) var state: AppState = .loading

    func transition(to newState: AppState) {
        guard isValidTransition(from: state, to: newState) else {
            assertionFailure("Invalid: \(state) -> \(newState)")
            return
        }
        state = newState
    }

    private func isValidTransition(from: AppState, to: AppState) -> Bool {
        switch (from, to) {
        case (.loading, .unauthenticated), (.loading, .authenticated), (.loading, .error): true
        case (.unauthenticated, .authenticated), (.unauthenticated, .onboarding): true
        case (.authenticated, .unauthenticated), (.authenticated, .error): true
        case (.error, .loading), (.error, .unauthenticated): true
        default: false
        }
    }
}
```

**Scene lifecycle handling:**
```swift
.onChange(of: scenePhase) { _, newPhase in
    switch newPhase {
    case .active: Task { await appState.validateSession() }
    case .inactive: appState.prepareForBackground()
    case .background: appState.releaseResources()
    @unknown default: break
    }
}
```

**State restoration -- store IDs, not full objects:**
```swift
@SceneStorage("selectedTab") private var selectedTab = 0
@SceneStorage("navigation") private var navData: Data?
// Always validate restored state (items may be deleted, sessions expired)
```

### Coordinator/Router Pattern

```swift
enum AppRoute: Hashable {
    case category(Category)
    case recipe(Recipe)
    case settings
}

@Observable @MainActor
class Router {
    var path = NavigationPath()
    func navigate(to route: AppRoute) { path.append(route) }
    func popToRoot() { path.removeLast(path.count) }
}

// Testable without UI
func testDeepLink() {
    let router = Router()
    router.handleDeepLink(URL(string: "myapp://recipe/123")!)
    XCTAssertEqual(router.path.count, 1)
}
```

### Liquid Glass (iOS 26)

**Basic adoption -- recompile with Xcode 26 for automatic glass on standard controls.**

**Manual application:**
```swift
Text("Hello").glassEffect()
Text("Hello").glassEffect(in: RoundedRectangle(cornerRadius: 12))
```

**Regular vs Clear variant:**
- Regular (default, 95% of cases): full adaptive effects, automatic legibility
- Clear (special cases): permanently transparent, requires dimming layer
  - Use ONLY when: over media-rich content AND dimming acceptable AND content above is bold/bright
  - Never mix Regular and Clear in the same interface

**Tinting -- primary actions only:**
```swift
Button("View Bag") { }.tint(.red).glassEffect()   // Tint primary action
// Don't tint everything -- when everything is tinted, nothing stands out
// Don't use solid fills on glass elements
```

**Glass placement rules:**
- Glass on navigation layer (toolbars, tab bars, nav bars)
- Never glass on content layer (list rows, cards)
- Never glass on glass (use fills instead)

**Backward compatibility:**
```xml
<key>UIDesignRequiresCompatibility</key>
<true/>
<!-- Maintains iOS 18 appearance while building with iOS 26 SDK -->
```

### iOS 26 Layout: Free-Form Windows

- `UIRequiresFullScreen` deprecated -- apps must handle arbitrary sizes
- `NavigationSplitView` auto-adapts column visibility
- Test at arbitrary window sizes, not just 33/50/66%
- Don't save layout state based on window size -- revert when window returns to original size

### iOS 26 Performance Improvements

Automatic wins (rebuild with iOS 26 SDK, no code changes):
- 6x faster list loading (100k+ items, macOS)
- 16x faster list updates
- Reduced dropped frames during scrolling (better frame scheduling)
- Nested ScrollViews with lazy stacks now properly delay loading

---

## Diagnostics

### Debugging View Updates

**Self._printChanges() (debug only, never ship):**
```swift
var body: some View {
    let _ = Self._printChanges()
    // "MyView: @self changed"  -- view value itself changed
    // "MyView: count changed"  -- @State property triggered update
    // (no output)              -- body not being called
}
```

**LLDB alternative:**
```
(lldb) expression Self._printChanges()
```

### Preview Crashes

```
Preview crashes?
|-- "Cannot find in scope" / "No such module"?
|   --> Missing dependency: provide .environmentObject() or .environment()
|-- "Fatal error" or silent crash?
|   --> State init failure: check array bounds, optional unwraps, safe defaults
|-- No error, just won't load?
|   --> Cache corruption:
|       1. Cmd+Opt+P (restart preview)
|       2. Restart Xcode
|       3. rm -rf ~/Library/Developer/Xcode/DerivedData
|       4. Cmd+B (rebuild)
```

### Performance Profiling (Instruments 26)

**Launch:** Cmd+I in Xcode, choose SwiftUI template. Build in Release mode.

**SwiftUI Instrument lanes:**
1. **Update Groups** -- when SwiftUI is working (empty = problem elsewhere)
2. **Long View Body Updates** -- body takes too long (start here)
3. **Long Representable Updates** -- slow UIViewRepresentable bridges
4. **Other Long Updates** -- all other long SwiftUI work

**Color coding:** Red = very likely hitch, Orange = moderate, Gray = normal.

**Workflow for long updates:**
1. Find red/orange bars in Long View Body Updates lane
2. Select view, "Set Inspection Range and Zoom"
3. Switch to Time Profiler track
4. Option-click to expand call stack, Cmd+F for your view name
5. Identify expensive operations (formatter creation, calculations, I/O)

**Workflow for unnecessary updates:**
1. Count view body updates -- more than expected?
2. Open Cause & Effect Graph (hover view name, click arrow)
3. Trace data flow: which state change triggers all updates?
4. Fix: granular per-item view models instead of shared array dependency

**Verifying fix:** Record new trace, confirm view gone from Long View Body Updates.

### Gesture Troubleshooting

```
Gesture not working?
|-- View ignoring taps?
|   --> Add .contentShape(Rectangle()) to define tap area
|-- Another gesture taking priority?
|   --> Use .highPriorityGesture() or .simultaneousGesture()
|-- Gesture blocks ScrollView?
|   --> Use .simultaneousGesture() with directional check
|-- State doesn't reset after gesture?
|   --> Use @GestureState (auto-resets) instead of @State
|-- Coordinates wrong in scrolled view?
|   --> Specify .coordinateSpace(.named("container"))
```

### View Identity Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| @State resets unexpectedly | Identity changed (view moved in conditional) | Use .opacity() instead of if/else |
| Animation doesn't work | Identity change = remove+add, not update | Use stable .id() |
| ForEach items jump around | Non-unique or index-based IDs | Use unique, stable Identifiable IDs |
| TextField loses focus | ForEach identity changing | Use stable IDs, not array indices |

---

## Related

- `ax-swiftui-ref` -- Comprehensive SwiftUI API reference, modifiers, view catalog
- `ax-uikit` -- UIKit bridging (UIHostingController, UIViewRepresentable)
- `ax-concurrency` -- Swift concurrency, async/await, MainActor
- `ax-design` -- Design system principles, typography, color
- `ax-testing` -- Unit testing, UI testing, preview testing
- `ax-simulator` -- Simulator workflows, screenshots, deep links
- `ax-lldb` -- LLDB debugging beyond Self._printChanges()
- `ax-swiftdata` -- Data persistence with SwiftData
