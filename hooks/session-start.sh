#!/usr/bin/env bash
# Axiom v2 SessionStart — conditional, minimal bootstrap

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
PLUGIN_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Only inject context if this looks like an iOS project
IS_IOS=false
if ls *.xcodeproj >/dev/null 2>&1 || ls *.xcworkspace >/dev/null 2>&1; then
  IS_IOS=true
elif [ -f "Package.swift" ] && grep -q "iOS\|apple" Package.swift 2>/dev/null; then
  IS_IOS=true
fi

if [ "$IS_IOS" = false ]; then
  # Not an iOS project — emit empty JSON (no context injected)
  echo '{}'
  exit 0
fi

python3 - "$PLUGIN_ROOT" <<'PYTHON_SCRIPT'
import json, sys, os
from datetime import datetime

plugin_root = sys.argv[1]
current_date = datetime.now().strftime("%A, %Y-%m-%d")

# Detect Apple for-LLM documentation in Xcode
xcode_path = "/Applications/Xcode.app"
apple_docs_path = f"{xcode_path}/Contents/PlugIns/IDEIntelligenceChat.framework/Versions/A/Resources/AdditionalDocumentation"
diagnostics_path = f"{xcode_path}/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/share/doc/swift/diagnostics"

guide_count = 0
diag_count = 0
if os.path.isdir(apple_docs_path):
    guide_count = len([f for f in os.listdir(apple_docs_path) if f.endswith('.md')])
if os.path.isdir(diagnostics_path):
    diag_count = len([f for f in os.listdir(diagnostics_path) if f.endswith('.md')])

apple_docs_note = ""
if guide_count > 0 or diag_count > 0:
    apple_docs_note = f" Xcode detected with {guide_count} guides + {diag_count} Swift diagnostics — use ax-apple-docs for lookups."

context = f"""Axiom iOS skills available (current date: {current_date}).

Quick reference — load the skill matching your task:
- Build issues: ax-build, ax-build-ref | Shipping: ax-shipping | Debugging: ax-lldb
- SwiftUI: ax-swiftui, ax-swiftui-ref | UIKit: ax-uikit | Design: ax-design, ax-design-ref
- SwiftData: ax-swiftdata | Core Data: ax-core-data | GRDB/SQLite: ax-grdb
- Cloud sync: ax-cloud-storage | File storage: ax-file-storage
- Concurrency: ax-concurrency, ax-concurrency-ref
- Performance: ax-performance | Energy: ax-energy | Swift perf: ax-swift-perf
- Networking: ax-networking, ax-networking-ref
- StoreKit: ax-storekit | Intents: ax-app-intents | Widgets: ax-widgets
- Media/Audio: ax-media | Background: ax-background-tasks | Location: ax-core-location
- Privacy: ax-privacy | Foundation Models: ax-foundation-models | CoreML: ax-coreml
- Vision: ax-vision | Camera: ax-camera | Metal: ax-metal | Games: ax-3d-games
- Testing: ax-testing | Simulator: ax-simulator
- Apple docs: ax-apple-docs{apple_docs_note}

iOS version note: Your training may predate the current iOS version. Defer to Axiom skills for post-cutoff facts."""

output = {
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": context
    }
}
print(json.dumps(output, indent=2))
PYTHON_SCRIPT

exit 0
