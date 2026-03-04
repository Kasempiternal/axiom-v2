---
name: ax-swiftui-ref
description: SwiftUI API reference -- navigation (NavigationStack, NavigationSplitView, Tab), layout (ViewThatFits, AnyLayout, Layout protocol, GeometryReader), containers (stacks, grids, outlines, scroll), search (.searchable, scopes, tokens), animation (Animatable, springs, keyframes, transitions, zoom), and iOS 26 Liquid Glass
license: MIT
---
# SwiftUI API Reference

## Quick Patterns

### NavigationStack with Data-Driven Push
```swift
@State private var path: [Recipe] = []

NavigationStack(path: $path) {
    List(recipes) { recipe in
        NavigationLink(recipe.name, value: recipe)
    }
    .navigationTitle("Recipes")
    .navigationDestination(for: Recipe.self) { recipe in
        RecipeDetail(recipe: recipe)
    }
}
```

### Sidebar-Adaptable TabView (iOS 18+)
```swift
TabView {
    Tab("Home", systemImage: "house") {
        NavigationStack { HomeView() }
    }
    TabSection("Collections") {
        Tab("Favorites", systemImage: "heart") { FavoritesView() }
    }
    Tab(role: .search) {
        NavigationStack {
            SearchView().navigationTitle("Search")
        }
        .searchable(text: $query)
    }
}
.tabViewStyle(.sidebarAdaptable)
```

### Adaptive Layout Switch
```swift
@Environment(\.horizontalSizeClass) var sizeClass

var layout: AnyLayout {
    sizeClass == .compact
        ? AnyLayout(VStackLayout(spacing: 12))
        : AnyLayout(HStackLayout(spacing: 20))
}

var body: some View {
    layout {
        ForEach(items) { ItemView(item: $0) }
    }
    .animation(.default, value: sizeClass)
}
```

### Spring Animation with Scoped Modifier (iOS 17+)
```swift
Image("avatar")
    .animation(.spring, value: selected) {
        $0.scaleEffect(selected ? 1.5 : 1.0)
    }
```

### LazyVGrid with Adaptive Columns
```swift
let columns = [GridItem(.adaptive(minimum: 150))]

ScrollView {
    LazyVGrid(columns: columns, spacing: 16) {
        ForEach(items) { item in
            ItemCard(item: item)
        }
    }
}
```

### Searchable with Suggestions
```swift
NavigationStack {
    List(filteredResults) { ResultRow(result: $0) }
        .navigationTitle("Search")
        .searchable(text: $query, prompt: "Find items") {
            ForEach(suggestions) { s in
                Label(s.name, systemImage: "magnifyingglass")
                    .searchCompletion(s.name)
            }
        }
}
```

## Decision Tree

```
What SwiftUI API do you need?
|
+-- Navigation?
|   +-- Push/pop stack --> NavigationStack + NavigationPath
|   +-- Multi-column (iPad sidebar) --> NavigationSplitView
|   +-- Tabs + sidebar --> TabView + .sidebarAdaptable (iOS 18+)
|   +-- Deep linking --> NavigationPath + .onOpenURL
|   +-- State restoration --> Codable NavigationPath + SceneStorage
|
+-- Layout?
|   +-- Pick first variant that fits --> ViewThatFits
|   +-- Animate between layouts --> AnyLayout
|   +-- Custom positioning algorithm --> Layout protocol
|   +-- Read size without layout impact --> onGeometryChange
|   +-- Proportional sizing (last resort) --> GeometryReader (constrain it)
|   +-- Device adaptation --> Size classes + DynamicTypeSize
|
+-- Container?
|   +-- Few items (<20) --> VStack / HStack
|   +-- Many scrollable items --> LazyVStack / LazyHStack
|   +-- Multi-column grid --> LazyVGrid / LazyHGrid
|   +-- Precise grid alignment --> Grid (iOS 16+, non-lazy)
|   +-- Tree hierarchy --> List with children: or OutlineGroup
|   +-- Expand/collapse --> DisclosureGroup
|
+-- Search?
|   +-- Basic text filter --> .searchable(text:)
|   +-- Category narrowing --> .searchScopes (iOS 16+)
|   +-- Structured query pills --> .searchable(text:tokens:) (iOS 16+)
|   +-- Programmatic focus --> .searchFocused (iOS 18+)
|   +-- Submit-based server search --> onSubmit(of: .search)
|
+-- Animation?
    +-- Simple property animation --> withAnimation / .animation(value:)
    +-- Custom interpolation --> Animatable protocol / @Animatable (iOS 26)
    +-- Multi-step sequence --> PhaseAnimator (iOS 17+)
    +-- Per-property keyframes --> KeyframeAnimator (iOS 17+)
    +-- Shared element transition --> matchedGeometryEffect
    +-- Cell-to-detail morph --> Zoom transition (iOS 18+)
    +-- Insert/remove views --> .transition()
```

## Anti-Patterns

**Navigation**
- Using deprecated NavigationView -- use NavigationStack or NavigationSplitView
- View-based NavigationLink `NavigationLink { Dest() }` -- use value-based `NavigationLink(value:)`
- Placing `.navigationDestination` inside ForEach -- place it outside lazy containers
- Reading `isSearching` from parent of `.searchable` view -- must read from child view
- Missing NavigationStack wrapper around search tab content -- search field wont appear

**Layout**
- Unconstrained GeometryReader in VStack (takes all space) -- always `.frame(height:)`
- Using GeometryReader for side effects -- prefer `onGeometryChange` (iOS 16+)
- Conditional `if/else` for layout switching (loses view identity) -- use AnyLayout
- Using `.padding()` where `.safeAreaPadding()` needed (content hits notch/home indicator)

**Containers**
- Using LazyVStack for <20 items (unnecessary overhead) -- use VStack
- Nesting lazy containers inside lazy containers (layout issues) -- inner should be non-lazy
- Using array index as ForEach id `id: \.offset` -- items flash on mutation, use stable IDs
- Creating GridItem arrays inside body (recreated every render) -- define as stored property

**Search**
- Missing `.searchCompletion()` on suggestion views -- tapping does nothing without it
- Attaching `.searchable` without navigation container -- search field wont render
- Wrong column association in NavigationSplitView -- attach to specific column, not outer view

**Animation**
- Animating Int (no VectorArithmetic conformance) -- use Double, display as Int
- Custom Animatable when built-in modifier suffices -- `.scaleEffect` runs off-main-thread
- Missing animation context for transitions -- wrap state change in `withAnimation`
- Using timing curves for interruptible gestures -- springs preserve velocity on interruption

## Deep Patterns

### Navigation

#### NavigationPath Operations
```swift
path.append(recipe)           // Push
path.removeLast()             // Pop
path.removeLast(path.count)   // Pop to root
path = NavigationPath()       // Reset

// Codable state restoration
let data = try JSONEncoder().encode(path.codable)
let rep = try JSONDecoder().decode(NavigationPath.CodableRepresentation.self, from: data)
path = NavigationPath(rep)
```

#### NavigationSplitView Three-Column
```swift
NavigationSplitView {
    List(categories, selection: $selectedCategory) { category in
        NavigationLink(category.name, value: category)
    }
} content: {
    List(recipes(in: selectedCategory), selection: $selectedRecipe) { recipe in
        NavigationLink(recipe.name, value: recipe)
    }
} detail: {
    RecipeDetail(recipe: selectedRecipe)
}
```

#### Deep Link Routing
```swift
.onOpenURL { url in
    guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
          let host = components.host else { return }
    path.removeLast(path.count)
    // Parse host/path components, append resolved values to build stack
}
```

#### State Restoration with SceneStorage
```swift
@SceneStorage("navigation") private var data: Data?

.task {
    if let data { navModel.jsonData = data }
    for await _ in navModel.objectWillChangeSequence {
        data = navModel.jsonData
    }
}
```

#### Router Pattern
```swift
enum AppRoute: Hashable {
    case category(Category)
    case recipe(Recipe)
    case settings
}

@Observable class Router {
    var path = NavigationPath()
    func navigate(to route: AppRoute) { path.append(route) }
    func popToRoot() { path.removeLast(path.count) }
}
```

#### Tab Customization (iOS 18+)
```swift
@AppStorage("TabCustomization") private var customization: TabViewCustomization

Tab("Optional", systemImage: "star", value: .optional) { OptionalView() }
    .customizationID("Tab.optional")
    .defaultVisibility(.hidden, for: .tabBar)

// Programmatic visibility with state preservation
Tab("Settings", systemImage: "gear") { SettingsView() }
    .hidden(!showSettings)  // State preserved unlike conditional if
```

#### iOS 26 Tab Features
```swift
TabView { ... }
    .tabBarMinimizeBehavior(.onScrollDown)
    .tabViewBottomAccessory { PlaybackControls() }
```

### Layout

#### ViewThatFits
```swift
ViewThatFits(in: .horizontal) {
    HStack { icon; title; Spacer(); button }  // Wide
    VStack { HStack { icon; title }; button }  // Narrow fallback
}
```

#### Layout Protocol (Custom Flow Layout)
```swift
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
        return calculateSize(for: sizes, in: proposal.width ?? .infinity)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var point = bounds.origin
        var lineHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if point.x + size.width > bounds.maxX {
                point.x = bounds.origin.x
                point.y += lineHeight + spacing
                lineHeight = 0
            }
            subview.place(at: point, proposal: .unspecified)
            point.x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
```

#### Layout Values
```swift
struct Rank: LayoutValueKey { static let defaultValue: Int = 0 }

extension View {
    func rank(_ value: Int) -> some View { layoutValue(key: Rank.self, value: value) }
}

// Read in placeSubviews: let sorted = subviews.sorted { $0[Rank.self] < $1[Rank.self] }
```

#### onGeometryChange (iOS 16+ backported)
```swift
.onGeometryChange(for: CGSize.self) { proxy in
    proxy.size
} action: { newSize in
    size = newSize
}

// Width-based column count
.onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width in
    columnCount = max(1, Int(width / 150))
}
```

#### Safe Area Padding (iOS 17+)
```swift
// Edge-to-edge scroll with proper insets
ScrollView {
    LazyVStack(spacing: 12) { ForEach(items) { ItemCard(item: $0) } }
}
.safeAreaPadding(.horizontal, 16)

// .padding() = fixed spacing from view edges
// .safeAreaPadding() = spacing beyond safe area insets
```

#### Size Classes
| Device | Orientation | Horizontal | Vertical |
|--------|-------------|------------|----------|
| iPhone | Portrait | compact | regular |
| iPhone | Landscape (small) | compact | compact |
| iPhone Plus/Max | Landscape | regular | compact |
| iPad | Full screen | regular | regular |
| iPad | 33% Split/Slide Over | compact | regular |

#### ScaledMetric
```swift
@ScaledMetric var iconSize: CGFloat = 24
@ScaledMetric(relativeTo: .largeTitle) var headerSize: CGFloat = 44
```

### Containers

#### Lazy Performance Guidelines
| Item Count | Scrollable? | Use |
|-----------|------------|-----|
| 1-20 | No | VStack / HStack |
| 1-20 | Yes | VStack in ScrollView |
| 20-100 | Yes | LazyVStack / LazyHStack |
| 100+ | Yes | LazyVStack or List |
| Grid <50 | No | Grid |
| Grid 50+ | Yes | LazyVGrid / LazyHGrid |

#### Grid (Non-Lazy, iOS 16+)
```swift
Grid(alignment: .leading, horizontalSpacing: 10, verticalSpacing: 10) {
    GridRow {
        Text("Name")
        TextField("Enter name", text: $name)
    }
    GridRow {
        Text("Header").gridCellColumns(2)
    }
}
```

#### GridItem.Size Reference
| Size | Behavior |
|------|----------|
| `.fixed(CGFloat)` | Exact width/height |
| `.flexible(minimum:maximum:)` | Fills space equally |
| `.adaptive(minimum:maximum:)` | Creates as many as fit |

#### Pinned Section Headers
```swift
ScrollView {
    LazyVStack(pinnedViews: [.sectionHeaders]) {
        ForEach(sections) { section in
            Section(header: SectionHeader(section)) {
                ForEach(section.items) { ItemRow(item: $0) }
            }
        }
    }
}
```

#### Hierarchical Data
```swift
struct FileItem: Identifiable {
    let id = UUID()
    var name: String
    var children: [FileItem]?
}

List(files, children: \.children) { file in
    Label(file.name, systemImage: file.children != nil ? "folder" : "doc")
}
.listStyle(.sidebar)
```

#### Scroll Enhancements (iOS 17+)
```swift
// Snap to items
ScrollView(.horizontal) {
    LazyHStack { ForEach(items) { ItemCard(item: $0) } }
        .scrollTargetLayout()
}
.scrollTargetBehavior(.viewAligned)

// Track scroll position
.scrollPosition(id: $position)  // Requires .id() on each item

// Size relative to container
.containerRelativeFrame(.horizontal, count: 3, span: 1, spacing: 16)

// Scroll transitions
.scrollTransition { content, phase in
    content.opacity(1 - abs(phase.value) * 0.5)
           .scaleEffect(phase.isIdentity ? 1.0 : 0.75)
}
```

#### Scroll Geometry (iOS 18+)
```swift
.onScrollGeometryChange(for: Bool.self) { geo in
    geo.contentOffset.y < geo.contentInsets.top
} action: { _, isTop in
    showBackButton = !isTop
}

.onScrollVisibilityChange(threshold: 0.2) { visible in
    visible ? player.play() : player.pause()
}
```

### Search

#### Core .searchable Pattern
```swift
// Environment-based: attach to view, navigation container renders field
NavigationStack {
    List(filtered) { ResultRow(result: $0) }
        .searchable(text: $query, prompt: "Find items")
}
```

#### Placement Options
| Placement | Behavior |
|-----------|----------|
| `.automatic` | System decides (recommended) |
| `.navigationBarDrawer(displayMode: .always)` | Always visible |
| `.sidebar` | In sidebar column |
| `.toolbar` | In toolbar area |

#### isSearching / dismissSearch
```swift
// Must read from CHILD of .searchable view
struct ChildView: View {
    @Environment(\.isSearching) private var isSearching
    @Environment(\.dismissSearch) private var dismissSearch

    var body: some View {
        if isSearching { SearchResults() }
        else { DefaultContent() }
    }
}
```

#### Search Scopes (iOS 16+)
```swift
.searchable(text: $query)
.searchScopes($scope, activation: .onTextEntry) {
    Text("All").tag(Scope.all)
    Text("Recent").tag(Scope.recent)
}
```

#### Search Tokens (iOS 16+)
```swift
.searchable(text: $query, tokens: $tokens) { token in
    Label(token.name, systemImage: token.icon)
}
```

#### Programmatic Focus (iOS 18+)
```swift
@FocusState private var isSearchFocused: Bool

.searchable(text: $query)
.searchFocused($isSearchFocused)

// Activate: isSearchFocused = true
// Dismiss: isSearchFocused = false (or use dismissSearch for iOS 15+)
```

### Animation

#### VectorArithmetic Foundation
Animation is interpolation over time. Animated types must conform to `VectorArithmetic` (subtraction, scaling, addition, zero). Built-in conforming types: `CGFloat`, `Double`, `Float`, `Angle`, `CGPoint`, `CGSize`, `CGRect`. Int cannot animate (no fractional intermediates).

#### Animation Types
```swift
// Timing curves
.animation(.linear)       // Constant speed
.animation(.easeInOut)    // Slow start/end
.animation(.easeInOut(duration: 0.3))

// Springs (default since iOS 17)
.animation(.smooth)       // No bounce (default)
.animation(.snappy)       // Small bounce
.animation(.bouncy)       // Larger bounce
.animation(.spring(duration: 0.6, bounce: 0.3))

// Higher-order
.animation(.spring.delay(0.5))
.animation(.easeInOut.repeatCount(3, autoreverses: true))
.animation(.linear.repeatForever(autoreverses: false))
.animation(.spring.speed(2.0))
```

#### withAnimation Transaction
```swift
withAnimation(.spring(duration: 0.6, bounce: 0.4)) {
    isExpanded.toggle()
}

// No animation
withAnimation(nil) { resetState() }
```

#### Custom Animatable Conformance
```swift
struct AnimatableNumberView: View, Animatable {
    var number: Double

    var animatableData: Double {
        get { number }
        set { number = newValue }
    }

    var body: some View {
        Text("\(Int(number))").font(.largeTitle)
    }
}
// Warning: calls body every frame on main thread. Use built-in effects when possible.
```

#### @Animatable Macro (iOS 26+)
```swift
@MainActor
@Animatable
struct HikingRouteShape: Shape {
    var startPoint: CGPoint
    var endPoint: CGPoint
    var elevation: Double

    @AnimatableIgnored
    var drawingDirection: Bool  // Excluded from animation

    func path(in rect: CGRect) -> Path { /* ... */ }
}
// Auto-generates animatableData with AnimatablePair. 40% less code.
```

#### PhaseAnimator (iOS 17+)
```swift
enum PulsePhase: CaseIterable { case idle, expand, contract }

PhaseAnimator(PulsePhase.allCases) { phase in
    Circle().scaleEffect(phase == .expand ? 1.3 : phase == .contract ? 0.9 : 1.0)
} animation: { phase in
    phase == .expand ? .spring(duration: 0.8, bounce: 0.3) : .easeInOut(duration: 0.4)
}
```

#### KeyframeAnimator (iOS 17+)
```swift
struct AnimationValues {
    var scale: Double = 1.0
    var rotation: Angle = .zero
    var yOffset: Double = 0
}

KeyframeAnimator(initialValue: AnimationValues()) { values in
    Image(systemName: "heart.fill")
        .scaleEffect(values.scale)
        .rotationEffect(values.rotation)
        .offset(y: values.yOffset)
} keyframes: { _ in
    KeyframeTrack(\.scale) {
        SpringKeyframe(1.5, duration: 0.3)
        SpringKeyframe(1.0, duration: 0.3)
    }
    KeyframeTrack(\.rotation) {
        LinearKeyframe(.degrees(15), duration: 0.15)
        LinearKeyframe(.degrees(-15), duration: 0.3)
        LinearKeyframe(.zero, duration: 0.15)
    }
}
// Keyframe types: LinearKeyframe, SpringKeyframe, CubicKeyframe, MoveKeyframe
```

#### Transitions
```swift
if showDetail {
    DetailView()
        .transition(.slide)
        .transition(.scale.combined(with: .opacity))
        .transition(.asymmetric(insertion: .scale, removal: .opacity))
}
// Requires withAnimation or .animation() context
```

#### matchedGeometryEffect
```swift
@Namespace private var animation

if !isExpanded {
    RoundedRectangle(cornerRadius: 10)
        .matchedGeometryEffect(id: "card", in: animation)
        .frame(width: 100, height: 100)
}
if isExpanded {
    RoundedRectangle(cornerRadius: 20)
        .matchedGeometryEffect(id: "card", in: animation)
        .frame(width: 300, height: 400)
}
```

#### Zoom Transition (iOS 18+)
```swift
@Namespace private var ns

NavigationLink {
    BraceletEditor(bracelet)
        .navigationTransition(.zoom(sourceID: bracelet.id, in: ns))
} label: {
    BraceletPreview(bracelet)
}
.matchedTransitionSource(id: bracelet.id, in: ns)
```

#### UIKit Animation Bridging (iOS 18+)
```swift
// Use SwiftUI animation types with UIKit views
UIView.animate(.spring(duration: 0.5)) {
    bead.center = endOfBracelet
}

// UIViewRepresentable bridging
func updateUIView(_ box: BeadBox, context: Context) {
    context.animate { box.lid.center.y = isOpen ? -100 : 100 }
}
```

#### Gesture-Driven Animations (iOS 18+)
```swift
DragGesture()
    .onChanged { value in
        withAnimation(.interactiveSpring) { position = value.location }
    }
    .onEnded { _ in
        withAnimation(.spring) { position = targetPosition }
        // Inherits velocity automatically via animation merging
    }
```

#### Animation Merging
- Timing curves: don't merge (both run, combine additively)
- Springs: merge and retarget (preserve velocity) -- why springs feel more natural on interruption

### iOS 26 Features

#### Liquid Glass Navigation
Automatic when building with Xcode 26: navigation bars, sidebars, tab bars, and toolbars become glass. Use `.backgroundExtensionEffect()` to extend content behind glass sidebar.

#### Bottom-Aligned Search
```swift
.searchable(text: $query, prompt: "What are you looking for?")
// Automatically bottom-aligned on iPhone, top-trailing on iPad
```

#### Scroll Edge Effect
```swift
ScrollView { content }
    .scrollEdgeEffectStyle(.soft)  // Blur when content scrolls under toolbar
```

#### Sheet Zoom Transitions
```swift
@Namespace private var namespace

.toolbar {
    ToolbarItem {
        Button("Settings") { showSettings = true }
            .matchedTransitionSource(id: "settings", in: namespace)
    }
}
.sheet(isPresented: $showSettings) {
    SettingsView()
        .navigationTransition(.zoom(sourceID: "settings", in: namespace))
}
```

## Diagnostics

### Search Field Not Appearing
1. Missing navigation container -- `.searchable` requires NavigationStack/SplitView/TabView
2. Search tab missing NavigationStack wrapper -- contents must be in NavigationStack
3. Wrong column in SplitView -- attach `.searchable` to specific column

### isSearching Always False
Read from child of `.searchable` view, not the parent. SwiftUI sets environment downward only.

### Property Not Animating
1. Type not VectorArithmetic? (`Int` cant animate, use `Double`)
2. Missing `.animation(value:)` or `withAnimation`?
3. Tracking wrong value in `.animation(.spring, value: x)`?
4. Custom view missing Animatable conformance?

### Animation Stuttering
Custom Animatable calls `body` every frame on main thread. Use built-in effects (`.opacity()`, `.scaleEffect()`) when possible -- they run off-main-thread.

### LazyVStack Items Flashing
Unstable identity from `id: \.offset`. Use `Identifiable` conformance with stable IDs.

### GeometryReader Taking All Space
Always constrain with `.frame(height:)`. Prefer `onGeometryChange` for side effects.

### Suggestions Dont Fill Search Field
Missing `.searchCompletion()` modifier on suggestion views.

## Related

- `ax-swiftui` -- decision patterns, anti-patterns, pressure scenarios for SwiftUI development
- `ax-uikit` -- UIKit integration, UIViewRepresentable, bridging patterns
- `ax-design` -- Human Interface Guidelines, SF Symbols usage
- `ax-design-ref` -- HIG reference, typography, Liquid Glass design specs
