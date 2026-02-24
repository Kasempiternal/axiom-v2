---
name: ax-simulator
description: iOS Simulator management with simctl and AXe CLI -- device lifecycle, UI automation, accessibility-based tapping, screenshots, video recording, text input, push notifications
license: MIT
---

# Simulator Management

## Quick Patterns

### simctl Device Lifecycle
```bash
# List available devices
xcrun simctl list devices

# Boot a simulator
xcrun simctl boot "iPhone 16"

# Get booted simulator UDID
UDID=$(xcrun simctl list devices -j | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' | head -1)

# Open Simulator app
open -a Simulator

# Shutdown
xcrun simctl shutdown $UDID

# Erase (reset to factory)
xcrun simctl erase $UDID

# Delete
xcrun simctl delete $UDID
```

### simctl App Management
```bash
# Install app
xcrun simctl install $UDID /path/to/MyApp.app

# Launch app
xcrun simctl launch $UDID com.example.myapp

# Launch with arguments
xcrun simctl launch $UDID com.example.myapp --uitesting --mock-data

# Terminate app
xcrun simctl terminate $UDID com.example.myapp

# Uninstall app
xcrun simctl uninstall $UDID com.example.myapp
```

### simctl Utilities
```bash
# Screenshot
xcrun simctl io $UDID screenshot /tmp/screenshot.png

# Video recording (Ctrl+C to stop)
xcrun simctl io $UDID recordVideo /tmp/recording.mp4

# Open URL / deep link
xcrun simctl openurl $UDID "myapp://path/to/screen"

# Send push notification
xcrun simctl push $UDID com.example.myapp /tmp/push.json

# Set status bar (clean screenshots)
xcrun simctl status_bar $UDID override --time "9:41" --batteryState charged --batteryLevel 100

# Grant permissions
xcrun simctl privacy $UDID grant photos com.example.myapp
xcrun simctl privacy $UDID grant camera com.example.myapp
xcrun simctl privacy $UDID grant location-always com.example.myapp

# Add photos/videos to library
xcrun simctl addmedia $UDID /path/to/photo.jpg

# Set location
xcrun simctl location $UDID set 37.7749,-122.4194

# Get app container path
xcrun simctl get_app_container $UDID com.example.myapp data
```

### Push Notification Payload
```json
{
  "aps": {
    "alert": {
      "title": "Test Notification",
      "body": "This is a test push notification"
    },
    "badge": 1,
    "sound": "default"
  }
}
```
```bash
xcrun simctl push $UDID com.example.myapp /tmp/push.json
```

### AXe UI Automation
```bash
# Install
brew install cameroncooke/axe/axe

# ALWAYS describe UI first (never guess coordinates)
axe describe-ui --udid $UDID

# Tap by accessibility identifier (preferred)
axe tap --id "loginButton" --udid $UDID

# Tap by label
axe tap --label "Login" --udid $UDID

# Tap by coordinates (last resort, from describe-ui output)
axe tap -x 200 -y 400 --udid $UDID

# Type text (element must be focused)
axe tap --id "emailTextField" --udid $UDID
axe type "user@example.com" --udid $UDID

# Hardware buttons
axe button home --udid $UDID
axe button lock --udid $UDID

# Gestures
axe gesture scroll-down --udid $UDID
axe gesture swipe-from-left-edge --udid $UDID  # Back navigation

# Screenshot
axe screenshot --output /tmp/screenshot.png --udid $UDID

# Video recording
axe record-video --output /tmp/recording.mp4 --udid $UDID

# Video streaming
axe stream-video --fps 30 --udid $UDID
```

## Decision Tree

```
What do you need?
+-- Create/boot/shutdown simulators --> simctl
+-- Install/launch/terminate apps --> simctl
+-- Permissions (camera, photos, location) --> simctl privacy
+-- Push notifications --> simctl push
+-- Deep links --> simctl openurl
+-- Clean status bar for screenshots --> simctl status_bar
+-- Set location --> simctl location
|
+-- Tap buttons/elements --> AXe tap --id/--label
+-- Type text into fields --> AXe tap + type
+-- Swipe/scroll --> AXe gesture/swipe
+-- Hardware buttons (home, lock) --> AXe button
+-- Inspect UI element tree --> AXe describe-ui
+-- Stream simulator video --> AXe stream-video
```

## Anti-Patterns

### Guessing coordinates from screenshots
```bash
# WRONG: Fragile, breaks with layout changes
axe tap -x 200 -y 400 --udid $UDID
# FIX: Use describe-ui first, then tap by identifier
axe describe-ui --udid $UDID
axe tap --id "loginButton" --udid $UDID
```

### Not setting up accessibility identifiers
```bash
# WRONG: Labels change with localization
axe tap --label "Login" --udid $UDID
# FIX: Use accessibilityIdentifier in app code, then --id
```

### Using sleep without condition check
```bash
# WRONG: Arbitrary wait
sleep 5 && axe tap --id "button" --udid $UDID
# FIX: Poll describe-ui for element existence
```

## Deep Patterns

### AXe Element Targeting Priority
1. `--id` (accessibilityIdentifier) -- most stable, survives localization
2. `--label` (accessibility label) -- stable but changes with language
3. `-x -y` coordinates from `describe-ui` -- fragile, last resort

### AXe Timing Controls
```bash
axe tap --id "button" --pre-delay 0.5 --post-delay 0.3 --udid $UDID
axe tap -x 200 -y 400 --duration 1.0 --udid $UDID  # Long press
axe type "text" --char-delay 0.1 --udid $UDID        # Slow typing
axe key-sequence 40 43 40 --delay 0.2 --udid $UDID   # Key sequence
```

### Common HID Keycodes
| Key | Code |
|---|---|
| Return/Enter | 40 |
| Escape | 41 |
| Backspace | 42 |
| Tab | 43 |
| Space | 44 |
| Right Arrow | 79 |
| Left Arrow | 80 |
| Down Arrow | 81 |
| Up Arrow | 82 |

### Automated Login Flow
```bash
UDID=$(xcrun simctl list devices -j | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' | head -1)

axe tap --id "emailTextField" --udid $UDID
axe type "user@example.com" --udid $UDID
axe tap --id "passwordTextField" --udid $UDID
axe type "password123" --udid $UDID
axe tap --id "loginButton" --udid $UDID
sleep 2
axe screenshot --output /tmp/login-result.png --udid $UDID
```

### Scroll to Find Element
```bash
for i in {1..5}; do
  if axe describe-ui --udid $UDID | grep -q "targetElement"; then
    axe tap --id "targetElement" --udid $UDID
    break
  fi
  axe gesture scroll-down --udid $UDID
  sleep 0.5
done
```

### Error Capture Pattern
```bash
if ! axe tap --id "submitButton" --udid $UDID; then
  axe screenshot --output /tmp/error-state.png --udid $UDID
  axe describe-ui --udid $UDID > /tmp/error-ui-tree.json
  echo "Failed to tap submitButton"
fi
```

### AXe vs simctl Capabilities
| Capability | simctl | AXe |
|---|---|---|
| Device lifecycle | Yes | No |
| Permissions | Yes | No |
| Push notifications | Yes | No |
| Status bar | Yes | No |
| Deep links | Yes | No |
| Screenshots | Yes | Yes |
| Video recording | Yes | Yes |
| Video streaming | No | Yes |
| UI tap/swipe | No | Yes |
| Type text | No | Yes |
| Hardware buttons | No | Yes |
| Accessibility tree | No | Yes |

Use both together: simctl for device/app control, AXe for UI interaction.

## Diagnostics

### Simulator Not Booting
```bash
# Check available runtimes
xcrun simctl list runtimes
# Create new device if needed
xcrun simctl create "Test iPhone" "iPhone 16" "com.apple.CoreSimulator.SimRuntime.iOS-18-0"
```

### AXe Element Not Found
1. Run `axe describe-ui --udid $UDID` to see all elements
2. Check accessibilityIdentifier is set in app code
3. Ensure element is on-screen (scroll if needed)
4. Add `--pre-delay 0.5` for slow-loading UI

### AXe Type Not Working
1. Tap the text field first: `axe tap --id "field" --udid $UDID`
2. Verify keyboard is visible in simulator
3. Try `--char-delay 0.05` for reliability

## Related

- `ax-testing` -- XCUITest automation, test plans, CI execution
- `ax-build` -- xcodebuild commands, build-for-testing
- AXe GitHub: cameroncooke/AXe
