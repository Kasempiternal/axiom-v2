---
name: ax-cloud-storage
description: CloudKit sync, CKSyncEngine, iCloud Drive, NSFileCoordinator, conflict resolution, CKRecord, CKShare, subscriptions, NSUbiquitousKeyValueStore, offline-first patterns
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-cloud-sync", "axiom-cloud-sync-diag", "axiom-cloudkit-ref", "axiom-icloud-drive-ref"]
---

# Cloud Storage

## Quick Patterns

### CloudKit vs iCloud Drive Decision

```
What are you syncing?
├─ Structured data (records, fields) → CloudKit
│   ├─ Using SwiftData? → SwiftData + CloudKit container
│   ├─ Using SQLiteData? → CKSyncEngine (manual sync)
│   └─ Custom data model? → CKSyncEngine or raw CloudKit APIs
│
├─ User documents/files → iCloud Drive
│   ├─ Standard document types? → UIDocument + ubiquitous container
│   ├─ Custom file formats? → NSFileCoordinator
│   └─ Small preferences (<1MB)? → NSUbiquitousKeyValueStore
│
└─ Both? → CloudKit for metadata, iCloud Drive for large files
```

### Offline-First Pattern (Mandatory)

```swift
// ALWAYS: Write local first, sync in background
func saveTrack(_ track: Track) async throws {
    // 1. Save locally FIRST (instant, works offline)
    try database.insert(track)

    // 2. Queue for sync (background, can fail)
    syncEngine.queueChange(.save(track))

    // 3. Never block UI on sync
    // Sync happens asynchronously
}

// NEVER: Require network for local operations
// WRONG:
func saveTrack(_ track: Track) async throws {
    try await cloudKit.save(track)  // Fails offline!
}
```

### CloudKit Three Approaches

```swift
// Approach 1: SwiftData + CloudKit (simplest)
let config = ModelConfiguration(
    cloudKitDatabase: .private("iCloud.com.myapp")
)
let container = try ModelContainer(for: Track.self, configurations: config)
// Automatic sync - no additional code needed

// Approach 2: CKSyncEngine (WWDC 2023 - recommended for custom sync)
let syncEngine = CKSyncEngine(
    configuration: CKSyncEngine.Configuration(
        database: CKContainer.default().privateCloudDatabase,
        stateSerialization: loadSavedState(),
        delegate: self
    )
)

// Approach 3: Raw CloudKit APIs (full control)
let container = CKContainer.default()
let privateDB = container.privateCloudDatabase
```

### CKSyncEngine Delegate

```swift
class SyncDelegate: CKSyncEngineDelegate {
    func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) {
        switch event {
        case .stateUpdate(let stateUpdate):
            // Save state for persistence across launches
            saveSyncState(stateUpdate.stateSerialization)

        case .accountChange(let event):
            handleAccountChange(event)

        case .fetchedDatabaseChanges(let changes):
            handleDatabaseChanges(changes)

        case .fetchedRecordZoneChanges(let changes):
            handleZoneChanges(changes)

        case .sentDatabaseChanges(let sentChanges):
            handleSentDatabaseChanges(sentChanges)

        case .sentRecordZoneChanges(let sentChanges):
            handleSentZoneChanges(sentChanges)

        default: break
        }
    }

    func nextRecordZoneChangeBatch(
        _ context: CKSyncEngine.SendChangesContext,
        syncEngine: CKSyncEngine
    ) async -> CKSyncEngine.RecordZoneChangeBatch? {
        let pendingChanges = syncEngine.state.pendingRecordZoneChanges
        return await CKSyncEngine.RecordZoneChangeBatch(
            pendingChanges: pendingChanges
        ) { recordID in
            // Convert local record to CKRecord
            self.recordForID(recordID)
        }
    }
}
```

### Conflict Resolution Strategies

```swift
// Strategy 1: Last-Writer-Wins (simplest)
func resolveConflict(local: CKRecord, server: CKRecord) -> CKRecord {
    if local.modificationDate ?? .distantPast > server.modificationDate ?? .distantPast {
        return local
    }
    return server
}

// Strategy 2: Field-Level Merge
func resolveConflict(local: CKRecord, server: CKRecord) -> CKRecord {
    let merged = server  // Start with server version
    // Merge specific fields from local if newer
    if let localTitle = local["title"], let serverTitle = server["title"] {
        // Keep whichever was modified more recently per-field
        merged["title"] = localTitle  // App-specific logic
    }
    return merged
}

// Strategy 3: User Choice
func resolveConflict(local: CKRecord, server: CKRecord) async -> CKRecord {
    let choice = await showConflictUI(local: local, server: server)
    return choice == .keepLocal ? local : server
}
```

### CloudKit CRUD Operations

```swift
let database = CKContainer.default().privateCloudDatabase

// Create
let record = CKRecord(recordType: "Track")
record["title"] = "Song" as CKRecordValue
record["artist"] = "Artist" as CKRecordValue
try await database.save(record)

// Read
let recordID = CKRecord.ID(recordName: "trackID")
let record = try await database.record(for: recordID)

// Update (fetch-then-modify to avoid conflicts)
let record = try await database.record(for: recordID)
record["playCount"] = (record["playCount"] as? Int ?? 0) + 1
try await database.save(record)

// Delete
try await database.deleteRecord(withID: recordID)

// Batch
let (saved, deleted) = try await database.modifyRecords(
    saving: recordsToSave,
    deleting: recordIDsToDelete,
    savePolicy: .changedKeys  // Only send changed fields
)
```

### CloudKit Database Scopes

```swift
let container = CKContainer.default()

// Private: User's own data, counts toward user's iCloud quota
let privateDB = container.privateCloudDatabase

// Public: Shared across all users, counts toward app's quota
let publicDB = container.publicCloudDatabase

// Shared: Data shared via CKShare, counts toward owner's quota
let sharedDB = container.sharedCloudDatabase
```

### CloudKit Sharing

```swift
// Create share
let share = CKShare(rootRecord: record)
share[CKShare.SystemFieldKey.title] = "Shared Playlist" as CKRecordValue
share.publicPermission = .none  // Invite only

try await database.modifyRecords(saving: [record, share], deleting: [])

// Share UI
let sharingController = UICloudSharingController(share: share, container: container)
present(sharingController, animated: true)

// Accept share (in SceneDelegate or AppDelegate)
func userDidAcceptCloudKitShare(_ cloudKitShareMetadata: CKShare.Metadata) {
    let acceptOp = CKAcceptSharesOperation(shareMetadatas: [cloudKitShareMetadata])
    acceptOp.qualityOfService = .userInitiated
    CKContainer(identifier: cloudKitShareMetadata.containerIdentifier)
        .add(acceptOp)
}

// Participant management
share.addParticipant(participant)
participant.permission = .readWrite
```

### CloudKit Subscriptions

```swift
// Database subscription (all changes in zone)
let subscription = CKDatabaseSubscription(subscriptionID: "all-changes")
subscription.notificationInfo = CKSubscription.NotificationInfo()
subscription.notificationInfo?.shouldSendContentAvailable = true  // Silent push
try await database.save(subscription)

// Query subscription (specific record type)
let querySubscription = CKQuerySubscription(
    recordType: "Track",
    predicate: NSPredicate(format: "artist == %@", "Artist"),
    subscriptionID: "artist-tracks",
    options: [.firesOnRecordCreation, .firesOnRecordUpdate]
)
try await database.save(querySubscription)
```

### CKAsset (File Storage in CloudKit)

```swift
// Upload
let fileURL = URL(fileURLWithPath: "/path/to/image.jpg")
let asset = CKAsset(fileURL: fileURL)
record["coverArt"] = asset

// Download
if let asset = record["coverArt"] as? CKAsset,
   let url = asset.fileURL {
    let data = try Data(contentsOf: url)
}
```

---

### iCloud Drive Setup

```swift
// Entitlements: iCloud Documents capability + ubiquity container

// Get container URL
guard let containerURL = FileManager.default.url(
    forUbiquityContainerIdentifier: "iCloud.com.myapp"
) else {
    // iCloud not available
    return
}

let documentsURL = containerURL.appendingPathComponent("Documents")
try FileManager.default.createDirectory(
    at: documentsURL,
    withIntermediateDirectories: true
)
```

### NSFileCoordinator (Required for iCloud Files)

```swift
// Read with coordination
let coordinator = NSFileCoordinator()
var error: NSError?

coordinator.coordinate(readingItemAt: fileURL, options: [], error: &error) { readURL in
    let data = try? Data(contentsOf: readURL)
    // Process data
}

// Write with coordination
coordinator.coordinate(writingItemAt: fileURL, options: .forReplacing, error: &error) { writeURL in
    try? data.write(to: writeURL)
}

// Move with coordination (both source and destination)
coordinator.coordinate(
    writingItemAt: sourceURL, options: .forMoving,
    writingItemAt: destURL, options: .forReplacing,
    error: &error
) { safeSource, safeDest in
    try? FileManager.default.moveItem(at: safeSource, to: safeDest)
}
```

### NSFilePresenter (Monitor Changes)

```swift
class DocumentPresenter: NSObject, NSFilePresenter {
    let presentedItemURL: URL?
    let presentedItemOperationQueue = OperationQueue()

    init(url: URL) {
        self.presentedItemURL = url
        super.init()
        NSFileCoordinator.addFilePresenter(self)
    }

    func presentedItemDidChange() {
        // File was modified externally (another device)
        reloadContent()
    }

    func presentedItemDidMoveToURL(_ newURL: URL) {
        // File was moved/renamed
    }

    deinit {
        NSFileCoordinator.removeFilePresenter(self)
    }
}
```

### iCloud Drive Conflict Resolution

```swift
func resolveConflicts(for url: URL) throws {
    guard let versions = NSFileVersion.unresolvedConflictVersionsOfItem(at: url),
          !versions.isEmpty else { return }

    let currentVersion = NSFileVersion.currentVersionOfItem(at: url)

    for version in versions {
        if shouldKeep(version, over: currentVersion) {
            try version.replaceItem(at: url)
        }
        version.isResolved = true
    }

    try NSFileVersion.removeOtherVersionsOfItem(at: url)
}
```

### Download & Upload Status

```swift
// Check file status
let values = try url.resourceValues(forKeys: [
    .ubiquitousItemDownloadingStatusKey,
    .ubiquitousItemIsUploadingKey,
    .ubiquitousItemUploadingErrorKey
])

// Trigger download
if values.ubiquitousItemDownloadingStatus == .notDownloaded {
    try FileManager.default.startDownloadingUbiquitousItem(at: url)
}

// Monitor with NSMetadataQuery
let query = NSMetadataQuery()
query.searchScopes = [NSMetadataQueryUbiquitousDocumentsScope]
query.predicate = NSPredicate(format: "%K LIKE '*.txt'", NSMetadataItemFSNameKey)

NotificationCenter.default.addObserver(
    forName: .NSMetadataQueryDidUpdate, object: query, queue: .main
) { _ in
    // Handle file changes
}
query.start()
```

### NSUbiquitousKeyValueStore (Small Data)

```swift
// Key-value storage (<1MB total, 1024 keys max)
let kvStore = NSUbiquitousKeyValueStore.default

// Write
kvStore.set("value", forKey: "preference")
kvStore.synchronize()  // Request sync (not guaranteed immediate)

// Read
let value = kvStore.string(forKey: "preference")

// Observe changes
NotificationCenter.default.addObserver(
    forName: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
    object: kvStore, queue: .main
) { notification in
    guard let userInfo = notification.userInfo,
          let reason = userInfo[NSUbiquitousKeyValueStoreChangeReasonKey] as? Int
    else { return }

    switch reason {
    case NSUbiquitousKeyValueStoreServerChange:
        // External change - update UI
        break
    case NSUbiquitousKeyValueStoreQuotaViolationChange:
        // Over 1MB limit - reduce stored data
        break
    default: break
    }
}
```

### Entitlements Checklist

```
CloudKit:
☐ iCloud capability enabled in Signing & Capabilities
☐ CloudKit checkbox selected
☐ Container identifier configured (iCloud.com.yourapp)
☐ Push Notifications capability (for subscriptions)

iCloud Drive:
☐ iCloud capability enabled
☐ iCloud Documents checkbox selected
☐ Ubiquity container identifier in entitlements
☐ NSUbiquitousContainers in Info.plist (for Files app visibility)

Both:
☐ Signed with provisioning profile that includes iCloud
☐ Real device for testing (simulator has limitations)
☐ iCloud account signed in on device
```

## Decision Tree

```
Cloud storage task?

├─ Choosing sync approach
│   ├─ Simple structured data? → SwiftData + CloudKit
│   ├─ Custom sync logic needed? → CKSyncEngine (WWDC 2023)
│   ├─ Large files/documents? → iCloud Drive
│   ├─ Small preferences? → NSUbiquitousKeyValueStore
│   └─ Complex sharing needs? → CKShare + raw CloudKit
│
├─ Conflict resolution
│   ├─ Structured data? → Field-level merge or last-writer-wins
│   ├─ Documents? → NSFileVersion resolution
│   └─ User-facing? → Present choice UI
│
├─ Sync not working
│   ├─ Check account status first (see Diagnostics)
│   ├─ Check entitlements
│   ├─ Check network
│   └─ Check CloudKit Console for errors
│
└─ Performance
    ├─ Initial sync slow? → Batch fetch with CKQueryOperation
    ├─ Too much data? → Use CKSyncEngine zones for partitioning
    └─ Large files? → CKAsset for CloudKit, file coordination for iCloud Drive
```

## Anti-Patterns

```swift
// ---- Requiring network for save ----
// WRONG: Save fails when offline
func save(_ track: Track) async throws {
    try await cloudDatabase.save(CKRecord(track))  // Fails offline!
}
// FIX: Offline-first - save locally, queue sync
func save(_ track: Track) throws {
    try localDatabase.save(track)
    syncEngine.queueChange(.save(track))
}

// ---- Overwriting without fetch (serverRecordChanged) ----
// WRONG: Save without checking server version
let record = CKRecord(recordType: "Track")
record["title"] = "My Title"
try await database.save(record)  // CKError.serverRecordChanged!
// FIX: Fetch-then-modify
let existing = try await database.record(for: recordID)
existing["title"] = "My Title"
try await database.save(existing)

// ---- Ignoring batch operation partial failures ----
// WRONG: Assuming all records saved
let (saved, _) = try await database.modifyRecords(saving: records, deleting: [])
// Some records may have failed silently!
// FIX: Check per-record results
// Use perRecordSaveBlock or check saved count vs input count

// ---- File access without coordination ----
// WRONG: Direct file access for iCloud files
let data = try Data(contentsOf: iCloudURL)  // May read partial/corrupt data
// FIX: Use NSFileCoordinator
let coordinator = NSFileCoordinator()
coordinator.coordinate(readingItemAt: iCloudURL, options: [], error: &error) { url in
    let data = try Data(contentsOf: url)
}

// ---- NSUbiquitousKeyValueStore for large data ----
// WRONG: Storing large data in key-value store
kvStore.set(largeImageData, forKey: "avatar")  // > 1MB limit!
// FIX: Use CloudKit CKAsset or iCloud Drive for large data
```

## Deep Patterns

### Sync State Indicators

```swift
@MainActor
class SyncStatusViewModel: ObservableObject {
    enum SyncState {
        case idle, syncing, error(String), offline
    }

    @Published var state: SyncState = .idle

    func updateFromEngine(_ event: CKSyncEngine.Event) {
        switch event {
        case .willFetchChanges: state = .syncing
        case .didFetchChanges: state = .idle
        case .willSendChanges: state = .syncing
        case .didSendChanges: state = .idle
        default: break
        }
    }
}
```

### Large Dataset Initial Sync

```swift
// Batch initial fetch
func performInitialSync() async throws {
    var cursor: CKQueryOperation.Cursor? = nil

    repeat {
        let (results, nextCursor) = try await database.records(
            matching: CKQuery(recordType: "Track", predicate: NSPredicate(value: true)),
            resultsLimit: 200,
            desiredKeys: ["title", "artist"],  // Fetch only needed fields
            continuationCursor: cursor
        )

        // Process batch
        let tracks = results.compactMap { try? $0.1.get() }
        try localDatabase.batchInsert(tracks.map(Track.init))

        cursor = nextCursor
    } while cursor != nil
}
```

## Diagnostics

### Mandatory First Checks

```swift
// 1. Account status
func checkAccountStatus() async throws -> CKAccountStatus {
    try await CKContainer.default().accountStatus()
    // .available, .noAccount, .restricted, .couldNotDetermine
}

// 2. Entitlements
// Build Settings → Signing & Capabilities → iCloud

// 3. Network reachability
// NWPathMonitor for network status

// 4. Container accessible
func checkContainer() async throws {
    let container = CKContainer.default()
    let id = try await container.containerIdentifier
    print("Container: \(id ?? "none")")
}
```

### CloudKit Error Handling

```
CKError received?

├─ .serverRecordChanged
│   └─ Conflict: fetch server record, merge, retry save
│       let serverRecord = error.serverRecord!
│       // Merge and retry
│
├─ .quotaExceeded
│   └─ User's iCloud full → show alert, reduce data
│
├─ .networkUnavailable / .networkFailure
│   └─ Queue for retry when network returns
│
├─ .notAuthenticated
│   └─ No iCloud account → prompt user to sign in
│
├─ .zoneNotFound
│   └─ Create zone first, then retry
│
├─ .limitExceeded
│   └─ Too many records in batch → reduce batch size
│
├─ .partialFailure
│   └─ Check perRecordErrors in userInfo
│       let partialErrors = error.partialErrorsByItemID
│
└─ .requestRateLimited
    └─ Retry after error.retryAfterSeconds
```

### iCloud Drive Issues

```
iCloud Drive not syncing?

├─ File not appearing on other devices
│   ├─ Check ubiquitous container URL not nil
│   ├─ File in correct subdirectory? (Documents/)
│   ├─ Using NSFileCoordinator for writes?
│   └─ Check upload status with resource values
│
├─ Download stuck
│   ├─ Check downloading status key
│   ├─ Network available?
│   ├─ Try startDownloadingUbiquitousItem again
│   └─ Check device storage space
│
├─ Conflicts appearing
│   ├─ Multiple devices editing same file simultaneously
│   ├─ Implement NSFileVersion conflict resolution
│   └─ Consider locking mechanism for collaborative editing
│
└─ NSFileCoordinator deadlock
    ├─ Coordinating on main thread? → Move to background
    ├─ Nested coordination? → Flatten to single coordination
    └─ NSFilePresenter callback causing re-entrant coordination?
        → Use separate OperationQueue
```

### Debug Logging

```
// CloudKit
-com.apple.CoreData.CloudKitDebug 1

// Verbose CloudKit
-com.apple.CoreData.CloudKitDebug 3

// CloudKit Console (web)
// https://icloud.developer.apple.com/dashboard
// Monitor: errors, throughput, sync state
```

## Related

- `ax-swiftdata` - SwiftData + CloudKit container setup
- `ax-grdb` - SQLiteData + CKSyncEngine integration
- `ax-file-storage` - Local file storage decisions before cloud sync
- `ax-concurrency` - Background sync operations
