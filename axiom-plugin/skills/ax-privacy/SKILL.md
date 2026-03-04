---
name: ax-privacy
description: Privacy manifests, permissions UX, ATT, localization (String Catalogs, plurals, RTL, Xcode 26 generated symbols), Transferable/drag-drop/copy-paste/ShareLink, App Intents discoverability, debug deep links, and Required Reason APIs
license: MIT
---
# Privacy, Localization & App Integration

## Quick Patterns

### Privacy Manifest Setup
```xml
<!-- PrivacyInfo.xcprivacy -->
<key>NSPrivacyTracking</key>
<false/>
<key>NSPrivacyCollectedDataTypes</key>
<array><!-- Data types collected --></array>
<key>NSPrivacyAccessedAPITypes</key>
<array><!-- Required Reason APIs --></array>
```

### Permission Request Flow
```
User triggers feature
+-- Show pre-permission education (your dialog)
    +-- User taps "Continue"
        +-- Show system permission dialog
            +-- Granted --> open feature
            +-- Denied  --> show Settings prompt (never dead-end)
```

### Just-in-Time Permission
```swift
@objc func takePhotoButtonTapped() {
    showCameraEducation {
        AVCaptureDevice.requestAccess(for: .video) { granted in
            if granted { self.openCamera() }
            else { self.showSettingsPrompt() }
        }
    }
}
```

### String Catalog Localization
```swift
// SwiftUI -- auto-localizable
Text("Welcome to WWDC!")
Label("Thanks for shopping!", systemImage: "bag")

// Explicit with comment
let title = String(localized: "Settings", comment: "Tab bar item title")

// Deferred lookup
struct CardView: View {
    let title: LocalizedStringResource
    var body: some View { Text(title) }
}
```

### Transferable Type Decision
```
Model conforms to Codable?       --> CodableRepresentation
Custom binary format in memory?  --> DataRepresentation
Large file on disk?              --> FileRepresentation
Need fallback for simple types?  --> ProxyRepresentation (add last)
```

### Drag and Drop
```swift
// Make draggable
Text(profile.name).draggable(profile)

// Accept drops
Color.clear
    .frame(width: 200, height: 200)
    .contentShape(Rectangle())
    .dropDestination(for: Profile.self) { profiles, location in
        guard let profile = profiles.first else { return false }
        self.droppedProfile = profile
        return true
    }
```

### App Discoverability (6-Step Strategy)
```
1. App Intents      -- expose actions to Siri/Shortcuts
2. App Shortcuts    -- instant availability, suggested phrases
3. Core Spotlight   -- index searchable content
4. NSUserActivity   -- mark high-value screens
5. Clear metadata   -- action-oriented titles/descriptions
6. Usage boosting   -- promote with SiriTipView, let system learn
```

### Debug Deep Link (Simulator Testing)
```swift
#if DEBUG
.onOpenURL { url in
    guard url.scheme == "debug" else { return }
    switch url.host {
    case "settings": path.append(Destination.settings)
    case "recipe":
        if let id = url.queryItems?["id"], let rid = Int(id) {
            path.append(Destination.recipe(id: rid))
        }
    case "reset": path = NavigationPath()
    default: print("Unknown debug URL: \(url)")
    }
}
#endif
// Usage: xcrun simctl openurl booted "debug://settings"
```

## Decision Tree

```
What integration question do you have?
|
+-- Privacy / data collection?
|   +-- Creating privacy manifest --> PrivacyInfo.xcprivacy (NSPrivacyTracking, CollectedDataTypes, AccessedAPITypes)
|   +-- Requesting permissions --> just-in-time with pre-education dialog
|   +-- App Tracking Transparency --> ATTrackingManager.requestTrackingAuthorization
|   +-- Required Reason APIs --> declare in manifest with approved reason codes
|   +-- Tracking domains --> separate tracking from app functionality domains
|   +-- Privacy Nutrition Labels --> use Xcode Privacy Report from archive
|
+-- Localization / i18n?
|   +-- New project --> String Catalogs (.xcstrings, Xcode 15+)
|   +-- Legacy migration --> Editor > Convert to String Catalog
|   +-- Plurals --> "\(count) items" -- Xcode creates plural variations automatically
|   +-- RTL support --> use .leading/.trailing (never .left/.right)
|   +-- Date/number formatting --> DateFormatter/NumberFormatter with Locale.current
|   +-- App Shortcuts phrases --> extracted to String Catalog automatically
|   +-- Type-safe strings (Xcode 26+) --> Generated Symbols from manual catalog entries
|   +-- Swift Package localization (Xcode 26+) --> bundle: #bundle macro
|
+-- Content sharing?
|   +-- Share sheet --> ShareLink with SharePreview
|   +-- Drag and drop --> .draggable / .dropDestination
|   +-- Copy/paste (macOS) --> .copyable / .pasteDestination
|   +-- Copy/paste (iOS) --> PasteButton (iOS 16+)
|   +-- Custom type sharing --> Transferable protocol with TransferRepresentation
|   +-- Cross-app sharing --> UTType declared in both Swift AND Info.plist
|   +-- UIKit bridging --> NSItemProvider.loadTransferable
|
+-- App discoverability?
|   +-- Spotlight search --> Core Spotlight (CSSearchableItem)
|   +-- Siri suggestions --> App Intents + App Shortcuts
|   +-- Action Button --> AppShortcutsProvider with phrases
|   +-- Screen prediction --> NSUserActivity with isEligibleForPrediction
|   +-- Entity search --> IndexedEntity protocol
|   +-- Promoting shortcuts --> SiriTipView in app UI
|
+-- Debug deep links?
    +-- Simulator navigation --> debug:// URL scheme with #if DEBUG
    +-- State configuration --> query parameters for error/empty states
    +-- Screenshot automation --> xcrun simctl openurl + screenshot capture
    +-- Release safety --> strip URL scheme from Release builds
```

## Anti-Patterns

**Privacy Mistakes**
- Requesting all permissions at launch -- overwhelms users, increases denial rate
- No pre-permission education dialog -- system dialog rejection rate 60-80% higher
- Dead-ending on permission denial -- always offer Settings prompt as path forward
- `NSPrivacyTracking = true` without `NSPrivacyTrackingDomains` -- incomplete manifest
- Using Required Reason APIs without manifest declaration -- App Review rejection
- Fingerprinting via device APIs -- never allowed, even with ATT permission
- Single domain for tracking + app functionality -- separate so blocking doesn't break app

**Localization Mistakes**
- Concatenating localized strings -- word order varies by language
- `"\(count) item(s)"` -- use proper plural handling via String Catalog
- `.padding(.left, 16)` -- use `.leading` for RTL support
- `formatter.dateFormat = "MM/dd/yyyy"` -- use `.dateStyle = .short` with `Locale.current`
- Missing `comment:` parameter -- translators need context for accurate translation
- `String.localizedStringWithFormat` with stringsdict -- use String Catalog automatic plurals
- Using `.font()` modifier with AttributedString paragraph styles -- set font inside AttributedString instead

**Transferable Mistakes**
- ProxyRepresentation listed before CodableRepresentation -- receivers always get plain text
- UTType declared in Swift but missing Info.plist entry -- cross-app transfers silently fail
- Not copying file in FileRepresentation importing closure -- sandbox extension expires
- `.dropDestination` on zero-frame view -- add `.frame()` and `.contentShape(Rectangle())`
- Stacking multiple `.dropDestination` modifiers -- use enum wrapper instead
- `.foregroundColor()` with Multicolor mode -- overrides Apple's curated colors
- Async work inside FileRepresentation importing closure -- copy file first, process async afterward

**Discoverability Mistakes**
- App Intents without AppShortcutsProvider -- actions won't surface automatically
- Indexing everything in Core Spotlight -- index selectively (recent, favorites, frequently accessed)
- Generic intent titles ("Action", "Do Thing") -- use specific action-oriented language
- Marking every screen as eligible for prediction -- only high-value content screens
- NSUserActivity not connected to App Intent entities -- use `appEntityIdentifier`
- Not promoting shortcuts in app UI -- use SiriTipView to educate users

**Debug Deep Link Mistakes**
- Debug URL handler not wrapped in `#if DEBUG` -- security risk in production
- Force-unwrapping query parameters -- validate all parameters
- Hardcoding navigation in URL handler -- use existing NavigationPath/router
- URL scheme not stripped from Release builds -- add build script or separate Info.plist

## Deep Patterns

### Privacy Manifests (PrivacyInfo.xcprivacy)

#### Complete Manifest Structure
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array>
        <string>tracking.example.com</string>
    </array>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeEmailAddress</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <true/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array>
                <string>CA92.1</string>
            </array>
        </dict>
    </array>
</dict>
</plist>
```

#### Required Reason API Categories
| API Category | Examples | Common Reason Codes |
|--------------|----------|-------------------|
| File timestamp | `creationDate`, `modificationDate` | `C617.1` - `DDA9.1` |
| System boot time | `systemUptime` | `35F9.1`, `8FFB.1` |
| Disk space | `NSFileSystemFreeSize`, `volumeAvailableCapacity` | `E174.1`, `7D9E.1` |
| Active keyboards | `activeInputModes` | `54BD.1`, `3EC4.1` |
| User defaults | `UserDefaults` | `CA92.1`, `1C8F.1`, `C56D.1` |

#### Tracking Domain Separation
```
Before (mixed):
  api.example.com (tracking + app functionality)

After (separated):
  api.example.com       (app functionality only)
  tracking.example.com  (tracking only, declared in NSPrivacyTrackingDomains)
```
iOS 17: tracking domains automatically blocked if user denies ATT.

### App Tracking Transparency

```swift
import AppTrackingTransparency
import AdSupport

func requestTrackingPermission() {
    guard #available(iOS 14.5, *) else { return }
    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        ATTrackingManager.requestTrackingAuthorization { status in
            switch status {
            case .authorized:
                let idfa = ASIdentifierManager.shared().advertisingIdentifier
                self.initializeTrackingSDKs(idfa: idfa)
            case .denied, .notDetermined, .restricted:
                self.initializeNonTrackingSDKs()
            @unknown default:
                self.initializeNonTrackingSDKs()
            }
        }
    }
}
```

**Info.plist** (required):
```xml
<key>NSUserTrackingUsageDescription</key>
<string>This helps us show you relevant ads for products you might like</string>
```

**When ATT is required**: tracking users across apps/websites, sharing with data brokers, third-party SDKs that track.

**When ATT is NOT required**: first-party analytics only, on-device personalization, fraud detection.

### Permission Request UX

#### Full Permission Handler
```swift
func handleCameraPermission() {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized:
        openCamera()
    case .notDetermined:
        showCameraEducation {
            AVCaptureDevice.requestAccess(for: .video) { granted in
                if granted { self.openCamera() }
                else { self.showSettingsPrompt() }
            }
        }
    case .denied, .restricted:
        showSettingsPrompt()
    @unknown default:
        break
    }
}

func showSettingsPrompt() {
    let alert = UIAlertController(
        title: "Camera Access Required",
        message: "Please enable camera access in Settings to use this feature.",
        preferredStyle: .alert
    )
    alert.addAction(UIAlertAction(title: "Open Settings", style: .default) { _ in
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    })
    alert.addAction(UIAlertAction(title: "Cancel", style: .cancel))
    present(alert, animated: true)
}
```

#### Permission Types Quick Reference
| Permission | API | Info.plist Key |
|-----------|-----|---------------|
| Camera | `AVCaptureDevice.requestAccess(for: .video)` | `NSCameraUsageDescription` |
| Microphone | `AVAudioSession.sharedInstance().requestRecordPermission` | `NSMicrophoneUsageDescription` |
| Location (when in use) | `CLLocationManager().requestWhenInUseAuthorization()` | `NSLocationWhenInUseUsageDescription` |
| Location (always) | `CLLocationManager().requestAlwaysAuthorization()` | `NSLocationAlwaysAndWhenInUseUsageDescription` |
| Photos | `PHPhotoLibrary.requestAuthorization(for: .readWrite)` | `NSPhotoLibraryUsageDescription` |
| Contacts | `CNContactStore().requestAccess(for: .contacts)` | `NSContactsUsageDescription` |
| Notifications | `UNUserNotificationCenter.current().requestAuthorization` | (none required) |

### String Catalogs

#### Pluralization
```swift
// Xcode automatically creates plural variations
Text("\(count) items")

// Multiple variables = combinatorial variations
let message = String(localized: "\(songCount) songs on \(albumCount) albums")
// English: 2x2 = 4 entries (one/other x one/other)
// Arabic: 6x6 = 36 entries
```

#### Device-Specific Strings
```json
{
  "Bird Food Shop" : {
    "localizations" : {
      "en" : {
        "variations" : {
          "device" : {
            "applewatch" : { "stringUnit" : { "value" : "Bird Food" } },
            "other" : { "stringUnit" : { "value" : "Bird Food Shop" } }
          }
        }
      }
    }
  }
}
```

#### RTL Layout Support
```swift
// Always use semantic directions
.padding(.leading, 16)    // mirrors for RTL
.frame(alignment: .leading) // mirrors for RTL

// Never use
.padding(.left, 16)       // fixed, breaks RTL

// Directional images
Image(systemName: "chevron.forward") // auto-mirrors
Image("backButton").flipsForRightToLeftLayoutDirection(true)
```

#### Locale-Aware Formatting
```swift
// Dates -- never hardcode format
let formatter = DateFormatter()
formatter.locale = Locale.current
formatter.dateStyle = .long   // adapts to locale

// Currency
let nf = NumberFormatter()
nf.locale = Locale.current
nf.numberStyle = .currency    // $29.99, 29,99 EUR, 30 JPY

// Measurements -- auto-converts units
let distance = Measurement(value: 100, unit: UnitLength.meters)
let mf = MeasurementFormatter()
mf.locale = Locale.current   // "328 ft" (US), "100 m" (metric)
```

#### Xcode 26: Generated Symbols
```swift
// Enable: Build Settings > "Generate String Catalog Symbols" > Yes
// Add strings manually to catalog with + button

// Type-safe usage
Text(.introductionTitle)                    // static property
Text(.subtitle(friendsPosts: 42))           // function with arguments

// Custom table access
Text(Discover.featuredCollection)           // From Discover.xcstrings

// Foundation String
let message = String(localized: .curatedCollection)
```

#### Xcode 26: #bundle Macro (Swift Packages)
```swift
// SwiftUI in Swift Package or framework
Text("My Collections", bundle: #bundle, comment: "Section title")

// With custom table
Text("My Collections", tableName: "Discover", bundle: #bundle, comment: "Section title")
```

### Transferable Protocol

#### CodableRepresentation
```swift
extension UTType {
    static var todo: UTType = UTType(exportedAs: "com.example.todo")
}

struct Todo: Codable, Transferable {
    var text: String
    var isDone: Bool
    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .todo)
    }
}
```

#### FileRepresentation (Large Files)
```swift
struct Video: Transferable {
    let file: URL
    static var transferRepresentation: some TransferRepresentation {
        FileRepresentation(contentType: .mpeg4Movie) { video in
            SentTransferredFile(video.file)
        } importing: { received in
            // MUST copy -- sandbox extension is temporary
            let dest = FileManager.default.temporaryDirectory
                .appendingPathComponent(UUID().uuidString)
                .appendingPathExtension("mp4")
            try FileManager.default.copyItem(at: received.file, to: dest)
            return Video(file: dest)
        }
    }
}
```

#### Multiple Representations (Order Matters)
```swift
struct Profile: Transferable {
    var name: String
    static var transferRepresentation: some TransferRepresentation {
        CodableRepresentation(contentType: .profile)  // richest first
        ProxyRepresentation(exporting: \.name)         // fallback last
    }
}
```

#### UTType Declaration (Info.plist Required for Cross-App)
```xml
<key>UTExportedTypeDeclarations</key>
<array>
    <dict>
        <key>UTTypeIdentifier</key>
        <string>com.myapp.recipe</string>
        <key>UTTypeDescription</key>
        <string>Recipe</string>
        <key>UTTypeConformsTo</key>
        <array><string>public.data</string></array>
        <key>UTTypeTagSpecification</key>
        <dict>
            <key>public.filename-extension</key>
            <array><string>recipe</string></array>
        </dict>
    </dict>
</array>
```

#### ShareLink with Preview
```swift
ShareLink(
    item: photo,
    preview: SharePreview(photo.caption, image: photo.image)
)

// Multiple items
ShareLink(items: photos) { photo in
    SharePreview(photo.caption, image: photo.image)
}
```

#### Clipboard (Platform Differences)
```swift
// macOS 13+: .copyable / .pasteDestination / .cuttable
List(items) { item in Text(item.name) }
    .copyable(items)
    .pasteDestination(for: Item.self) { pasted in
        items.append(contentsOf: pasted)
    }

// iOS 16+ / macOS 10.15+: PasteButton
PasteButton(payloadType: String.self) { strings in
    notes.append(contentsOf: strings)
}
```

### App Discoverability

#### App Intent + App Shortcut
```swift
struct OrderCoffeeIntent: AppIntent {
    static var title: LocalizedStringResource = "Order Coffee"
    static var description = IntentDescription("Orders coffee for pickup")

    @Parameter(title: "Coffee Type") var coffeeType: CoffeeType
    @Parameter(title: "Size") var size: CoffeeSize

    func perform() async throws -> some IntentResult {
        try await CoffeeService.shared.order(type: coffeeType, size: size)
        return .result(dialog: "Your \(size) \(coffeeType) is ordered")
    }
}

struct CoffeeAppShortcuts: AppShortcutsProvider {
    @AppShortcutsBuilder
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: OrderCoffeeIntent(),
            phrases: [
                "Order coffee in \(.applicationName)",
                "Get my usual coffee from \(.applicationName)"
            ],
            shortTitle: "Order Coffee",
            systemImageName: "cup.and.saucer.fill"
        )
    }
    static var shortcutTileColor: ShortcutTileColor = .tangerine
}
```

#### Core Spotlight Indexing
```swift
import CoreSpotlight

func indexOrder(_ order: Order) {
    let attributes = CSSearchableItemAttributeSet(contentType: .item)
    attributes.title = order.coffeeName
    attributes.contentDescription = "Order from \(order.date.formatted())"
    attributes.keywords = ["coffee", "order", order.coffeeName]

    let item = CSSearchableItem(
        uniqueIdentifier: order.id.uuidString,
        domainIdentifier: "orders",
        attributeSet: attributes
    )
    CSSearchableIndex.default().indexSearchableItems([item])
}
```

#### NSUserActivity (High-Value Screens)
```swift
let activity = NSUserActivity(activityType: "com.coffeeapp.viewOrder")
activity.title = order.coffeeName
activity.isEligibleForSearch = true
activity.isEligibleForPrediction = true
activity.persistentIdentifier = order.id.uuidString
activity.appEntityIdentifier = order.id.uuidString  // connect to App Intents
activity.becomeCurrent()
```

#### Batch Indexing (Large Libraries)
```swift
func indexAllContent() async {
    let allItems = try await ContentService.shared.all()
    for batch in stride(from: 0, to: allItems.count, by: 100) {
        let slice = Array(allItems[batch..<min(batch + 100, allItems.count)])
        let searchableItems = slice.map { createSearchableItem(from: $0) }
        CSSearchableIndex.default().indexSearchableItems(searchableItems)
        try? await Task.sleep(for: .milliseconds(50))
    }
}
```

### Debug Deep Links

#### NavigationPath Integration (iOS 16+)
```swift
@MainActor
class DebugRouter: ObservableObject {
    @Published var path = NavigationPath()

    #if DEBUG
    func handleDebugURL(_ url: URL) {
        guard url.scheme == "debug" else { return }
        switch url.host {
        case "settings": path.append(Destination.settings)
        case "recipe":
            if let id = url.queryItems?["id"], let recipeID = Int(id) {
                path.append(Destination.recipe(id: recipeID))
            }
        case "recipe-edit":
            if let id = url.queryItems?["id"], let recipeID = Int(id) {
                path.append(Destination.recipe(id: recipeID))
                path.append(Destination.recipeEdit(id: recipeID))
            }
        case "reset": path = NavigationPath()
        default: print("Unknown debug URL: \(url)")
        }
    }
    #endif
}
```

#### State Configuration Links
```swift
#if DEBUG
case "test-scenario":
    // debug://test-scenario?user=premium&recipes=empty&network=slow
    if let userType = url.queryItems?["user"] {
        configureUser(type: userType)
    }
    if let recipesState = url.queryItems?["recipes"] {
        configureRecipes(state: recipesState)
    }
    path.append(Destination.recipes)
#endif
```

#### Info.plist (Strip from Release)
```xml
<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleURLSchemes</key>
        <array><string>debug</string></array>
        <key>CFBundleURLName</key>
        <string>com.example.debug</string>
    </dict>
</array>
```

Build script to strip from Release:
```bash
if [ "${CONFIGURATION}" = "Release" ]; then
    /usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes:0" \
        "${BUILT_PRODUCTS_DIR}/${INFOPLIST_PATH}" 2>/dev/null || true
fi
```

### Xcode Privacy Report
1. Product > Archive
2. Xcode Organizer > Select archive
3. Right-click > "Generate Privacy Report"
4. Review: all manifests, collected data, tracking domains, Required Reason APIs

### Privacy-First Design Principles
- **Data minimization** -- only collect what you need
- **On-device processing** -- use Vision/CoreML locally when possible
- **Value exchange** -- explain why data is needed, what user gets
- **Transparency** -- Privacy Policy and data collection links in Settings

## Diagnostics

### Privacy Manifest Issues
1. App Review rejection for missing manifest --> add `PrivacyInfo.xcprivacy` to target
2. Required Reason API warning --> declare API category + approved reason code
3. Tracking domains not blocking --> verify `NSPrivacyTrackingDomains` array in manifest
4. Points of Interest instrument shows unexpected connections --> declare or remove tracking domains
5. SDK missing privacy manifest --> update SDK or add manifest to SDK's framework target

### Permission Issues
1. System dialog not appearing --> check Info.plist usage description key exists
2. Always getting `.denied` --> dialog was already shown once; guide user to Settings
3. `.limited` photo access --> handle `PHAuthorizationStatus.limited` with `PHPicker`
4. ATT dialog showing too early / auto-denied --> delay request until app is fully active

### Localization Issues
1. Strings not in String Catalog --> enable "Use Compiler to Extract Swift Strings" build setting
2. Translations not showing --> add language in Project > Info > Localizations
3. Plural forms incorrect --> use `"\(count) items"` not `localizedStringWithFormat`
4. XLIFF export missing strings --> enable "Localization Prefers String Catalogs"
5. Generated symbols not appearing (Xcode 26+) --> enable "Generate String Catalog Symbols", strings must be manually added
6. `#bundle` macro not working --> add `import Foundation`, use `bundle: #bundle` parameter
7. AttributedString losing paragraph styles --> set font inside AttributedString, not via `.font()` modifier

### Transferable Issues
1. Cross-app drop silently fails --> add `UTExportedTypeDeclarations` to Info.plist
2. Receiver always gets plain text --> reorder representations (richest first)
3. FileRepresentation file not found --> copy file in importing closure before sandbox extension expires
4. PasteButton always disabled --> check pasteboard contains matching Transferable type
5. `.dropDestination` never fires --> verify `for:` type matches; add `.frame()` and `.contentShape()`
6. ShareLink shows generic preview --> supply explicit `SharePreview` with title and image

### Discoverability Issues
1. Shortcuts not appearing in Shortcuts app --> implement `AppShortcutsProvider`
2. Siri doesn't recognize phrases --> include `\(.applicationName)` in phrases
3. Spotlight not returning content --> verify `attributeSet.title` is set
4. Low Spotlight ranking --> add relevant `keywords` array
5. Stale Spotlight results --> call `deleteSearchableItems(withIdentifiers:)` when content removed
6. NSUserActivity not surfacing --> verify `isEligibleForSearch = true` and `becomeCurrent()` called

### Debug Deep Link Issues
1. URL handler not firing --> verify URL scheme in Info.plist matches
2. Parameters crash --> validate all query params (no force unwrap)
3. Navigation not working --> use existing NavigationPath, not direct state mutation
4. Debug code in production --> wrap in `#if DEBUG`, strip URL scheme from Release

## Related

- `ax-swiftui` -- SwiftUI patterns including navigation and state management
- `ax-swiftui-ref` -- SwiftUI API reference including NavigationStack
- `ax-design` -- HIG design decisions and SF Symbol patterns
- `ax-design-ref` -- Typography, Liquid Glass, HIG API reference
