---
name: ax-uikit
description: UIKit-SwiftUI bridging (UIViewRepresentable, UIHostingController, UIHostingConfiguration), Auto Layout debugging, CAAnimation diagnosis, @Observable shared state, gesture recognizer bridging
license: MIT
---

# UIKit

## Quick Patterns

### UIViewRepresentable (UIView -> SwiftUI)
```swift
struct MapView: UIViewRepresentable {
    let region: MKCoordinateRegion

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.delegate = context.coordinator
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        // Guard: only update if actually changed
        if map.region.center.latitude != region.center.latitude {
            map.setRegion(region, animated: true)
        }
    }

    static func dismantleUIView(_ map: MKMapView, coordinator: Coordinator) {
        map.removeAnnotations(map.annotations)
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, MKMapViewDelegate {
        var parent: MapView
        init(_ parent: MapView) { self.parent = parent }
    }
}
```

Lifecycle: `makeUIView` (once) -> `updateUIView` (every state change) -> `dismantleUIView` (cleanup).

### Coordinator with Bindings (UIKit -> SwiftUI)
```swift
struct SearchField: UIViewRepresentable {
    @Binding var text: String

    func makeUIView(context: Context) -> UISearchBar {
        let bar = UISearchBar()
        bar.delegate = context.coordinator
        return bar
    }

    func updateUIView(_ bar: UISearchBar, context: Context) {
        bar.text = text  // SwiftUI -> UIKit
    }

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, UISearchBarDelegate {
        var parent: SearchField
        init(_ parent: SearchField) { self.parent = parent }

        func searchBar(_ searchBar: UISearchBar, textDidChange searchText: String) {
            parent.text = searchText  // UIKit -> SwiftUI
        }
    }
}
```

### UIViewControllerRepresentable
```swift
struct PhotoPicker: UIViewControllerRepresentable {
    @Binding var selectedImages: [UIImage]
    @Environment(\.dismiss) private var dismiss

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration()
        config.selectionLimit = 5
        config.filter = .images
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: PHPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(self) }

    class Coordinator: NSObject, PHPickerViewControllerDelegate {
        var parent: PhotoPicker
        init(_ parent: PhotoPicker) { self.parent = parent }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            parent.selectedImages = []
            for result in results {
                result.itemProvider.loadObject(ofClass: UIImage.self) { image, _ in
                    if let image = image as? UIImage {
                        DispatchQueue.main.async { self.parent.selectedImages.append(image) }
                    }
                }
            }
            parent.dismiss()
        }
    }
}
```

### UIHostingController (SwiftUI -> UIKit)
```swift
// Push onto UIKit nav stack
let hostingController = UIHostingController(rootView: ProfileView(user: user))
navigationController?.pushViewController(hostingController, animated: true)

// Child VC embedding (iOS 16+)
let hostingController = UIHostingController(rootView: StatusCard(status: status))
hostingController.sizingOptions = .intrinsicContentSize
addChild(hostingController)
view.addSubview(hostingController.view)
hostingController.view.translatesAutoresizingMaskIntoConstraints = false
NSLayoutConstraint.activate([
    hostingController.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
    hostingController.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    hostingController.view.topAnchor.constraint(equalTo: headerView.bottomAnchor)
])
hostingController.didMove(toParent: self)
```

### UIHostingConfiguration (iOS 16+, SwiftUI cells)
```swift
cell.contentConfiguration = UIHostingConfiguration {
    HStack {
        Image(systemName: item.icon).foregroundStyle(.tint)
        VStack(alignment: .leading) {
            Text(item.title).font(.headline)
            Text(item.subtitle).font(.subheadline).foregroundStyle(.secondary)
        }
    }
}
.margins(.all, EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
.minSize(width: nil, height: 44)
```

### UIGestureRecognizerRepresentable (iOS 18+)
```swift
struct LongPressGesture: UIGestureRecognizerRepresentable {
    @Binding var pressLocation: CGPoint?

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let recognizer = UILongPressGestureRecognizer()
        recognizer.minimumPressDuration = 0.5
        return recognizer
    }

    func handleUIGestureRecognizerAction(_ recognizer: UILongPressGestureRecognizer, context: Context) {
        switch recognizer.state {
        case .began: pressLocation = context.converter.localLocation
        case .ended, .cancelled: pressLocation = nil
        default: break
        }
    }
}
```

### @Observable Shared State
```swift
@Observable class AppState {
    var userName: String = ""
    var itemCount: Int = 0
}

// SwiftUI: automatic tracking
struct ProfileView: View {
    @State var appState: AppState
    var body: some View { Text("Welcome, \(appState.userName)") }
}

// UIKit (iOS 17-25): manual observation
class DashboardVC: UIViewController {
    let appState: AppState
    private func observeState() {
        withObservationTracking {
            titleLabel.text = appState.userName
        } onChange: {
            DispatchQueue.main.async { [weak self] in self?.observeState() }
        }
    }
}

// UIKit (iOS 26+): automatic tracking in updateProperties()
override func updateProperties() {
    super.updateProperties()
    titleLabel.text = appState.userName
}
```

### Auto Layout Symbolic Breakpoint
1. Breakpoint Navigator > + > Symbolic Breakpoint
2. Symbol: `UIViewAlertForUnsatisfiableConstraints`
3. Identify views from memory addresses:
```lldb
po $arg1
expr ((UIView *)0x7f8b9c4).backgroundColor = [UIColor redColor]
expr -l objc++ -O -- [[UIWindow keyWindow] _autolayoutTrace]
po [0x7f8b9c4 constraintsAffectingLayoutForAxis:0]  // horizontal
po [0x7f8b9c4 constraintsAffectingLayoutForAxis:1]  // vertical
```

### Constraint Naming (Prevention)
```swift
let widthConstraint = imageView.widthAnchor.constraint(equalToConstant: 100)
widthConstraint.identifier = "ProfileImageWidth"
widthConstraint.isActive = true
```

## Decision Tree

```
What are you doing with UIKit?
+-- Wrapping UIView in SwiftUI? --> UIViewRepresentable
+-- Wrapping UIViewController in SwiftUI? --> UIViewControllerRepresentable
+-- Wrapping UIGestureRecognizer in SwiftUI? --> UIGestureRecognizerRepresentable (iOS 18+)
+-- Embedding SwiftUI in UIKit nav? --> UIHostingController
+-- SwiftUI in collection/table cells? --> UIHostingConfiguration (iOS 16+)
+-- Sharing state between UIKit & SwiftUI? --> @Observable shared model
|
+-- Constraint error in console?
|   +-- Can't identify views? --> Symbolic breakpoint + memory address coloring
|   +-- Conflicts shown? --> Check priorities, remove over-constraints
|   +-- Ambiguous layout? --> _autolayoutTrace, add missing constraints
|   +-- Views wrong but no errors? --> Debug View Hierarchy
|
+-- CAAnimation issue?
    +-- Completion never fires? --> Set handler BEFORE layer.add()
    +-- Duration mismatch? --> Check CATransaction wrapping, layer.speed
    +-- Animation reverts? --> isRemovedOnCompletion = false, fillMode = .forwards
    +-- Spring wrong on device? --> Adapt to device performance class
    +-- Gesture + animation jank? --> CADisplayLink synchronization
```

## Anti-Patterns

### Rebuilding UIKit view in updateUIView
```swift
// WRONG: Recreates view every state change
func updateUIView(_ map: MKMapView, context: Context) {
    let newMap = MKMapView() // Flickering, lost state
}
// FIX: Create in makeUIView. Patch properties in updateUIView.
```

### Using closures instead of Coordinator
Closures capture the struct value (not reference), become stale on updates, and cannot conform to delegate protocols. Use the Coordinator pattern.

### Dismissing UIKit controller directly
```swift
// WRONG: Bypasses SwiftUI presentation state
controller.dismiss(animated: true)
// FIX: Use @Environment(\.dismiss) or @Binding var isPresented
```

### Modifying layout properties on representable view
Never modify `center`, `bounds`, `frame`, or `transform` on the wrapped UIView. SwiftUI owns these. Use `intrinsicContentSize` or `sizeThatFits(_:)`.

### Missing translatesAutoresizingMaskIntoConstraints
```swift
// WRONG: Autoresizing mask creates conflicting constraints
let imageView = UIImageView()
view.addSubview(imageView)
imageView.widthAnchor.constraint(equalToConstant: 100).isActive = true

// FIX: Disable before adding constraints
imageView.translatesAutoresizingMaskIntoConstraints = false
```

### Over-constraining (3 horizontal constraints)
```swift
// WRONG: leading + trailing + width = conflict
imageView.widthAnchor.constraint(equalToConstant: 300).isActive = true
imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20).isActive = true
imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20).isActive = true

// FIX: Use 2 of 3, or lower priority on width
let width = imageView.widthAnchor.constraint(equalToConstant: 300)
width.priority = .defaultHigh  // Can break if needed
width.isActive = true
```

### Setting CAAnimation completion AFTER add()
```swift
// WRONG: Too late, handler never fires
layer.add(animation, forKey: "anim")
animation.completion = { finished in print("Done") }

// FIX: Set completion BEFORE add()
animation.completion = { [weak self] finished in self?.doNextStep() }
layer.add(animation, forKey: "anim")
```

### Strong self in animation completion
```swift
// WRONG: Guaranteed retain cycle
anim.completion = { finished in self.property = "value" }

// FIX: Always [weak self]
anim.completion = { [weak self] finished in
    guard let self else { return }
    self.property = "value"
}
```

### CATransaction overriding animation duration
```swift
// WRONG: Transaction overrides all animation durations
CATransaction.begin()
CATransaction.setAnimationDuration(2.0)
let anim = CABasicAnimation(keyPath: "position")
anim.duration = 0.5  // Ignored!
layer.add(anim, forKey: nil)
CATransaction.commit()

// FIX: Set duration on animation, not transaction
```

## Deep Patterns

### UITraitBridgedEnvironmentKey (iOS 17+)
Bidirectional bridging of custom environment values between UIKit traits and SwiftUI:
```swift
// 1. UIKit trait
struct FeatureOneTrait: UITraitDefinition { static let defaultValue = false }
extension UIMutableTraits {
    var featureOne: Bool {
        get { self[FeatureOneTrait.self] }
        set { self[FeatureOneTrait.self] = newValue }
    }
}

// 2. SwiftUI EnvironmentKey
struct FeatureOneKey: EnvironmentKey { static let defaultValue = false }
extension EnvironmentValues {
    var featureOne: Bool {
        get { self[FeatureOneKey.self] }
        set { self[FeatureOneKey.self] = newValue }
    }
}

// 3. Bridge
extension FeatureOneKey: UITraitBridgedEnvironmentKey {
    static func read(from traitCollection: UITraitCollection) -> Bool {
        traitCollection[FeatureOneTrait.self]
    }
    static func write(to mutableTraits: inout UIMutableTraits, value: Bool) {
        mutableTraits.featureOne = value
    }
}
// Push from UIKit: viewController.traitOverrides.featureOne = true
```

### sizeThatFits for Custom Representable Sizing
```swift
func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
    let width = proposal.width ?? UIView.layoutFittingCompressedSize.width
    return uiView.systemLayoutSizeFitting(
        CGSize(width: width, height: UIView.layoutFittingCompressedSize.height),
        withHorizontalFittingPriority: .required,
        verticalFittingPriority: .fittingSizeLevel
    )
}
```

### Animation Bridging (SwiftUI -> UIKit)
```swift
func updateUIView(_ uiView: UIView, context: Context) {
    if context.transaction.animation != nil {
        UIView.animate(withDuration: 0.3) { uiView.alpha = isVisible ? 1 : 0 }
    } else {
        uiView.alpha = isVisible ? 1 : 0
    }
}
```

### Scroll-Tracking for Navigation Bars
```swift
// In updateUIView for wrapped UIScrollView
if let navController = sequence(first: table as UIResponder, next: \.next)
    .compactMap({ $0 as? UINavigationController }).first {
    navController.navigationBar.setContentScrollView(table, forEdge: .top)
}
```

### Content Hugging and Compression Resistance
```swift
// Label should not stretch beyond text width
label.setContentHuggingPriority(.defaultHigh, for: .horizontal)

// Label should not truncate
label.setContentCompressionResistancePriority(.required, for: .horizontal)
```

Priority levels: `.required` (1000), `.defaultHigh` (750), `.defaultLow` (250), custom 1-999.

### CADisplayLink for Gesture + Animation Sync
```swift
var displayLink: CADisplayLink?

func startSyncedAnimation() {
    displayLink = CADisplayLink(target: self, selector: #selector(updateAnimation))
    displayLink?.add(to: .main, forMode: .common)
}

@objc func updateAnimation() {
    let position = calculatePosition(from: currentGesture)
    layer.position = position  // Synchronized with screen refresh
}
```

### isRemovedOnCompletion & fillMode
```swift
// Keep animation's final state after completion
anim.isRemovedOnCompletion = false
anim.fillMode = .forwards
layer.add(anim, forKey: nil)
```

### Multiple Animations (Same keyPath)
```swift
// Remove old animation before adding new with same key
layer.removeAnimation(forKey: "slide")
let anim = CABasicAnimation(keyPath: "position.x")
anim.toValue = 200
layer.add(anim, forKey: "slide")
```

## Diagnostics

### Auto Layout: Constraint Error in Console
1. Set symbolic breakpoint: `UIViewAlertForUnsatisfiableConstraints`
2. Color views: `expr ((UIView *)0xADDR).backgroundColor = [UIColor redColor]`
3. Print hierarchy: `expr -l objc++ -O -- [[UIWindow keyWindow] _autolayoutTrace]`
4. Check axis: `po [0xADDR constraintsAffectingLayoutForAxis:0]` (0=H, 1=V)
5. Verify `translatesAutoresizingMaskIntoConstraints = false`

### Auto Layout: Every View Needs
- Horizontal: 2 constraints (leading+width, leading+trailing, or centerX+width)
- Vertical: 2 constraints (top+height, top+bottom, or centerY+height)

### UIKit-SwiftUI: Common Gotchas

| Symptom | Fix |
|---------|-----|
| Coordinator not receiving callbacks | Set delegate in `makeUIView`, not `updateUIView` |
| updateUIView causes flickering | Guard with equality checks before applying changes |
| Custom environment nil across bridge | Use UITraitBridgedEnvironmentKey (iOS 17+) or inject explicitly |
| Large title won't collapse | Call `setContentScrollView(_:forEdge:)` on nav bar |
| UIHostingController zero-sized | Use `sizingOptions: .intrinsicContentSize` (iOS 16+) |
| Mixed nav stacks break | Don't mix UINavigationController and NavigationStack in same flow |
| @Observable not updating UIKit | Use `withObservationTracking()` or `updateProperties()` (iOS 26+) |
| Keyboard hides content in hybrid | Use `UIKeyboardLayoutGuide` (iOS 15+) constraints |

### CAAnimation: Diagnostic Steps
```swift
// 1. Check if completion fires
animation.completion = { [weak self] finished in print("FIRED: \(finished)") }

// 2. Check actual vs declared duration
let start = Date()
layer.add(anim, forKey: "test")
DispatchQueue.main.asyncAfter(deadline: .now() + 0.51) {
    print("Elapsed: \(Date().timeIntervalSince(start))")
}

// 3. Check active animations
layer.animationKeys()?.forEach { key in
    if let a = layer.animation(forKey: key) {
        print("\(key): duration=\(a.duration), removed=\(a.isRemovedOnCompletion)")
    }
}

// 4. Check layer state
print("speed: \(layer.speed), timeOffset: \(layer.timeOffset)")
```

### CAAnimation: Quick Reference

| Issue | Check | Fix |
|-------|-------|-----|
| Completion never fires | Handler set BEFORE add()? | Move completion before add() |
| Duration mismatch | CATransaction wrapping? | Set duration on animation, not transaction |
| Animation reverts | isRemovedOnCompletion? | Set false + fillMode = .forwards |
| Jank on older devices | Hardcoded values? | Use ProcessInfo for device class |
| Gesture + animation jank | Synced updates? | Use CADisplayLink |
| Multiple animations conflict | Same key? | removeAnimation first or unique keys |

## Related

- `ax-swiftui` -- SwiftUI views, state, navigation, layout
- `ax-design` -- HIG patterns, SF Symbols, typography
- `ax-concurrency` -- @MainActor patterns, async/await
- `ax-performance` -- Instruments profiling, memory, CPU
- `ax-lldb` -- Debugger commands, breakpoints, expression evaluation
