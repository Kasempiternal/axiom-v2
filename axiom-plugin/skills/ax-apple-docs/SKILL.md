---
name: ax-apple-docs
description: Apple documentation research, Xcode MCP (mcpbridge) setup/tools/reference, App Store Connect MCP, WWDC transcript extraction, sosumi.ai docs, bundled compiler diagnostics
license: MIT
---

# Apple Docs & Xcode MCP

## Quick Patterns

### Xcode MCP Setup (Xcode 26.3+)
1. Xcode Settings > Intelligence > Enable Model Context Protocol + Xcode Tools ON
2. Add to your MCP client:

```bash
# Claude Code
claude mcp add --transport stdio xcode -- xcrun mcpbridge

# Codex
codex mcp add xcode -- xcrun mcpbridge
```

```json
// Cursor (.cursor/mcp.json)
{ "mcpServers": { "xcode": { "command": "xcrun", "args": ["mcpbridge"] } } }

// VS Code (.vscode/mcp.json)
{ "servers": { "xcode": { "type": "stdio", "command": "xcrun", "args": ["mcpbridge"] } } }
```

3. Verify: call `XcodeListWindows` -- should return tabIdentifier + workspacePath

### Xcode MCP Tools (20 tools)

**Discovery**: `XcodeListWindows` -- call first, get tabIdentifier for all other tools

**File Ops**: `XcodeRead`, `XcodeWrite`, `XcodeUpdate` (str_replace patches), `XcodeGlob`, `XcodeGrep`, `XcodeLS`, `XcodeMakeDir`, `XcodeRM` (destructive), `XcodeMV` (destructive)

**Build/Test**: `BuildProject(tabIdentifier)`, `GetBuildLog(tabIdentifier)`, `RunAllTests(tabIdentifier)`, `RunSomeTests(tabIdentifier, tests)`, `GetTestList(tabIdentifier)`

**Diagnostics**: `XcodeListNavigatorIssues(tabIdentifier)` -- structured diagnostics, `XcodeRefreshCodeIssuesInFile(tabIdentifier, path)`

**Other**: `ExecuteSnippet(code, language)`, `RenderPreview(tabIdentifier, path, previewIdentifier)`, `DocumentationSearch(query)`

### Xcode MCP Workflows

**BuildFix Loop**:
```
1. BuildProject(tab) -> check result
2. XcodeListNavigatorIssues(tab) -> structured diagnostics
3. XcodeUpdate(file, patches) -> fix errors
4. Repeat (max 5 iterations)
```

**TestFix Loop**:
```
1. GetTestList(tab) -> discover tests
2. RunSomeTests(tab, [failing]) -> fast iteration
3. XcodeUpdate -> fix
4. Repeat, then RunAllTests for verification
```

**PreviewVerify**: `RenderPreview(tab, file, viewName)` -> review image -> edit -> re-render

### App Store Connect MCP (asc-mcp)
```bash
brew install mint && mint install zelentsov-dev/asc-mcp@1.4.0

claude mcp add asc-mcp \
  -e ASC_KEY_ID=YOUR_KEY_ID \
  -e ASC_ISSUER_ID=YOUR_ISSUER_ID \
  -e ASC_PRIVATE_KEY_PATH=/path/to/AuthKey.p8 \
  -- ~/.mint/bin/asc-mcp --workers apps,builds,versions,reviews
```

Worker presets: TestFlight (`apps,builds,beta_groups,beta_testers`), Release (`apps,builds,versions,reviews`), Monetization (`apps,iap,subscriptions,offer_codes,pricing`)

### WWDC Transcript Research
Navigate to `developer.apple.com/videos/play/wwdcYYYY/NNN/` with browser. Page contains full verbatim transcript with timestamps. Extract API names, code descriptions, chapter markers.

### sosumi.ai for API Docs
Clean markdown version of Apple docs. URL: `sosumi.ai/documentation/[framework]` (lowercase, no spaces/hyphens).
```
sosumi.ai/documentation/swiftui
sosumi.ai/documentation/widgetkit
sosumi.ai/documentation/appintents
sosumi.ai/documentation/avfoundation
```

## Decision Tree

```
Need Apple documentation?
+-- Compiler error/warning? --> Read matching apple-diag-* bundled doc
+-- Framework API details? --> sosumi.ai/documentation/[framework]
+-- WWDC session content? --> Navigate to developer.apple.com/videos transcript
+-- Xcode MCP setup? --> See setup section above
+-- Build/test via MCP? --> BuildFix/TestFix workflow loops
+-- App Store Connect automation? --> asc-mcp workflows
+-- Bundled guide (Liquid Glass, concurrency, etc.)? --> Read apple-guide-* doc
```

## Anti-Patterns

### Using xcodebuild when MCP available
MCP gives IDE state, navigator diagnostics, previews, and resolved packages that CLI does not expose. Use MCP for iterative workflows, CLI for CI/scripted builds.

### Parsing build logs instead of navigator issues
`XcodeListNavigatorIssues` provides structured, deduplicated diagnostics. Build logs contain raw noise.

### Skipping tabIdentifier
Most tools fail silently without correct tabIdentifier. Always call `XcodeListWindows` first.

### XcodeWrite for existing files
Use `XcodeUpdate` (str_replace patches) for editing. `XcodeWrite` overwrites the entire file.

### Loading all 208 asc-mcp tools
Use `--workers` flag to load only needed workers. Full set wastes context tokens.

### Scraping developer.apple.com HTML
Use sosumi.ai for clean markdown. Transcripts are already on WWDC video pages.

## Deep Patterns

### Xcode MCP Multi-Instance Targeting
```bash
pgrep -x Xcode  # Find PIDs
claude mcp add --transport stdio xcode -- env MCP_XCODE_PID=12345 xcrun mcpbridge
```

### Xcode MCP Troubleshooting

| Symptom | Fix |
|---|---|
| "Connection refused" | Launch Xcode, enable MCP in Settings > Intelligence |
| tools/list empty | Open a project, approve permission dialog in Xcode |
| Wrong project targeted | Use correct tabIdentifier from XcodeListWindows |
| Cursor rejects responses | Use XcodeMCPWrapper proxy (schema compliance) |
| "No such command: mcpbridge" | Update to Xcode 26.3+ |

### ASC Release Pipeline
```
apps_search(query) -> builds_list(appId) -> app_versions_create(appId, versionString)
-> app_versions_attach_build(versionId, buildId) -> app_versions_set_review_details(...)
-> app_versions_submit_for_review(versionId) -> app_versions_create_phased_release(...)
```

### ASC TestFlight Distribution
```
builds_list(appId) -> builds_set_beta_localization(buildId, whatsNew)
-> beta_groups_create/list -> beta_groups_add_builds(groupId, [buildId])
-> builds_send_beta_notification(buildId)
```

### Bundled Apple Guides (read via MCP axiom_read_skill)

**UI**: `apple-guide-swiftui-implementing-liquid-glass-design`, `apple-guide-swiftui-new-toolbar-features`, `apple-guide-swiftui-styled-text-editing`, `apple-guide-swiftui-webkit-integration`

**Concurrency**: `apple-guide-swift-concurrency-updates`, `apple-guide-swift-inlinearray-span`

**AI**: `apple-guide-foundationmodels-using-on-device-llm-in-your-app`

**Integration**: `apple-guide-appintents-updates`, `apple-guide-storekit-updates`

**Data**: `apple-guide-swiftdata-class-inheritance`

### Swift Compiler Diagnostics (bundled)

**Concurrency**: `apple-diag-actor-isolated-call`, `apple-diag-conformance-isolation`, `apple-diag-sendable-closure-captures`, `apple-diag-sending-risks-data-race`, `apple-diag-mutable-global-variable`, `apple-diag-nonisolated-nonsending-by-default`

**Type System**: `apple-diag-existential-any`, `apple-diag-protocol-type-non-conformance`, `apple-diag-opaque-type-inference`

**Build**: `apple-diag-deprecated-declaration`, `apple-diag-strict-language-features`, `apple-diag-member-import-visibility`

## Diagnostics

### Xcode MCP Not Responding
1. Check Xcode is running with project open
2. Verify MCP toggle: Settings > Intelligence > Enable MCP
3. Check permission dialog appeared and was approved
4. Re-run `XcodeListWindows` to verify connection
5. If Cursor/strict client: use XcodeMCPWrapper proxy

### ASC Build Not Found
- Build processing takes 15-30 minutes after upload
- Poll `builds_get_processing_state` -- must return `VALID`
- Verify correct app with `apps_search` bundleId check

## Related

- `ax-build` -- xcodebuild CLI, build errors, code signing
- `ax-shipping` -- App Store submission workflow, review guidelines
- `ax-testing` -- Test plans, XCUITest, Swift Testing
- WWDC transcripts at developer.apple.com/videos
- sosumi.ai for clean API documentation
