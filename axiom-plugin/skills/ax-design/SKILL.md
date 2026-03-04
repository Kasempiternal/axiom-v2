---
name: ax-design
description: Apple Human Interface Guidelines and SF Symbols -- design decisions, rendering modes, symbol effects/animations, Draw animations (iOS 26), accessibility compliance, and defending HIG decisions in design reviews
license: MIT
---
# Apple Design & SF Symbols

## Quick Patterns

### Background Color Decision
```
Is your app media-focused (photos, videos, music)?
+-- Yes --> permanent dark appearance (.preferredColorScheme(.dark))
+-- No  --> system backgrounds (respect user Light/Dark preference)
         systemBackground (main), systemGroupedBackground (Settings-style)
```

### Label Hierarchy
```swift
Text("Title").foregroundStyle(.primary)
Text("Subtitle").foregroundStyle(.secondary)
Text("Detail").foregroundStyle(.tertiary)
Text("Disabled").foregroundStyle(.quaternary)
```

### SF Symbol Rendering Mode Selection
```
Need depth from ONE color?        --> Hierarchical
Need specific colors per layer?   --> Palette
Want Apple's curated colors?      --> Multicolor
Just need a tinted icon?          --> Monochrome (default)
```

### Symbol Effect Selection
```
User tapped something             --> .bounce (discrete)
Draw attention to change          --> .wiggle (discrete, iOS 18+)
Ongoing process / loading         --> .pulse, .breathe, .variableColor (indefinite)
Rotation indicates progress       --> .rotate (indefinite, iOS 18+)
Show/hide symbol                  --> .appear / .disappear (transition)
Swap between two symbols          --> .replace (content transition)
Hand-drawn entry/exit             --> .drawOn / .drawOff (iOS 26+)
Progress along path               --> Variable Draw (iOS 26+)
```

### Bounce on Tap
```swift
@State private var count = 0

Image(systemName: "arrow.down.circle")
    .symbolEffect(.bounce, value: count)
```

### Content Transition (Symbol Swap)
```swift
Image(systemName: isFavorite ? "star.fill" : "star")
    .contentTransition(.symbolEffect(.replace))
    .accessibilityLabel(isFavorite ? "Remove from favorites" : "Add to favorites")
```

## Decision Tree

```
What design question do you have?
|
+-- Background color?
|   +-- Media-focused app --> permanent dark
|   +-- Everything else --> systemBackground (adapts to light/dark)
|   +-- Grouped content --> systemGroupedBackground
|
+-- Color choice?
|   +-- UI elements --> semantic colors (label, secondaryLabel, etc.)
|   +-- Brand color needed --> Color Set in asset catalog (light + dark + high contrast)
|   +-- Never hardcode --> Color.black / Color.white
|
+-- Font weight?
|   +-- Avoid: Ultralight, Thin, Light (legibility issues)
|   +-- Headers: Semibold or Bold
|   +-- Body: Regular or Medium
|
+-- SF Symbol rendering?
|   +-- Single tint --> Monochrome (default)
|   +-- Depth from one hue --> Hierarchical
|   +-- Brand/status colors --> Palette (explicit per-layer)
|   +-- Apple's curated colors --> Multicolor (not all symbols support it)
|
+-- Symbol animation?
|   +-- Tap feedback --> Bounce (discrete, value: trigger)
|   +-- Loading/waiting --> Pulse or Breathe (indefinite, isActive: bool)
|   +-- WiFi/signal cycling --> Variable Color (indefinite)
|   +-- Processing spinner --> Rotate (indefinite, iOS 18+)
|   +-- Attention shake --> Wiggle (discrete, iOS 18+)
|   +-- Swap symbols --> Replace content transition
|   +-- Pen-drawn entry --> Draw On (iOS 26+)
|
+-- Light/Dark mode?
|   +-- Always support both, never create app-specific toggle
|   +-- Use semantic colors that adapt automatically
|
+-- Touch targets?
    +-- iOS/iPadOS: 44x44 points minimum
    +-- macOS: 20x20 points minimum
    +-- Contrast: 4.5:1 minimum, 7:1 for small text
```

## Anti-Patterns

**HIG Violations**
- Hardcoded `Color.black`/`.white` -- use semantic colors (systemBackground, label)
- App-specific dark mode toggle -- users expect systemwide preference honored
- Logo on every screen / navigation bar -- wastes space, violates content-first principle
- Ultralight/Thin/Light font weights -- legibility failures, accessibility risk
- Custom brand color for all text -- may fail 4.5:1 contrast requirement
- Splash screen with branding -- launch screens cannot include branding per HIG

**SF Symbol Mistakes**
- `.foregroundColor()` with Multicolor mode -- overrides Apple's curated colors
- Palette with only 1 color -- equivalent to Monochrome, provide colors for each layer
- Assuming all symbols support Multicolor -- unsupported fall back to Monochrome
- Hierarchical for status indicators where layers need distinct meaning -- use Palette
- Bounce effect for loading state -- one-shot, doesn't convey "ongoing"; use Pulse/Breathe
- Pulse for tap feedback -- too subtle; use Bounce
- Missing `.accessibilityLabel` on symbol images -- VoiceOver reads raw symbol name
- Using iOS 18+ effects without version check -- crashes on iOS 17

**Rendering Mode + Effect Conflicts**
- Multiple `.symbolEffect()` on same view can conflict -- use single effect or combine with options
- `.tint` vs `.foregroundStyle` confusion in UIKit -- tintColor for Mono/Hierarchical, paletteColors for Palette

## Deep Patterns

### Four Rendering Modes

#### Monochrome (default)
```swift
Image(systemName: "cloud.rain.fill")
    .foregroundStyle(.blue)
// All layers same color. Use for: toolbar items, tab bar, matching text.
```

#### Hierarchical
```swift
Image(systemName: "cloud.rain.fill")
    .symbolRenderingMode(.hierarchical)
    .foregroundStyle(.blue)
// Layers at different opacities from single color. Most common for polished UI.
```

#### Palette
```swift
Image(systemName: "cloud.rain.fill")
    .symbolRenderingMode(.palette)
    .foregroundStyle(.blue, .cyan)
// Explicit per-layer colors. Fewer colors than layers: last color reused.
```

#### Multicolor
```swift
Image(systemName: "cloud.rain.fill")
    .symbolRenderingMode(.multicolor)
// Apple's fixed curated colors. Cannot customize. Not all symbols support it.
```

### Discrete Effects (Fire Once on Value Change)
```swift
// Bounce
.symbolEffect(.bounce, value: count)
.symbolEffect(.bounce.up, value: count)

// Wiggle (iOS 18+)
.symbolEffect(.wiggle, value: notificationCount)
.symbolEffect(.wiggle.forward, value: count)  // RTL-aware

// Rotate (discrete, iOS 18+)
.symbolEffect(.rotate, value: refreshCount)
```

### Indefinite Effects (Continuous While Active)
```swift
// Pulse -- subtle opacity pulse for waiting
.symbolEffect(.pulse, isActive: isConnecting)

// Variable Color -- layer cycling for signal/progress
.symbolEffect(.variableColor.iterative, isActive: isSearching)
.symbolEffect(.variableColor.cumulative, isActive: isLoading)

// Scale
.symbolEffect(.scale.up, isActive: isRecording)

// Breathe (iOS 18+) -- rhythmic scale
.symbolEffect(.breathe, isActive: isMonitoring)

// Rotate (indefinite, iOS 18+)
.symbolEffect(.rotate, isActive: isProcessing)
```

### Effect Options
```swift
.symbolEffect(.bounce, options: .repeat(3), value: count)
.symbolEffect(.pulse, options: .speed(2.0), isActive: true)
.symbolEffect(.bounce, options: .repeat(5).speed(1.5), value: count)
```

### Transitions (View Enter/Leave)
```swift
if showSymbol {
    Image(systemName: "checkmark.circle.fill")
        .transition(.symbolEffect(.appear))
}
// .appear.up, .appear.down, .disappear.up, .disappear.down
```

### Content Transitions (Symbol Swap)
```swift
Image(systemName: isFavorite ? "star.fill" : "star")
    .contentTransition(.symbolEffect(.replace))

// Replace variants: .replace.downUp, .replace.upUp, .replace.offUp
// Magic Replace automatic for structurally similar pairs (star/star.fill)
```

### Draw Animations (iOS 26+, SF Symbols 7)

#### Draw On / Draw Off
```swift
Image(systemName: "checkmark.circle")
    .symbolEffect(.drawOn, isActive: isComplete)

Image(systemName: "star.fill")
    .symbolEffect(.drawOff, isActive: isHidden)
```

#### Playback Modes
```swift
.symbolEffect(.drawOn.byLayer, isActive: show)        // Staggered (default)
.symbolEffect(.drawOn.wholeSymbol, isActive: show)     // All at once
.symbolEffect(.drawOn.individually, isActive: show)    // Sequential
```

#### Variable Draw (Progress)
```swift
Image(systemName: "thermometer.high", variableValue: temperature)
    .symbolVariableValueMode(.draw)  // Path-based progress
```

#### Gradient Rendering (iOS 26+)
```swift
Image(systemName: "star.fill")
    .symbolColorRenderingMode(.gradient)
    .foregroundStyle(.red)
```

### Version-Safe Effect Usage
```swift
struct BellEffect: ViewModifier {
    let count: Int
    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.symbolEffect(.wiggle, value: count)
        } else {
            content.symbolEffect(.bounce, value: count)
        }
    }
}
```

### Custom Symbol Draw Annotation
1. Open custom symbol in SF Symbols 7 app
2. Select path layer, add guide points (start, end, corner, bidirectional)
3. Minimum 2 guide points per path
4. Test in Preview panel across weight variants

### HIG Core Principles
1. **Clarity** -- content paramount, interface defers, every element has purpose
2. **Consistency** -- standard gestures, platform conventions, system colors/fonts
3. **Deference** -- UI doesn't compete with content, subtle backgrounds, restrained branding

### Pre-Ship Checklist
- [ ] Light Mode + Dark Mode tested
- [ ] Increased Contrast + Reduce Transparency tested
- [ ] Dynamic Type scales to 200% without truncation
- [ ] No light font weights (Regular minimum)
- [ ] Contrast ratio >= 4.5:1 (7:1 for small text)
- [ ] Touch targets >= 44x44 points
- [ ] Information conveyed by more than color alone
- [ ] VoiceOver labels on all interactive elements + symbols
- [ ] Reduce Motion respected (symbol effects auto-handled)
- [ ] RTL language support, no hardcoded strings in images

### Platform Quick Tips
| Platform | Key Design Notes |
|----------|-----------------|
| iOS | Portrait-first, one-handed reach, bottom tab bar, swipe back |
| iPadOS | Sidebar-adaptable, split view, pointer, arbitrary windows (iOS 26+) |
| macOS | Menu bar commands, dense layouts, pointer-first, window chrome |
| watchOS | Glanceable, full-bleed, Digital Crown |
| tvOS | Focus-based, 10-foot distance, large targets |
| visionOS | Spatial layout, glass materials, comfortable depth |

## Diagnostics

### Symbol Effect Not Playing
1. Check iOS version -- Bounce/Pulse/Scale: iOS 17+, Wiggle/Rotate/Breathe: iOS 18+, Draw: iOS 26+
2. Check Reduce Motion setting -- most effects auto-suppressed when enabled
3. Check trigger type -- discrete needs `value:` that changes, indefinite needs `isActive: true`
4. Check symbol compatibility in SF Symbols app Animation inspector
5. Check for conflicting `.symbolEffect()` modifiers on same view

### Wrong Symbol Colors
1. Rendering mode not set -- add `.symbolRenderingMode(.hierarchical)` or `.palette`
2. `.foregroundStyle` from parent overriding -- apply rendering mode directly on Image
3. Multicolor not supported by symbol -- falls back to Monochrome silently

### Custom Symbol Weight Mismatch
Symbol weight follows applied `.font()` weight. Ensure custom symbol has 9 weight variants exported from SF Symbols app. Use `.imageScale()` for size, `.font()` for weight matching.

### Draw Animation Not Working on Custom Symbol
Needs Draw annotation with >= 2 guide points per path. Guide points on stroked paths, not fills. Requires SF Symbols 7+ app for annotation.

### Defending HIG Decisions
When stakeholders request HIG violations (logo everywhere, light fonts, custom dark toggle):
1. Show Apple's specific guidance
2. Demonstrate accessibility/rejection risk
3. Offer HIG-compliant alternatives (brand tint color, accent color for actions, onboarding branding)
4. If overruled, document decision and risks in writing

## Related

- `ax-design-ref` -- comprehensive HIG API reference, typography scales, Liquid Glass design specs
- `ax-swiftui` -- SwiftUI patterns and decision guidance
- `ax-swiftui-ref` -- SwiftUI API reference including animation system
