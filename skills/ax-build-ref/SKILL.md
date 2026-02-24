---
name: ax-build-ref
description: Build settings reference — xcodebuild flags, build settings, SPM configuration, CocoaPods/Carthage commands, xcconfig syntax, scheme configuration
license: MIT
---
# Build Reference

## Quick Patterns

### Find Your Scheme

```bash
xcodebuild -list
```

### Show Build Settings

```bash
xcodebuild -showBuildSettings -scheme YourScheme
xcodebuild -showBuildSettings -scheme YourScheme | grep FRAMEWORK_SEARCH_PATHS
xcodebuild -showBuildSettings -configuration Debug > debug.txt
xcodebuild -showBuildSettings -configuration Release > release.txt
```

### Build Commands

```bash
# Basic build
xcodebuild build -scheme YourScheme

# Build for simulator
xcodebuild build -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16'

# Build for device
xcodebuild build -scheme YourScheme \
  -destination 'platform=iOS,name=Your iPhone'

# Workspace build (CocoaPods)
xcodebuild -workspace YourApp.xcworkspace -scheme YourScheme build

# Project-only build (no CocoaPods)
xcodebuild -project YourApp.xcodeproj -scheme YourScheme build

# Clean build
xcodebuild clean build -scheme YourScheme

# Verbose output
xcodebuild -verbose build -scheme YourScheme

# Build with timing summary
xcodebuild build -scheme YourScheme -showBuildTimingSummary

# Build for testing (faster, no run)
xcodebuild build-for-testing -scheme YourScheme
xcodebuild test-without-building -scheme YourScheme

# Archive
xcodebuild archive -scheme YourApp \
  -archivePath ./build/YourApp.xcarchive

# Build with specific setting override
xcodebuild build -scheme YourScheme \
  COMPILATION_CACHE_ENABLE_CACHING=YES
```

### Test Commands

```bash
# Run all tests
xcodebuild test -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16'

# Run specific test class
xcodebuild test -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:YourTests/SpecificTestClass

# Run specific test method
xcodebuild test -scheme YourScheme \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:YourTests/SpecificTestClass/testMethodName
```

---

## Decision Tree

```
Need to build?
├─ What file type?
│  ├─ .xcworkspace -> xcodebuild -workspace
│  ├─ .xcodeproj  -> xcodebuild -project
│  └─ Package.swift -> swift build
├─ What destination?
│  ├─ Simulator -> -destination 'platform=iOS Simulator,name=iPhone 16'
│  ├─ Device    -> -destination 'platform=iOS,name=Device Name'
│  └─ macOS     -> -destination 'platform=macOS'
├─ What configuration?
│  ├─ Debug   -> -configuration Debug (default)
│  └─ Release -> -configuration Release
└─ Need special flags?
   ├─ Timing -> -showBuildTimingSummary
   ├─ Verbose -> -verbose
   └─ Override setting -> SETTING_NAME=value
```

---

## Anti-Patterns

**Using `-project` when CocoaPods is present** -- Always use `-workspace YourApp.xcworkspace` with CocoaPods.

**Not specifying destination** -- Without `-destination`, xcodebuild may pick an unexpected target device.

**Forgetting to clean after dependency changes** -- Always `xcodebuild clean build` after modifying packages.

---

## Deep Patterns

### Critical Build Settings

#### Compilation

| Setting | Key | Debug | Release | Notes |
|---------|-----|-------|---------|-------|
| Compilation Mode | `SWIFT_COMPILATION_MODE` | `singlefile` | `wholemodule` | Incremental vs whole-module optimization |
| Optimization Level | `SWIFT_OPTIMIZATION_LEVEL` | `-Onone` | `-O` | No optimization vs speed optimization |
| Build Active Architecture Only | `ONLY_ACTIVE_ARCH` | `YES` | `NO` | Single arch for speed vs universal |
| Debug Information Format | `DEBUG_INFORMATION_FORMAT` | `dwarf` | `dwarf-with-dsym` | Embedded vs separate debug symbols |
| Enable Testability | `ENABLE_TESTABILITY` | `YES` | `NO` | Allows @testable import |

#### Signing

| Setting | Key | Notes |
|---------|-----|-------|
| Code Signing Identity | `CODE_SIGN_IDENTITY` | "Apple Development" or "Apple Distribution" |
| Development Team | `DEVELOPMENT_TEAM` | Your 10-character team ID |
| Provisioning Profile | `PROVISIONING_PROFILE_SPECIFIER` | Profile name or UUID |
| Code Sign Style | `CODE_SIGN_STYLE` | `Automatic` or `Manual` |

#### Search Paths

| Setting | Key | Notes |
|---------|-----|-------|
| Framework Search Paths | `FRAMEWORK_SEARCH_PATHS` | `$(PROJECT_DIR)/Frameworks` (recursive) |
| Header Search Paths | `HEADER_SEARCH_PATHS` | For C/ObjC headers |
| Library Search Paths | `LIBRARY_SEARCH_PATHS` | For static/dynamic libraries |

#### Preprocessor

| Setting | Key | Notes |
|---------|-----|-------|
| Preprocessor Macros | `GCC_PREPROCESSOR_DEFINITIONS` | `DEBUG=1` for Debug config |
| Other Swift Flags | `OTHER_SWIFT_FLAGS` | `-warn-long-function-bodies 100` etc. |
| Active Compilation Conditions | `SWIFT_ACTIVE_COMPILATION_CONDITIONS` | `DEBUG` for Debug config |

#### Build Phases

| Setting | Key | Notes |
|---------|-----|-------|
| User Script Sandboxing | `ENABLE_USER_SCRIPT_SANDBOXING` | `YES` for declared inputs/outputs |
| Parallel Script Execution | `FUSE_BUILD_SCRIPT_PHASES` | `YES` only if all scripts have I/O declared |

#### Xcode 26+

| Setting | Key | Notes |
|---------|-----|-------|
| Compilation Caching | `COMPILATION_CACHE_ENABLE_CACHING` | `YES` to cache compilation results across clean builds |
| Explicitly Built Modules | `SWIFT_ENABLE_EXPLICIT_MODULES` | Default `YES` for Swift in Xcode 26 |

### xcconfig Syntax

xcconfig files set build settings without modifying the Xcode project file. Useful for CI, team-shared configs, and keeping project files clean.

```xcconfig
// Base.xcconfig
PRODUCT_BUNDLE_IDENTIFIER = com.company.app
SWIFT_VERSION = 5.0
IPHONEOS_DEPLOYMENT_TARGET = 16.0

// Inherit from parent
OTHER_LDFLAGS = $(inherited) -framework UIKit

// Conditional on config
SWIFT_OPTIMIZATION_LEVEL[config=Debug] = -Onone
SWIFT_OPTIMIZATION_LEVEL[config=Release] = -O

// Conditional on SDK
EXCLUDED_ARCHS[sdk=iphonesimulator*] = arm64

// Include other xcconfig
#include "Shared.xcconfig"
#include? "Local.xcconfig"   // Optional include (no error if missing)
```

**Using xcconfig files:**
1. Project -> Info -> Configurations
2. Set Base Configuration for each config (Debug, Release)
3. Per-target overrides: Target -> Info -> Configurations

**Precedence order** (highest to lowest):
1. Command-line overrides (`xcodebuild SETTING=value`)
2. Target build settings
3. Target xcconfig
4. Project build settings
5. Project xcconfig

### Swift Package Manager Configuration

#### Package.swift Structure

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MyPackage",
    platforms: [
        .iOS(.v16),
        .macOS(.v13)
    ],
    products: [
        .library(name: "MyLibrary", targets: ["MyLibrary"]),
        .executable(name: "MyCLI", targets: ["MyCLI"])
    ],
    dependencies: [
        .package(url: "https://github.com/owner/repo", from: "1.0.0"),
        .package(url: "https://github.com/owner/repo", exact: "1.2.3"),
        .package(url: "https://github.com/owner/repo", .upToNextMajor(from: "1.0.0")),
        .package(url: "https://github.com/owner/repo", branch: "main"),
        .package(url: "https://github.com/owner/repo", revision: "abc123"),
        .package(path: "../LocalPackage"),
    ],
    targets: [
        .target(
            name: "MyLibrary",
            dependencies: ["SomeDependency"],
            swiftSettings: [
                .define("DEBUG", .when(configuration: .debug)),
                .unsafeFlags(["-warn-long-function-bodies=100"],
                             .when(configuration: .debug))
            ]
        ),
        .testTarget(
            name: "MyLibraryTests",
            dependencies: ["MyLibrary"]
        )
    ]
)
```

#### SPM CLI Commands

```bash
swift package resolve             # Resolve dependencies
swift package update              # Update to latest allowed versions
swift package show-dependencies   # Show dependency tree
swift package reset               # Reset package cache
swift package clean               # Clean build artifacts
swift build                       # Build package
swift test                        # Run package tests
swift build -c release            # Build in release mode
```

#### SPM in Xcode

```bash
xcodebuild -resolvePackageDependencies    # Resolve packages in Xcode project
```

### CocoaPods Reference

#### Podfile Syntax

```ruby
platform :ios, '16.0'
use_frameworks!

target 'MyApp' do
  pod 'Alamofire', '~> 5.8.0'       # Compatible with 5.8.x
  pod 'SwiftyJSON', '5.0.1'          # Exact version
  pod 'Firebase/Core'                 # Specific subspec
  pod 'Firebase/Analytics'

  target 'MyAppTests' do
    inherit! :search_paths
    pod 'Quick', '~> 7.0'
    pod 'Nimble', '~> 13.0'
  end
end

post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
    end
  end
end
```

#### CocoaPods CLI Commands

```bash
pod install                      # Install dependencies from Podfile
pod update                       # Update all pods to latest
pod update PodName               # Update specific pod
pod outdated                     # Check for available updates
pod deintegrate                  # Remove CocoaPods from project
pod cache clean --all            # Clear pod cache
pod repo update                  # Update spec repos
```

### Carthage Reference

```bash
carthage update                  # Update all dependencies
carthage bootstrap               # Download pre-built frameworks
carthage build --platform iOS    # Build for specific platform
carthage update --use-xcframeworks  # Build XCFrameworks
```

### Simulator Commands

```bash
# List all devices
xcrun simctl list devices

# Boot a simulator
xcrun simctl boot "iPhone 16 Pro"

# Shutdown all
xcrun simctl shutdown all

# Erase specific simulator
xcrun simctl erase <device-uuid>

# Install app
xcrun simctl install booted path/to/App.app

# Launch app
xcrun simctl launch booted com.your.bundleid

# Open URL / deep link
xcrun simctl openurl booted "myapp://path"

# Screenshot
xcrun simctl io booted screenshot /tmp/screenshot.png

# Record video
xcrun simctl io booted recordVideo /tmp/recording.mov
# Press Ctrl+C to stop recording

# Set device location
xcrun simctl location booted set 37.7749,-122.4194

# Push notification
xcrun simctl push booted com.your.bundleid payload.json

# Get app container path
xcrun simctl get_app_container booted com.your.bundleid data
```

### Info.plist Build Keys

```xml
<!-- Encryption compliance (skip question on every upload) -->
<key>ITSAppUsesNonExemptEncryption</key>
<false/>

<!-- If custom encryption, provide compliance code -->
<key>ITSAppUsesNonExemptEncryption</key>
<true/>
<key>ITSEncryptionExportComplianceCode</key>
<string>YOUR_COMPLIANCE_CODE</string>
```

### Provisioning and Signing

```bash
# Verify provisioning profile
security cms -D -i embedded.mobileprovision 2>/dev/null | head -20

# List code signing identities
security find-identity -v -p codesigning

# Verify app signature
codesign -vvv --deep --strict path/to/App.app

# Check entitlements
codesign -d --entitlements - path/to/App.app
```

### Build Verification

```bash
# Verify bundle ID, version, build number
xcodebuild -showBuildSettings -scheme YourApp | \
  grep -E "PRODUCT_BUNDLE_IDENTIFIER|MARKETING_VERSION|CURRENT_PROJECT_VERSION"

# Verify signing identity
xcodebuild -scheme YourApp -showBuildSettings | grep "CODE_SIGN"

# Verify dSYM after archive
ls ~/Library/Developer/Xcode/Archives/YYYY-MM-DD/MyApp*.xcarchive/dSYMs/

# Verify dSYM UUID matches binary
dwarfdump --uuid MyApp.app.dSYM
```

---

## Diagnostics

### Inspecting Build Settings

```bash
# Search for a specific setting
xcodebuild -showBuildSettings -scheme YourScheme | grep "SETTING_NAME"

# Compare Debug vs Release
xcodebuild -showBuildSettings -configuration Debug -scheme YourScheme > debug.txt
xcodebuild -showBuildSettings -configuration Release -scheme YourScheme > release.txt
diff debug.txt release.txt

# Check what's in project.pbxproj
grep "SWIFT_COMPILATION_MODE" project.pbxproj
grep "ONLY_ACTIVE_ARCH" project.pbxproj
grep "DEBUG_INFORMATION_FORMAT" project.pbxproj
grep "GCC_PREPROCESSOR_DEFINITIONS" project.pbxproj
```

### Build Log Analysis

```bash
# Build with timing summary
xcodebuild build -scheme YourScheme -showBuildTimingSummary 2>&1 | tee build.log

# Find slowest files
xcodebuild clean build -scheme YourScheme \
  OTHER_SWIFT_FLAGS="-Xfrontend -debug-time-function-bodies" 2>&1 | \
  grep ".[0-9]ms" | sort -nr | head -20

# Analyze Build Timeline
# Xcode: Cmd+B -> Cmd+9 (Report Navigator) -> Select build -> Assistant Editor
```

### SDK Version Check

```bash
# Current Xcode version
xcodebuild -version

# Available SDKs
xcodebuild -showsdks

# Xcode path
xcode-select -p

# Switch Xcode version
sudo xcode-select -s /Applications/Xcode-16.app
```

---

## Related

For build debugging workflows, dependency conflict resolution, and TestFlight crash triage, load `ax-build`.
