---
name: ax-design-ref
description: Design API reference -- HIG color/background/material system, typography (San Francisco, text styles, Dynamic Type, tracking, leading), SF Symbols complete API (rendering modes, effects, UIKit equivalents, platform matrix), Liquid Glass adoption guide (controls, navigation, windows, icons, migration), accessibility compliance
license: MIT
---
# Design API Reference

## Quick Patterns

### Semantic Color Hierarchy
```swift
// Labels (foreground)
Text("Title").foregroundStyle(.primary)      // label
Text("Subtitle").foregroundStyle(.secondary) // secondaryLabel
Text("Detail").foregroundStyle(.tertiary)    // tertiaryLabel

// Backgrounds
Color(.systemBackground)                     // Main
Color(.secondarySystemBackground)            // Grouped element
Color(.systemGroupedBackground)              // Settings-style list

// Fills (semi-transparent, for controls)
Color(.systemFill)
Color(.secondarySystemFill)
```

### Dynamic Type with System Styles
```swift
.font(.largeTitle)   // 34pt  -- page headings
.font(.title)        // 28pt  -- secondary headings
.font(.headline)     // 17pt semibold -- emphasized body
.font(.body)         // 17pt  -- primary body
.font(.callout)      // 16pt  -- secondary body
.font(.footnote)     // 13pt  -- footnotes
.font(.caption)      // 12pt  -- small annotations
```

### SF Symbols Effect API (SwiftUI)
```swift
// Discrete (value change trigger)
.symbolEffect(.bounce, value: count)
.symbolEffect(.wiggle, value: count)        // iOS 18+

// Indefinite (continuous while active)
.symbolEffect(.pulse, isActive: isLoading)
.symbolEffect(.breathe, isActive: true)      // iOS 18+
.symbolEffect(.rotate, isActive: true)       // iOS 18+

// Content transition (symbol swap)
.contentTransition(.symbolEffect(.replace))

// Transition (view enter/leave)
.transition(.symbolEffect(.appear))

// Draw (iOS 26+)
.symbolEffect(.drawOn, isActive: isComplete)
```

### Liquid Glass (iOS 26+)
```swift
// Standard components adopt automatically with Xcode 26
// For custom views:
Button("Action") { }.glassEffect()                    // Controls
VStack { content }.glassBackgroundEffect()             // Content containers
GlassEffectContainer { /* multiple glass views */ }    // Optimization
```

## Decision Tree

```
What design reference do you need?
|
+-- Colors?
|   +-- Text/icons --> semantic label colors (.primary, .secondary, .tertiary)
|   +-- Backgrounds --> systemBackground / systemGroupedBackground
|   +-- Controls --> systemFill colors (semi-transparent)
|   +-- Custom brand --> Color Set in asset catalog (light + dark + high contrast)
|   +-- Separators --> Color(.separator) or Color(.opaqueSeparator)
|
+-- Typography?
|   +-- System text style --> .font(.body), .font(.title), etc.
|   +-- Rounded design --> .fontDesign(.rounded)
|   +-- Custom font + scaling --> .font(.custom(name, size:, relativeTo: .body))
|   +-- ScaledMetric --> @ScaledMetric var padding: CGFloat = 20
|   +-- Tight/loose leading --> .font(.body.leading(.tight))
|   +-- Monospaced --> SF Mono or .fontDesign(.monospaced)
|
+-- SF Symbols API?
|   +-- Rendering mode --> .symbolRenderingMode(.hierarchical/.palette/.multicolor)
|   +-- Tap feedback effect --> .symbolEffect(.bounce, value:)
|   +-- Loading indicator --> .symbolEffect(.pulse, isActive:)
|   +-- Symbol swap --> .contentTransition(.symbolEffect(.replace))
|   +-- Draw animation --> .symbolEffect(.drawOn, isActive:) (iOS 26+)
|   +-- UIKit effect --> imageView.addSymbolEffect(.bounce)
|   +-- Variable value --> Image(systemName:, variableValue: 0.5)
|
+-- Liquid Glass?
|   +-- What adopts automatically --> nav bars, tab bars, toolbars, sheets, controls
|   +-- Custom glass control --> .glassEffect()
|   +-- Custom glass container --> .glassBackgroundEffect()
|   +-- Multiple glass views --> GlassEffectContainer { }
|   +-- Backward compat --> UIDesignRequiresCompatibility = true in Info.plist
|   +-- Clear glass variant --> .glassEffect(.clear) (only over rich backgrounds)
|
+-- Accessibility?
    +-- Contrast ratio --> 4.5:1 min (7:1 for small text)
    +-- Touch targets --> 44x44 points min (iOS)
    +-- Reduce Motion --> @Environment(\.accessibilityReduceMotion)
    +-- VoiceOver --> .accessibilityLabel("description")
    +-- Color alone --> convey info with shape + text + color
```

## Anti-Patterns

**Colors**
- Hardcoded `Color.black`/`.white` -- use semantic colors that adapt to light/dark
- Custom gray for text without contrast verification -- use `.secondary` for automatic compliance
- Hardcoded RGB in controls -- use `.tint(.blue)` for automatic adaptation
- Missing High Contrast color variants in asset catalog

**Typography**
- `.font(.system(size: 17))` fixed size -- doesn't scale with Dynamic Type; use `.font(.body)`
- Ultralight/Thin/Light font weights -- legibility issues at small sizes
- `.font()` modifier with AttributedString paragraph styles -- environment override drops lineHeightMultiple; set font inside AttributedString instead
- Missing `adjustsFontForContentSizeCategory = true` in UIKit

**SF Symbols**
- Missing `.searchCompletion()` on suggestions -- unrelated but common co-occurring issue
- `.foregroundColor()` with Multicolor mode -- overrides Apple's curated colors
- Palette with fewer colors than layers -- extra layers reuse last color silently
- Missing `.accessibilityLabel` -- VoiceOver reads raw symbol name
- iOS 18+ effects without `#available` check -- crashes on iOS 17

**Liquid Glass**
- Custom backgrounds on navigation/toolbar -- `.background(Color.blue)` breaks glass effects
- `.presentationBackground()` on sheets -- remove it, system applies glass automatically
- Hard-coded `.frame(height:)` on controls/rows -- system determines height in iOS 26
- `.glassEffect()` on content items (list rows, cards) -- glass is for navigation layer only
- Glass-on-glass crowding without `GlassEffectContainer`
- Missing `.safeAreaPadding()` with edge-to-edge glass -- content hits notch/home indicator

## Deep Patterns

### Color System

#### Background Hierarchy (Ungrouped vs Grouped)
| Level | Ungrouped | Grouped |
|-------|-----------|---------|
| Primary | `.systemBackground` | `.systemGroupedBackground` |
| Secondary | `.secondarySystemBackground` | `.secondarySystemGroupedBackground` |
| Tertiary | `.tertiarySystemBackground` | `.tertiarySystemGroupedBackground` |

#### Base vs Elevated Backgrounds
Base set for background apps; elevated set for foreground (lighter in Dark Mode for visual separation). iPad multitasking: slide-over uses elevated. Semi-opaque fill and separator colors adapt gracefully.

#### Materials (Background Blur)
```swift
.background(.ultraThinMaterial)  // Minimal separation
.background(.thinMaterial)       // Lighter weight
.background(.regularMaterial)    // Default
.background(.thickMaterial)      // Most separation
```
Use vibrant foreground colors (`.primary`, `.secondary`) on materials for legibility.

#### Custom Color Creation
1. Assets.xcassets > Add Color Set
2. Configure: Light, Dark, High Contrast Light, High Contrast Dark
3. Use: `Color("BrandAccent")`

### Typography

#### San Francisco Font System
| Family | Use |
|--------|-----|
| SF Pro | General UI (iOS, iPadOS, macOS, tvOS) |
| SF Compact | watchOS, narrow columns |
| SF Mono | Code, monospaced text |
| SF Pro Rounded | Friendly/approachable interfaces |
| New York | Serif, editorial content |

Variable font axes: Weight (9 weights), Width (Condensed to Expanded), Optical Size (auto text/display switch at ~20pt).

#### Text Styles with Sizes
| Style | iOS Default | Use |
|-------|-------------|-----|
| `.largeTitle` | 34pt | Primary page headings |
| `.title` | 28pt | Secondary headings |
| `.title2` | 22pt | Tertiary headings |
| `.title3` | 20pt | Quaternary headings |
| `.headline` | 17pt Semibold | Emphasized body |
| `.body` | 17pt | Primary body |
| `.callout` | 16pt | Secondary body |
| `.subheadline` | 15pt | Tertiary body |
| `.footnote` | 13pt | Footnotes |
| `.caption` | 12pt | Small annotations |
| `.caption2` | 11pt | Smallest annotations |

#### Custom Font + Dynamic Type
```swift
// SwiftUI
Text("Custom").font(.custom("Avenir-Medium", size: 17, relativeTo: .body))
@ScaledMetric(relativeTo: .body) var padding: CGFloat = 20

// UIKit
let metrics = UIFontMetrics(forTextStyle: .body)
label.font = metrics.scaledFont(for: UIFont(name: "Avenir-Medium", size: 17)!)
label.adjustsFontForContentSizeCategory = true
```

#### Rounded Design
```swift
// SwiftUI
Text("Today").font(.largeTitle.bold()).fontDesign(.rounded)

// UIKit
let desc = UIFontDescriptor.preferredFontDescriptor(withTextStyle: .largeTitle).withDesign(.rounded)!
let font = UIFont(descriptor: desc, size: 0)
```

#### Leading Variants
```swift
Text("Tight").font(.body.leading(.tight))   // -2pt line height
Text("Loose").font(.body.leading(.loose))    // +2pt line height
```

#### AttributedString Typography Gotcha
```swift
// Font INSIDE AttributedString when using paragraph styles:
var s = AttributedString("Content")
s.font = .system(.body)  // Set font in attributed content
var p = AttributedString.ParagraphStyle()
p.lineHeightMultiple = 0.92
s.paragraphStyle = p
Text(s)  // No .font() modifier -- preserves paragraph styles
```

#### Tracking
```swift
Text("Tracked").tracking(2.0)  // Use .tracking(), not .kerning()
// .tracking() disables ligatures when needed; .kerning() does not
```

### SF Symbols Complete API

#### Display (SwiftUI)
```swift
Image(systemName: "star.fill")
    .font(.title)                    // Scale with text style
    .fontWeight(.bold)               // Weight matching
    .imageScale(.large)              // Relative sizing
    .symbolVariant(.circle.fill)     // Programmatic variant
```

#### Display (UIKit)
```swift
let config = UIImage.SymbolConfiguration(pointSize: 24, weight: .bold, scale: .large)
let image = UIImage(systemName: "star.fill", withConfiguration: config)
```

#### Rendering Modes (SwiftUI)
```swift
.symbolRenderingMode(.monochrome)    // Single color (default)
.symbolRenderingMode(.hierarchical)  // Single color, auto opacity per layer
.symbolRenderingMode(.palette)       // Explicit per-layer: .foregroundStyle(.red, .white, .blue)
.symbolRenderingMode(.multicolor)    // Apple's fixed curated colors
```

#### Rendering Modes (UIKit)
```swift
UIImage.SymbolConfiguration(hierarchicalColor: .systemBlue)
UIImage.SymbolConfiguration(paletteColors: [.white, .systemBlue])
UIImage.SymbolConfiguration.preferringMulticolor()
// Combine: sizeConfig.applying(colorConfig)
```

#### All Effects Reference

| Effect | Category | iOS | Trigger |
|--------|----------|-----|---------|
| Bounce | Discrete | 17+ | `.symbolEffect(.bounce, value:)` |
| Pulse | Discrete/Indefinite | 17+ | `value:` or `isActive:` |
| Variable Color | Discrete/Indefinite | 17+ | `.iterative`, `.cumulative`, `.reversing` |
| Scale | Indefinite | 17+ | `.scale.up/.down` |
| Appear/Disappear | Transition | 17+ | `.transition(.symbolEffect(.appear))` |
| Replace | Content Trans | 17+ | `.contentTransition(.symbolEffect(.replace))` |
| Wiggle | Discrete/Indefinite | 18+ | `.wiggle.forward/.backward` (RTL-aware) |
| Rotate | Discrete/Indefinite | 18+ | `.rotate.clockwise/.byLayer` |
| Breathe | Discrete/Indefinite | 18+ | `.breathe.plain/.pulse` |
| Draw On/Off | Indefinite | 26+ | `.drawOn.byLayer/.wholeSymbol/.individually` |
| Variable Draw | Value-based | 26+ | `.symbolVariableValueMode(.draw)` |
| Gradient | Rendering | 26+ | `.symbolColorRenderingMode(.gradient)` |

#### Effect Options
```swift
.symbolEffect(.bounce, options: .repeat(3), value: count)
.symbolEffect(.pulse, options: .speed(2.0), isActive: true)
.symbolEffect(.breathe, options: .nonRepeating, isActive: true)
```

#### UIKit Effects
```swift
imageView.addSymbolEffect(.bounce)
imageView.addSymbolEffect(.pulse, options: .speed(2.0))
imageView.removeSymbolEffect(ofType: PulseSymbolEffect.self)
imageView.removeAllSymbolEffects()

// Content transition
imageView.setSymbolImage(newImage, contentTransition: .replace.downUp)
```

#### Custom Symbols
1. Export SVG from design tool
2. Import into SF Symbols app (File > Import)
3. Annotate layers (Primary/Secondary/Tertiary) for rendering modes
4. For Draw: add guide points (start, end, corner) per path
5. Export as `.svg` template for Xcode asset catalog

### Liquid Glass Adoption

#### What Adopts Automatically (Xcode 26)
Navigation bars, tab bars, toolbars, sheets, popovers, buttons, sliders, toggles, sidebars, split views, menus, action sheets.

#### Navigation Layer vs Content Layer
```
Navigation (Liquid Glass): tab bar, sidebar, toolbar
Content (no glass): articles, photos, data, list rows
```
Never apply `.glassEffect()` to content items.

#### Tab Bar to Sidebar Adaptation
```swift
TabView { ... }.tabViewStyle(.sidebarAdaptable)
// Tab bar on iPhone, sidebar on iPad/macOS
```

#### Tab Bar Minimize
```swift
TabView { ... }.tabBarMinimizeBehavior(.onScrollDown)
```

#### Background Extension Effect
```swift
NavigationSplitView {
    Sidebar()
} detail: {
    DetailView().backgroundExtensionEffect()
}
```

#### Scroll Edge Effects
```swift
.scrollEdgeEffectStyle(.hard, for: .top)  // Obscure content under glass
.scrollEdgeEffectStyle(.soft)              // Gradual fade
```

#### Controls
- Bordered buttons default to capsule shape
- New `controlSize(.extraLarge)`
- Remove hard-coded `.frame()` dimensions
- Use `containerRelativeShape()` for concentric alignment

#### Sheets
- Increased corner radius, half sheets inset
- Remove `.presentationBackground()` -- system handles glass material
- Remove custom `UIVisualEffectView`/`UIBlurEffect` backgrounds

#### App Icons (iOS 26+)
Three layers: foreground, middle, background. Use Icon Composer (Xcode 26+). Appearance variants: light, dark, clear, tinted. Export layers as PNG/SVG with transparency.

#### UIBlurEffect Migration
| Legacy | Liquid Glass |
|--------|-------------|
| `UIBlurEffect(style: .systemMaterial)` | `.glassEffect()` |
| `UIBlurEffect(style: .systemUltraThinMaterial)` | `.glassEffect(.clear)` |
| `UIVisualEffectView` with blur | Remove, use `.glassEffect()` |
| `.background(.thinMaterial)` | Adapts automatically or `.glassEffect()` |

#### Backward Compatibility
`UIDesignRequiresCompatibility = true` in Info.plist to maintain iOS 18 appearance while shipping with iOS 26 SDK.

### Accessibility

#### Contrast Requirements
- Normal text (14pt+): 4.5:1 minimum
- Small text (<14pt): 7:1 recommended
- Large text (18pt+): 3:1 acceptable
- Semantic colors automatically meet AA

#### Touch Targets
| Platform | Minimum |
|----------|---------|
| iOS/iPadOS | 44x44 points |
| macOS | 20x20 points |
| tvOS | 60pt+ spacing |

#### Reduce Motion
```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion
.animation(reduceMotion ? nil : .spring(), value: isExpanded)
```
Symbol effects auto-respect Reduce Motion. Only intervene if effects carry semantic meaning.

#### VoiceOver
```swift
Image(systemName: "square.and.arrow.up").accessibilityLabel("Share")
// Label provides automatic accessibility:
Label("Settings", systemImage: "gear")
```

#### Convey Info Beyond Color
```swift
HStack {
    Image(systemName: isComplete ? "checkmark.circle.fill" : "xmark.circle.fill")
    Text(isComplete ? "Complete" : "Incomplete")
}
.foregroundStyle(isComplete ? .green : .red)
```

### Shapes & Geometry (iOS 26)

Three shape types:
1. **Fixed** -- `RoundedRectangle(cornerRadius: 12)` constant radius
2. **Capsule** -- radius = half height, buttons/pills/controls
3. **Concentric** -- `containerRelativeShape()`, nested elements maintain visual harmony

Concentricity principle: hardware curvature guides UI, shapes nest from window to sheet to card to button.

### Inclusive Design
- Use plain, direct, respectful tone
- Address users as "you/your" not "the user"
- Feature diverse representation
- Provide inclusive gender options
- Avoid culture-specific expressions
- Colors carry different cultural meanings

## Diagnostics

### Color Contrast Failures
Use Accessibility Inspector or contrast calculators. Test Light + Dark + Increase Contrast. Solution: replace custom colors with semantic colors or verify 4.5:1 ratio.

### Dynamic Type Not Scaling
Fixed font sizes (`.system(size: 17)`) don't scale. Use text styles (`.body`) or `.custom(name, size:, relativeTo:)`. UIKit: use `UIFontMetrics.scaledFont(for:)` + `adjustsFontForContentSizeCategory = true`.

### Liquid Glass Broken on Custom Components
Remove: custom `.background()`, `.presentationBackground()`, `UIBlurEffect`, hard-coded heights. Let system determine appearance. Test with Reduce Transparency, Increase Contrast, Reduce Motion.

### Symbol Effect Not Playing
1. Check iOS version requirement
2. Check Reduce Motion setting
3. Discrete: `value:` must change. Indefinite: `isActive:` must be true
4. Check symbol compatibility in SF Symbols app
5. Remove conflicting `.symbolEffect()` modifiers

### AttributedString Losing Paragraph Styles
Font set in `.font()` modifier overrides AttributedString. Set font inside the AttributedString directly and remove `.font()` from the `Text` view.

## Related

- `ax-design` -- quick HIG decisions, SF Symbols effects overview, design review defense
- `ax-swiftui-ref` -- SwiftUI animation system, layout APIs, navigation
- `ax-swiftui` -- SwiftUI patterns and decision guidance
