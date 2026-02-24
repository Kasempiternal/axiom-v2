---
name: test-simulator
description: Launch simulator testing agent for test scenarios and visual verification
disable-model-invocation: true
---

# Simulator Testing

Launches the **simulator-tester** agent for automated simulator testing with visual verification.

## What It Does

The agent will:
1. Check simulator state and boot if needed
2. Set up test scenarios (location, permissions, push notifications)
3. Capture screenshots and video
4. Monitor logs for crashes/errors
5. Analyze results and provide clear reports

## Capabilities

- **Screenshot capture** for visual debugging
- **Video recording** for complex workflows
- **Location simulation** for GPS-based features
- **Push notification testing** without a server
- **Permission management** without manual tapping
- **Deep link navigation** to specific screens
- **Status bar override** for clean screenshots
- **Log analysis** for crash detection
- **UI automation** with AXe (if installed)

## Prefer Natural Language?

- "Take a screenshot of the app"
- "Test my app with location simulation"
- "Send a test push notification"
- "Navigate to Settings and screenshot"
- "Record a video of the app running"
