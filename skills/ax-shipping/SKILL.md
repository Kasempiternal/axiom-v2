---
name: ax-shipping
description: App Store submission, rejection troubleshooting, metadata requirements, privacy manifests, age ratings, export compliance, ASC navigation, MCP automation
license: MIT
---
# Shipping

## Quick Patterns

### Pre-Flight Checklist (Run Before Every Submission)

```
Build:
[ ] Built with current required SDK (Xcode 16/iOS 18 SDK; Xcode 26/iOS 26 from April 28, 2026)
[ ] ITSAppUsesNonExemptEncryption set in Info.plist
[ ] Tested on physical device with latest shipping iOS
[ ] Tested Release configuration (not just Debug)
[ ] Works over IPv6-only network

Privacy:
[ ] PrivacyInfo.xcprivacy present with all Required Reason APIs
[ ] Privacy policy URL in ASC AND accessible in-app
[ ] Privacy policy matches actual data collection
[ ] All NS*UsageDescription purpose strings present
[ ] ATT implemented if tracking users
[ ] Privacy Nutrition Labels match manifest

Metadata:
[ ] App name (30 char limit), description (4000 char), keywords (100 bytes)
[ ] Screenshots for all required device sizes
[ ] "What's New" text written (for updates)
[ ] Copyright current year, Support URL valid

Account:
[ ] Account deletion implemented (if account creation exists)
[ ] Sign in with Apple offered (if any third-party login exists)
[ ] Demo credentials in App Review notes (if login required)
[ ] Demo credentials won't expire during review (1-2 weeks)

Content:
[ ] No placeholder text (Lorem ipsum, TODO, Coming Soon)
[ ] All links functional, all images production assets
[ ] App icon 1024x1024, no alpha, no rounded corners

Compliance:
[ ] Age rating questionnaire completed (new 5-tier system)
[ ] EU DSA trader status verified (if distributing in EU)
[ ] IAP products in "Ready to Submit" status
[ ] Restore Purchases button works
```

### Submission Workflow

```
1. Create new version in ASC
2. Set version number and "What's New" text
3. Upload screenshots (all required sizes)
4. Complete App Review Information (contact, demo creds, notes)
5. Verify Privacy Nutrition Labels
6. Verify age rating questionnaire
7. Upload build (Product -> Archive -> Distribute)
8. Wait for processing (5-30 min)
9. Select processed build in ASC
10. Submit for Review
```

### Archive and Upload

```bash
# Verify before archiving
xcodebuild -showBuildSettings -scheme YourApp | \
  grep -E "PRODUCT_BUNDLE_IDENTIFIER|MARKETING_VERSION|CURRENT_PROJECT_VERSION"

# Verify signing
xcodebuild -scheme YourApp -showBuildSettings | grep "CODE_SIGN"

# Archive
xcodebuild archive -scheme YourApp \
  -archivePath ./build/YourApp.xcarchive

# Or Xcode: Product -> Archive -> Distribute -> App Store Connect
```

### Encryption Compliance

```xml
<!-- Most apps: HTTPS only -->
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

Set to `true` only for custom encryption, OpenSSL, proprietary protocols, or end-to-end encryption. Then upload export compliance documentation in ASC.

---

## Decision Tree

### Preparing to Submit?

```
Is my app ready?
├─ Crashes on real device?
│  └─ STOP. Fix crashes first (Guideline 2.1)
├─ Privacy manifest present?
│  ├─ NO -> Add PrivacyInfo.xcprivacy with Required Reason APIs
│  └─ YES -> Continue
├─ Privacy policy URL set AND accessible in-app?
│  ├─ NO -> Add both
│  └─ YES -> Continue
├─ Creates user accounts?
│  └─ YES -> Account deletion implemented? (Must be actual deletion, not deactivation)
├─ Offers third-party login?
│  └─ YES -> Sign in with Apple offered at equal prominence?
├─ Has IAP/subscriptions?
│  └─ YES -> IAP items submitted in ASC? Restore Purchases works?
├─ Uses encryption beyond HTTPS?
│  └─ Set ITSAppUsesNonExemptEncryption appropriately
├─ Distributing in EU?
│  └─ DSA trader status verified?
├─ Login required?
│  └─ Demo credentials in review notes?
├─ Age rating questionnaire completed?
├─ Any placeholder content remaining?
└─ All checks passed -> READY TO SUBMIT
```

### App Was Rejected?

```
What does the rejection say?
├─ Guideline 2.1 (App Completeness)?
│  ├─ Crash during review -> Check crash logs, test on reviewer's device/OS
│  ├─ Placeholder content -> Search: Lorem, TODO, FIXME, placeholder
│  ├─ Broken links -> Verify all URLs resolve
│  └─ Missing demo credentials -> Provide non-expiring credentials
├─ Guideline 2.3 (Metadata)?
│  ├─ Screenshots don't match -> Retake from submitted build
│  ├─ Description promises missing features -> Update text
│  └─ Keywords contain trademarks -> Remove
├─ Guideline 5.1 (Privacy)?
│  ├─ Privacy policy missing/inaccessible -> Add to ASC AND in-app
│  ├─ Purpose strings missing -> Add specific NS*UsageDescription
│  ├─ Privacy manifest incomplete -> Update PrivacyInfo.xcprivacy
│  └─ Tracking without ATT -> Implement ATTrackingManager
├─ Guideline 4.8 (Sign in with Apple)?
│  └─ Add SIWA at same prominence as other login options
├─ Guideline 3.x (Business)?
│  ├─ Digital content without IAP -> Implement StoreKit
│  ├─ Subscription issues -> Fix terms/value disclosure
│  └─ Loot box odds not disclosed -> Add odds before purchase
├─ Binary Rejected (no guideline)?
│  ├─ Wrong SDK version -> Update Xcode
│  ├─ Privacy manifest missing -> Add PrivacyInfo.xcprivacy
│  ├─ Encryption not declared -> Add ITSAppUsesNonExemptEncryption
│  └─ Invalid signing -> Regenerate provisioning
└─ Reviewer seems incorrect?
   └─ Reply in ASC with specific evidence, or appeal
```

### Automate with asc-mcp?

```
What are you automating?
├─ TestFlight distribution -> --workers apps,builds,beta_groups,beta_testers
├─ App Store submission   -> --workers apps,builds,versions,reviews
├─ IAP/subscriptions      -> --workers apps,iap,subscriptions,offer_codes,pricing
└─ Multiple tasks         -> No --workers flag (all tools)
```

---

## Anti-Patterns

**"I'll just submit and see what happens"** -- 40% of rejections are Guideline 2.1 (completeness). The pre-flight checklist catches them in 30 minutes and prevents 3-7 day rejection cycles.

**"I've submitted apps before"** -- Requirements change yearly. Privacy manifests (May 2024), new age ratings (Jan 2026), Accessibility Nutrition Labels, EU DSA are all new since 2024.

**"The rejection is wrong, I'll just resubmit"** -- Resubmitting without changes wastes 24-48 hours per cycle. Read the full rejection message and fix the cited issues.

**"It's just a bug fix, I don't need a full checklist"** -- Updates are reviewed against CURRENT guidelines. Requirements that didn't exist when your app was last reviewed may now be enforced.

**Fixing only the first cited guideline** -- If multiple guidelines are cited, fix ALL before resubmitting. Reviewers find new issues on each pass.

**Deploying backend during review** -- A backend change that breaks the reviewed build = crash during review = Guideline 2.1 rejection. Freeze backend during review period.

**"Different reviewer next time might not notice"** -- Reviewers see rejection history. Unchanged resubmissions get the same result or escalated to senior reviewers.

**Arguing emotionally in Resolution Center** -- App Review is a technical compliance review. Specific evidence works; emotional arguments are ignored.

**Ignoring third-party SDK data collection** -- Your app is responsible for ALL SDK behavior. If Facebook SDK collects device identifiers, YOUR privacy policy must disclose it.

---

## Deep Patterns

### Privacy Manifest (PrivacyInfo.xcprivacy)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyTrackingDomains</key>
    <array/>
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

**Required Reason API categories:**

| Category | APIs Covered | Common Reasons |
|----------|-------------|----------------|
| File timestamp | `NSFileCreationDate`, `NSFileModificationDate` | DDA9.1, C617.1 |
| System boot time | `systemUptime`, `mach_absolute_time` | 35F9.1 |
| Disk space | `NSFileSystemFreeSize`, `volumeAvailableCapacityKey` | E174.1, 85F4.1 |
| Active keyboard | `activeInputModes` | 54BD.1 |
| User defaults | `UserDefaults` | CA92.1, 1C8F.1 |

**Generate aggregate report:** Xcode -> Product -> Archive -> Generate Privacy Report

### Purpose Strings

```xml
<key>NSCameraUsageDescription</key>
<string>Take photos for your profile picture and upload to your account</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>Show nearby restaurants on the map and calculate delivery distance</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>Select photos from your library to attach to messages</string>
```

Purpose strings must explain user benefit, not just "we need access." Missing strings cause immediate rejection.

### App Tracking Transparency

```swift
import AppTrackingTransparency

func requestTrackingPermission() {
    ATTrackingManager.requestTrackingAuthorization { status in
        switch status {
        case .authorized:
            // Enable tracking
            break
        case .denied, .restricted, .notDetermined:
            // Disable ALL tracking, remove IDFA access
            break
        @unknown default:
            break
        }
    }
}
```

Request at a contextually appropriate moment, not at first launch.

### Sign in with Apple Implementation

```swift
import AuthenticationServices

struct LoginView: View {
    var body: some View {
        VStack(spacing: 16) {
            SignInWithAppleButton(.signIn) { request in
                request.requestedScopes = [.fullName, .email]
            } onCompletion: { result in
                switch result {
                case .success(let authorization):
                    handleAuthorization(authorization)
                case .failure(let error):
                    handleError(error)
                }
            }
            .signInWithAppleButtonStyle(.black)
            .frame(height: 50)

            GoogleSignInButton()
                .frame(height: 50)
        }
    }

    func handleAuthorization(_ authorization: ASAuthorization) {
        guard let credential = authorization.credential
            as? ASAuthorizationAppleIDCredential else { return }

        let userIdentifier = credential.user
        let fullName = credential.fullName   // Only on FIRST sign-in
        let email = credential.email          // Only on FIRST sign-in
        // Store immediately -- won't be provided again
    }
}
```

**Exceptions (SIWA not required):** Company-internal apps, education with school accounts, government/banking apps, clients for specific third-party services, apps using only own auth system.

### Account Deletion Requirements

- Discoverable in Settings/Profile (not hidden)
- Clearly labeled "Delete Account" (not "Deactivate")
- Explains what deletion means
- Confirms completion to user
- If SIWA used: revoke token via `POST https://appleid.apple.com/auth/revoke`
- If active subscriptions: inform user to cancel first
- Completes within reasonable timeframe

### Age Rating System (5-Tier, Updated January 31, 2026)

| Rating | Triggers |
|--------|----------|
| 4+ | No objectionable material |
| 9+ | Mild: profanity, cartoon violence, horror. Loot boxes |
| 13+ | Intense profanity/crude humor. Mild: alcohol/drugs, sexual content, realistic violence |
| 16+ | Unrestricted web access, frequent medical info, mature themes |
| 18+ | Intense: alcohol/drugs, sexual content, realistic violence. Simulated gambling with real money |

**New capability declarations:** Messaging/chat, UGC, advertising, parental controls, age assurance.

### Screenshot Requirements

| Device | Size (portrait) | Required? |
|--------|----------------|-----------|
| iPhone 6.9" | 1320 x 2868 | Required for new apps |
| iPhone 6.7" | 1290 x 2796 | Required |
| iPhone 6.5" | 1284 x 2778 | Optional (falls back to 6.7") |
| iPhone 5.5" | 1242 x 2208 | Required for older device support |
| iPad Pro 13" | 2048 x 2732 | Required if universal |

Screenshots must show actual app UI (not mockups), match current build, 2-10 per locale per device.

### Metadata Field Specs

| Field | Max Length | Localizable | Notes |
|-------|-----------|-------------|-------|
| App Name | 30 chars | Yes | Must be unique |
| Subtitle | 30 chars | Yes | Below name in search |
| Description | 4000 chars | Yes | Plain text only |
| Promotional Text | 170 chars | Yes | Editable without submission |
| Keywords | 100 bytes | Yes | Comma-separated |
| What's New | 4000 chars | Yes | Required for updates |
| Copyright | -- | No | "YYYY Company Name" |

### EU DSA Trader Status

Applies to ALL apps distributed in EU (27 member states). Since February 17, 2025, apps without declared trader status are subject to removal.

If declaring as trader, provide: legal name, address, verified phone, verified email, company registration, VAT ID (where applicable). Contact info displayed on EU product page.

**Declare in:** ASC -> Users and Access -> Developer Profile -> Trader Status

### IAP Submission Pipeline

| Scenario | Behavior |
|----------|----------|
| First IAP ever | Must be bundled with new app version |
| Subsequent IAPs | Can be submitted independently |
| IAP metadata change | Submitted for review independently |
| IAP price change | Takes effect without review |

IAP must be in "Ready to Submit" status before app submission. Required metadata: reference name, product ID, type, price, display name, description, screenshot, review notes.

### Appeal Process

**When appropriate:** Reviewer misunderstood your app, wrong guideline applied, you have evidence of compliance.

**When NOT appropriate:** You disagree with the guideline itself, hoping different reviewer approves, want to skip required features.

**Good appeal structure:**
```
"Our app complies with Guideline [X.Y] because [specific evidence].

The reviewer noted: '[exact rejection text]'

However, our app [counter-evidence]:
1. [Feature X] works as shown in [attached screenshot/video]
2. [Policy Y] is accessible at [URL] and within the app at [screen]

Attached: [screenshots, screen recording, documentation]

We respectfully request re-review of this decision."
```

**Escalation path:** Reply in ASC -> Formal appeal -> Request phone call -> Contact Developer Relations

### Expedited Review

Request at developer.apple.com/contact/app-store/?topic=expedite for: critical bug fixes, security patches, time-sensitive events. Not guaranteed; Apple tracks usage.

### asc-mcp Setup

```bash
brew install mint
mint install zelentsov-dev/asc-mcp@1.4.0

# Create API key: ASC -> Users and Access -> Integrations -> API
# Download .p8 file, note Key ID and Issuer ID

claude mcp add asc-mcp \
  -e ASC_KEY_ID=YOUR_KEY_ID \
  -e ASC_ISSUER_ID=YOUR_ISSUER_ID \
  -e ASC_PRIVATE_KEY_PATH=/path/to/AuthKey.p8 \
  -- ~/.mint/bin/asc-mcp
```

### asc-mcp Release Pipeline

```
1. apps_search(query: "MyApp")                      -> get app ID
2. builds_list(appId, limit: 5)                     -> find latest build
3. app_versions_create(appId, platform: "IOS", versionString: "2.1.0")
4. app_versions_attach_build(versionId, buildId)
5. app_versions_set_review_details(versionId, { contactEmail, notes })
6. app_versions_submit_for_review(versionId)
7. app_versions_create_phased_release(versionId)    -> after approval
```

### asc-mcp TestFlight Distribution

```
1. apps_search(query: "MyApp")                      -> get app ID
2. builds_list(appId, limit: 5)                     -> find latest build
3. builds_set_beta_localization(buildId, locale: "en-US", whatsNew: "Bug fixes")
4. beta_groups_list(appId)                           -> find or create group
5. beta_groups_add_builds(groupId, [buildId])
6. builds_send_beta_notification(buildId)            -> notify testers
```

### asc-mcp Review Management

```
1. reviews_list(appId, filterRating: "1,2")          -> negative reviews
2. reviews_stats(appId)                              -> rating distribution
3. reviews_create_response(reviewId, responseBody: "Thank you...")
```

### asc-mcp Gotchas

- Build must be in `VALID` processing state before attaching (check `builds_get_processing_state`)
- Version string must not already exist (check `app_versions_list`)
- 208 tools consume ~30K tokens; use `--workers` to filter
- TestFlight text feedback and screenshots NOT available via API (use Organizer)
- Always call `company_current` to verify active account before changes

---

## Diagnostics

### Rejection Quick Reference

| Guideline | Issue | Prevention | Fix Time |
|-----------|-------|------------|----------|
| 2.1 | Crashes/placeholders/broken links | Device testing, content audit | 1-3 days |
| 2.3 | Metadata mismatch | Compare screenshots to app | 1 day (no build) |
| 5.1 | Privacy gaps | Policy + manifest + purpose strings | 2-5 days |
| 4.8 | Missing Sign in with Apple | Add SIWA with third-party login | 3-5 days |
| 3.x | IAP/payment issues | Review IAP flows | 3-14 days |
| Binary | SDK, manifest, encryption | Check SDK, validate in Xcode | 1-2 days |

### Metadata vs Binary Rejection

| Type | Meaning | Action |
|------|---------|--------|
| Metadata Rejected | Screenshots, description, ASC fields | Fix in ASC, no new build needed |
| Binary Rejected | Code/app issue | Fix code, new archive, upload new build |

### Common Submission Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "Missing Compliance" on build | Encryption questions not answered | ASC -> build -> answer questions |
| Build not appearing in ASC | Processing delay | Wait 15-60 min; check email |
| "Add for Review" grayed | Missing required metadata | Check all required fields |
| Screenshots wrong size | Device spec mismatch | Use exact pixel dimensions |
| Privacy policy URL invalid | Not HTTPS or not public | Must be https:// accessible without login |
| IAP not available for review | Not in "Ready to Submit" | Complete all IAP metadata |
| Build string conflict | Duplicate build string | Each upload needs unique string |

### Privacy Three-Way Consistency

Apple compares: (a) your app's actual behavior, (b) your privacy policy content, (c) your Privacy Nutrition Labels in ASC. All three must agree. If any disagree, you get a 5.1.1 rejection.

### Accessibility Nutrition Labels (New 2025)

Declared per-device in ASC. Initially optional, becoming required.

| Label | What to Verify |
|-------|---------------|
| VoiceOver | All common tasks completable with VoiceOver |
| Voice Control | All tasks completable with voice commands |
| Larger Text | UI adapts to Dynamic Type up to AX5 |
| Dark Interface | Full dark mode support |
| Sufficient Contrast | WCAG AA contrast ratios |
| Differentiation Without Color | Info not conveyed by color alone |
| Reduced Motion | Animations respect Reduce Motion |

Each declaration means all-or-nothing per feature. Do not declare partial support.

### WWDC25 Changes

- **Draft Submissions**: Group app version + IAPs + product page changes into single review
- **Reusable Build Numbers**: Metadata-rejected builds can be reused without re-uploading
- **App Store Tags**: LLM-generated, editable tags for discoverability
- **Custom Product Page Keywords**: Different keywords per custom product page
- **Offer Codes**: Now support all IAP types (consumables, non-consumables, etc.)
- **Review Summaries**: AI-generated summaries of user reviews on product page
- **100+ new analytics metrics**: Pre-order funnels, subscription lifecycle, peer benchmarks

### ASC Navigation Reference

| Task | Path |
|------|------|
| Crashes | ASC -> My Apps -> [App] -> Analytics -> Crashes |
| TestFlight Feedback | ASC -> My Apps -> [App] -> TestFlight -> Feedback |
| Metrics | ASC -> My Apps -> [App] -> Analytics -> Metrics |
| Terminations | Xcode Organizer -> Terminations sidebar |

| Metric | Meaning |
|--------|---------|
| Crash-Free Users | % of daily active users without crashes |
| Crash Rate | Crashes per 1,000 sessions |
| Hang Rate | Main thread hangs > 250ms |

---

## Related

For build failures and environment diagnostics, load `ax-build`. For build settings reference, load `ax-build-ref`.
