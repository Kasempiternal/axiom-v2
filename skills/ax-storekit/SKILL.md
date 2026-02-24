---
name: ax-storekit
description: "StoreKit 2 in-app purchases, subscriptions, transactions."
license: MIT
---
# StoreKit 2 In-App Purchases

iOS 15+ (iOS 18.4+ for latest features) | WWDC 2025-241, 2025-249, 2023-10013, 2021-10114

## Quick Patterns

### Testing-First Workflow

```
StoreKit Config -> Local Testing -> Production Code -> Unit Tests -> Sandbox Testing
```

1. **Xcode -> File -> New -> StoreKit Configuration File** (save as `Products.storekit`)
2. Add products: consumable / non-consumable / auto-renewable subscription
3. **Scheme -> Edit Scheme -> Run -> Options -> StoreKit Configuration**: select file
4. Run app in simulator, verify products load and purchases complete
5. THEN write production code

Benefits: product ID typos caught in Xcode (not runtime), no App Store Connect dependency, teammates test locally, accelerated subscription renewal.

### StoreManager Architecture (Centralized, Required)

```swift
@MainActor
final class StoreManager: ObservableObject {
    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasedProductIDs: Set<String> = []

    private let productIDs = ["com.app.coins_100", "com.app.premium", "com.app.pro_monthly"]
    private var transactionListener: Task<Void, Never>?

    init() {
        transactionListener = listenForTransactions()
        Task { await loadProducts(); await updatePurchasedProducts() }
    }

    deinit { transactionListener?.cancel() }

    func loadProducts() async {
        do { products = try await Product.products(for: productIDs) }
        catch { print("Failed to load products: \(error)") }
    }

    func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                await self?.handleTransaction(result)
            }
        }
    }

    private func handleTransaction(_ result: VerificationResult<Transaction>) async {
        guard let transaction = try? result.payloadValue else { return }
        if transaction.revocationDate != nil {
            await revokeEntitlement(for: transaction.productID)
        } else {
            await grantEntitlement(for: transaction)
        }
        await transaction.finish() // CRITICAL: always finish
        await updatePurchasedProducts()
    }

    func updatePurchasedProducts() async {
        var purchased: Set<String> = []
        for await result in Transaction.currentEntitlements {
            if let tx = try? result.payloadValue, tx.revocationDate == nil {
                purchased.insert(tx.productID)
            }
        }
        purchasedProductIDs = purchased
    }
}
```

### Purchase Flow (iOS 18.2+)

```swift
func purchase(_ product: Product, confirmIn scene: UIWindowScene) async throws -> Bool {
    let result = try await product.purchase(confirmIn: scene)
    switch result {
    case .success(let verification):
        guard let transaction = try? verification.payloadValue else { return false }
        await grantEntitlement(for: transaction)
        await transaction.finish()
        await updatePurchasedProducts()
        return true
    case .userCancelled: return false
    case .pending: return false   // delivered via Transaction.updates when approved
    @unknown default: return false
    }
}
```

**SwiftUI purchase** (environment-based):
```swift
@Environment(\.purchase) private var purchase
// let result = try await purchase(product)
```

**With appAccountToken** (server backend):
```swift
try await product.purchase(confirmIn: scene, options: [.appAccountToken(accountToken)])
```

### Transaction Verification (Mandatory)

```swift
switch result {
case .verified(let transaction):
    await grantEntitlement(for: transaction)
    await transaction.finish()
case .unverified(let transaction, let error):
    print("Unverified: \(error)")
    // DO NOT grant entitlement
    await transaction.finish()  // still finish to clear queue
}
```

### Entitlement Granting by Product Type

```swift
func grantEntitlement(for transaction: Transaction) async {
    guard transaction.revocationDate == nil else {
        await revokeEntitlement(for: transaction.productID)
        return
    }
    switch transaction.productType {
    case .consumable:      await addConsumable(productID: transaction.productID)
    case .nonConsumable:   await unlockFeature(productID: transaction.productID)
    case .autoRenewable:   await activateSubscription(productID: transaction.productID)
    default: break
    }
}
```

### Restore Purchases (App Store Requirement)

```swift
func restorePurchases() async {
    try? await AppStore.sync()
    await updatePurchasedProducts()
}
```

Provide a visible "Restore Purchases" button in settings. App Store will reject apps without restore for non-consumables and subscriptions.

---

## Decision Tree

```
Need IAP?
├── .storekit config exists? ──No──> Create .storekit FIRST (Step 1 above)
├── StoreManager centralized? ──No──> Create centralized StoreManager
├── Transaction.updates listener? ──No──> Add listener (required for all IAP)
├── What product type?
│   ├── Consumable ──> finish() after granting, no restore needed
│   ├── Non-consumable ──> finish() after granting, MUST support restore
│   └── Auto-renewable subscription ──> See subscription section below
├── Subscription management needed?
│   ├── Track status ──> Product.SubscriptionInfo.status(for: groupID)
│   ├── Show paywall ──> SubscriptionStoreView (iOS 17+)
│   ├── Win-back expired ──> SubscriptionOfferView (iOS 18.4+)
│   └── Grace period ──> Check inGracePeriod, show update payment UI
├── Need StoreKit Views?
│   ├── Single product ──> ProductView(id:)
│   ├── Multiple products ──> StoreView(ids:)
│   ├── Subscription group ──> SubscriptionStoreView(groupID:)
│   └── Offer/upgrade ──> SubscriptionOfferView (iOS 18.4+)
└── Server integration?
    ├── Associate user ──> appAccountToken on purchase
    ├── Promo offers ──> JWS signature via App Store Server Library
    └── Refund handling ──> App Store Server Notifications
```

---

## Anti-Patterns

### No .storekit Configuration
```swift
// WRONG: writing purchase code without .storekit file
let products = try await Product.products(for: productIDs) // can't test locally!
```
Create `.storekit` config first. Product IDs validated in Xcode, not at runtime.

### Scattered Purchase Calls
```swift
// WRONG: purchase calls throughout app
Button("Buy") { try await product.purchase() }        // view 1
Button("Subscribe") { try await subProduct.purchase() } // view 2
```
Route ALL purchases through centralized StoreManager.

### Forgetting transaction.finish()
```swift
// WRONG: never calling finish
func handleTransaction(_ tx: Transaction) { grantEntitlement(for: tx) }
// Transaction redelivered on every launch, queue grows indefinitely
```
ALWAYS call `await transaction.finish()` after granting entitlement (or even for unverified/refunded).

### Skipping Verification
```swift
// WRONG: granting from unverified transaction
for await transaction in Transaction.all { grantEntitlement(for: transaction) }
```
Always check `VerificationResult` (.verified vs .unverified) before granting.

### No Transaction Listener
```swift
// WRONG: only handling purchases in purchase() method
func purchase() { let result = try await product.purchase() }
// Misses: pending approvals, Family Sharing, offer code redemptions, renewals
```
Listen to `Transaction.updates` for ALL transaction sources.

### No Restore Button
App Store will REJECT your app. Non-consumables and subscriptions require a visible "Restore Purchases" button.

---

## Deep Patterns

### Subscription Status Tracking

```swift
func checkSubscriptionStatus(for groupID: String) async -> Product.SubscriptionInfo.Status? {
    guard let statuses = try? await Product.SubscriptionInfo.status(for: groupID) else { return nil }
    return statuses.first
}
```

Handle all subscription states:
| State | Meaning | Action |
|-------|---------|--------|
| `.subscribed` | Active subscription | Full access |
| `.expired` | Subscription ended | Show win-back/resubscribe |
| `.inGracePeriod` | Billing issue, access maintained | Show "update payment" |
| `.inBillingRetryPeriod` | Apple retrying payment | Maintain access |
| `.revoked` | Family Sharing removed | Revoke access |

### StoreKit Views (iOS 17+)

**ProductView** (single product):
```swift
ProductView(id: "com.app.premium")
    .productViewStyle(.large)  // .regular, .compact, .large
```

**StoreView** (multiple products):
```swift
StoreView(ids: ["com.app.coins_100", "com.app.coins_500", "com.app.coins_1000"])
```

**SubscriptionStoreView** (subscription group):
```swift
SubscriptionStoreView(groupID: "pro_tier") {
    VStack { Image("app-icon"); Text("Go Pro").font(.largeTitle.bold()) }
}
.subscriptionStoreControlStyle(.prominentPicker) // iOS 18.4+
```

### SubscriptionOfferView (iOS 18.4+)

```swift
SubscriptionOfferView(id: "com.app.pro_monthly")
    .subscriptionOfferViewDetailAction { showStore = true }
```

**Visible relationships** (filter what to show):
```swift
SubscriptionOfferView(groupID: "pro_tier", visibleRelationship: .upgrade)    // only upgrades
SubscriptionOfferView(groupID: "pro_tier", visibleRelationship: .downgrade)  // only downgrades
SubscriptionOfferView(groupID: "pro_tier", visibleRelationship: .crossgrade) // same tier, diff billing
SubscriptionOfferView(groupID: "pro_tier", visibleRelationship: .current)    // current (if offer available)
```

### RenewalInfo

```swift
let statuses = try await Product.SubscriptionInfo.status(for: groupID)
for status in statuses {
    if case .verified(let renewalInfo) = status.renewalInfo {
        renewalInfo.willAutoRenew         // will renew?
        renewalInfo.autoRenewPreference   // product ID renewing to
        renewalInfo.expirationReason      // .autoRenewDisabled, .billingError, .didNotConsentToPriceIncrease
        renewalInfo.gracePeriodExpirationDate // grace period end (nil if none)
        renewalInfo.priceIncreaseStatus   // .agreed or .notYetResponded
    }
}
```

Win-back trigger: `renewalInfo.expirationReason == .didNotConsentToPriceIncrease`

### iOS 18.4 New Fields

**Transaction**:
- `transaction.appTransactionID` -- unique ID per Apple Account + app (consistent across all purchases)
- `transaction.offer?.period` -- ISO 8601 duration of offer
- `transaction.advancedCommerceInfo` -- present only for Advanced Commerce API purchases

**RenewalInfo**:
- `renewalInfo.appTransactionID`, `renewalInfo.appAccountToken`, `renewalInfo.offerPeriod`, `renewalInfo.advancedCommerceInfo`

**Deprecated**: `Transaction.currentEntitlement(for:)` -- use `Transaction.currentEntitlements(for:)` (sequence, handles Family Sharing).

### AppTransaction

```swift
let appTransaction = try await AppTransaction.shared
if case .verified(let tx) = appTransaction {
    tx.appTransactionID      // unique ID for Apple Account + app
    tx.originalPlatform      // .iOS, .macOS, .tvOS, .visionOS
    tx.appVersion            // current app version
    tx.originalAppVersion    // version at first download
    tx.originalPurchaseDate  // first download date
}
```

Use case -- business model migration (paid -> freemium):
```swift
if tx.originalPurchaseDate < migrationDate { await grantPremiumAccess() }
```

### Offer Codes (iOS 18.2+)

Now support ALL product types (previously subscription-only): consumables, non-consumables, non-renewing, auto-renewable.

```swift
// SwiftUI
.offerCodeRedemption(isPresented: $showRedeemSheet)

// UIKit
StoreKit.AppStore.presentOfferCodeRedeemSheet(in: scene)
```

Payment modes: `.freeTrial`, `.payAsYouGo`, `.payUpFront`, `.oneTime` (new, iOS 17.2+).

### Promotional Offers (JWS)

Requires server-side signature via App Store Server Library:
```swift
// Server (Swift)
import AppStoreServerLibrary
let creator = PromotionalOfferV2SignatureCreator(privateKey: key, keyID: keyID, issuerID: issuerID, bundleID: bundleID)
let signature = try creator.createSignature(productIdentifier: productID, subscriptionOfferIdentifier: offerID)

// Client
try await product.purchase(confirmIn: scene, options: [.promotionalOffer(offerID: "promo_winback", signature: jwsSignature)])
```

**SubscriptionStoreView with promotional offer**:
```swift
SubscriptionStoreView(groupID: groupID)
    .subscriptionPromotionalOffer(
        for: { $0.promotionalOffers.first },
        signature: { sub, offer in try await server.signOffer(productID: sub.id, offerID: offer.id) }
    )
```

### App Store Server API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/inApps/v1/transactions/{id}` | PATCH | Set appAccountToken post-purchase |
| `/inApps/v2/appTransaction/{id}` | GET | App download info on server |
| `/inApps/v2/transactions/consumption/{id}` | PUT | Consumption info for refund decisions |

**Consumption API v2** fields: `customerConsented`, `deliveryStatus`, `refundPreference` (`NO_REFUND` / `GRANT_REFUND` / `GRANT_PRORATED`), `consumptionPercentage` (0-100000 millipercent).

**Refund notifications**: `REFUND` notification with `revocationType`: `REFUND_FULL` (revoke all), `REFUND_PRORATED` (partial), `FAMILY_REVOKE` (Family Sharing removed).

### Family Sharing

- `appAccountToken` NOT available for family-shared transactions
- Each family member has unique `appTransactionID`
- Use `Transaction.currentEntitlements(for:)` (sequence) to handle multiple entitlements per product

### Unit Testing

```swift
protocol StoreProtocol {
    func products(for ids: [String]) async throws -> [Product]
    func purchase(_ product: Product) async throws -> PurchaseResult
}

final class MockStore: StoreProtocol {
    var mockProducts: [Product] = []
    var mockPurchaseResult: PurchaseResult?
    func products(for ids: [String]) async throws -> [Product] { mockProducts }
    func purchase(_ product: Product) async throws -> PurchaseResult { mockPurchaseResult ?? .userCancelled }
}
```

### Migration from StoreKit 1

| StoreKit 1 | StoreKit 2 |
|------------|------------|
| `SKPaymentTransactionObserver` delegate | `Transaction.updates` async sequence |
| `Bundle.main.appStoreReceiptURL` | `Transaction` (auto-verified) |
| `SKProductsRequest` + delegate | `Product.products(for:)` async |
| `SKPaymentQueue.add(payment)` | `product.purchase(confirmIn:)` |

---

## Diagnostics

### Products Not Loading
```bash
# Verify .storekit file exists
find . -name "*.storekit"
# Check scheme has StoreKit config set
# Verify product IDs match between code and .storekit file
```
Common cause: product IDs in code don't match .storekit config. Check for typos.

### Purchases Not Completing
1. Check `Transaction.updates` listener is active (must start at app launch)
2. Verify `transaction.finish()` is called (unfinished transactions redelivered forever)
3. Check VerificationResult handling -- are you granting for `.verified` only?

### Entitlements Disappearing
1. Check `revocationDate` -- transaction may have been refunded
2. Verify `updatePurchasedProducts()` is called after transaction handling
3. For subscriptions, check `Product.SubscriptionInfo.status(for: groupID)` for expiration

### Subscription Status Wrong
1. Use `Product.SubscriptionInfo.status(for: groupID)` not manual tracking
2. Check for `inGracePeriod` / `inBillingRetryPeriod` (still have access)
3. Listen for `Product.SubscriptionInfo.Status.updates(for: groupID)` for real-time changes

### Sandbox Testing Issues
- Create sandbox account: App Store Connect -> Users and Access -> Sandbox Testers
- Sign in: Settings -> App Store -> Sandbox Account
- Clear history: Settings -> App Store -> Sandbox Account -> Clear Purchase History

### Validation Checklist
```bash
# StoreKit configuration exists
find . -name "*.storekit"
# transaction.finish() called
rg "transaction\.finish\(\)" --type swift
# VerificationResult used
rg "VerificationResult" --type swift
# Transaction.updates listener
rg "Transaction\.updates" --type swift
# Restore implemented
rg "AppStore\.sync|Transaction\.all" --type swift
```

---

## Related

- **ax-build** -- build failures, dependency issues
- **ax-shipping** -- App Store submission, rejection diagnostics
- **ax-testing** -- Swift Testing, unit test patterns

**Product types**: `.consumable` (coins, boosts), `.nonConsumable` (premium, level packs), `.autoRenewable` (subscriptions), `.nonRenewing` (seasonal passes)

**Essential API calls**:
```swift
Product.products(for:)                           // load products
product.purchase(confirmIn:options:)             // purchase
Transaction.currentEntitlements / .currentEntitlements(for:) // check ownership
Transaction.updates                              // listen for all transaction events
Product.SubscriptionInfo.status(for:)            // subscription status
AppStore.sync()                                  // restore purchases
transaction.finish()                             // ALWAYS call after handling
```

**WWDC**: 2025-241, 2025-249, 2024-10061, 2024-10062, 2023-10013, 2021-10114
**Docs**: /storekit, /appstoreserverapi
