---
name: ax-core-data
description: Core Data stack setup, NSPersistentContainer, NSManagedObjectContext, thread-confinement, CloudKit integration, migration, diagnostics, SwiftData bridging
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-core-data", "axiom-core-data-diag"]
---

# Core Data

## Quick Patterns

### Stack Setup

```swift
class CoreDataStack {
    static let shared = CoreDataStack()

    lazy var persistentContainer: NSPersistentContainer = {
        let container = NSPersistentContainer(name: "MyModel")
        container.loadPersistentStores { _, error in
            if let error { fatalError("Core Data failed: \(error)") }
        }
        container.viewContext.automaticallyMergesChangesFromParent = true
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
        return container
    }()

    var viewContext: NSManagedObjectContext {
        persistentContainer.viewContext
    }
}
```

### CloudKit Integration

```swift
lazy var persistentContainer: NSPersistentCloudKitContainer = {
    let container = NSPersistentCloudKitContainer(name: "MyModel")

    let publicDescription = NSPersistentStoreDescription()
    publicDescription.cloudKitContainerOptions =
        NSPersistentCloudKitContainerOptions(
            containerIdentifier: "iCloud.com.myapp"
        )
    publicDescription.cloudKitContainerOptions?.databaseScope = .public

    container.persistentStoreDescriptions = [publicDescription]
    container.loadPersistentStores { _, error in
        if let error { fatalError("CloudKit Core Data failed: \(error)") }
    }
    container.viewContext.automaticallyMergesChangesFromParent = true
    return container
}()
```

### Background Context Operations

```swift
// CRITICAL: NSManagedObject is NOT thread-safe
// Never pass managed objects across threads - use objectID

func importData(_ items: [RawItem]) {
    let context = persistentContainer.newBackgroundContext()
    context.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy

    context.perform {
        for item in items {
            let entity = CDTrack(context: context)
            entity.id = item.id
            entity.title = item.title
        }

        do {
            try context.save()
        } catch {
            context.rollback()
        }
    }
}

// Pass objectID across threads
func updateOnBackground(objectID: NSManagedObjectID) {
    let context = persistentContainer.newBackgroundContext()
    context.perform {
        let object = context.object(with: objectID) as! CDTrack
        object.playCount += 1
        try? context.save()
    }
}
```

### @FetchRequest in SwiftUI

```swift
struct TrackListView: View {
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \CDTrack.title, ascending: true)],
        predicate: NSPredicate(format: "playCount > %d", 0),
        animation: .default
    ) private var tracks: FetchedResults<CDTrack>

    var body: some View {
        List(tracks) { track in
            Text(track.title ?? "Unknown")
        }
    }
}
```

### Relationship Modeling

```swift
// One-to-Many (xcdatamodeld)
// Playlist: tracks (To Many, Ordered: NO, Delete Rule: Cascade)
// Track: playlist (To One, Delete Rule: Nullify)

// Many-to-Many (xcdatamodeld)
// Track: tags (To Many)
// Tag: tracks (To Many)

// Code access
extension CDPlaylist {
    var tracksArray: [CDTrack] {
        (tracks as? Set<CDTrack>)?.sorted { ($0.title ?? "") < ($1.title ?? "") } ?? []
    }
}
```

### Batch Operations

```swift
// Batch insert (iOS 14+)
let batchInsert = NSBatchInsertRequest(entity: CDTrack.entity()) { (obj: NSManagedObject) -> Bool in
    guard let track = obj as? CDTrack else { return true }
    guard let nextItem = itemIterator.next() else { return true }
    track.id = nextItem.id
    track.title = nextItem.title
    return false
}
batchInsert.resultType = .count
let result = try context.execute(batchInsert) as? NSBatchInsertResult

// Batch delete
let fetchRequest: NSFetchRequest<NSFetchRequestResult> = CDTrack.fetchRequest()
fetchRequest.predicate = NSPredicate(format: "playCount == 0")
let deleteRequest = NSBatchDeleteRequest(fetchRequest: fetchRequest)
deleteRequest.resultType = .resultTypeCount
try context.execute(deleteRequest)

// CRITICAL: Batch operations bypass context - merge changes
try persistentContainer.viewContext.execute(deleteRequest)
NSManagedObjectContext.mergeChanges(
    fromRemoteContextSave: [NSDeletedObjectsKey: result.result ?? []],
    into: [persistentContainer.viewContext]
)
```

### Migration

```swift
// Lightweight (automatic for simple changes):
// - Adding optional attributes
// - Removing attributes
// - Adding entities
// - Renaming with renamingIdentifier

// Heavy migration with mapping model:
let coordinator = NSPersistentStoreCoordinator(managedObjectModel: newModel)
let options: [String: Any] = [
    NSMigratePersistentStoresAutomaticallyOption: true,
    NSInferMappingModelAutomaticallyOption: true
]
try coordinator.addPersistentStore(
    ofType: NSSQLiteStoreType,
    configurationName: nil,
    at: storeURL,
    options: options
)

// Custom migration policy
class TrackMigrationPolicy: NSEntityMigrationPolicy {
    override func createDestinationInstances(
        forSource sInstance: NSManagedObject,
        in mapping: NSEntityMapping,
        manager: NSMigrationManager
    ) throws {
        try super.createDestinationInstances(forSource: sInstance, in: mapping, manager: manager)
        guard let destination = manager.destinationInstances(
            forEntityMappingName: mapping.name,
            sourceInstances: [sInstance]
        ).first else { return }

        // Transform data
        if let oldDuration = sInstance.value(forKey: "durationString") as? String {
            destination.setValue(Double(oldDuration) ?? 0, forKey: "duration")
        }
    }
}
```

## Decision Tree

```
Core Data task?
├─ New project?
│   └─ Consider SwiftData first (unless needing advanced features)
│
├─ Thread-safety issue
│   ├─ Crash in background? → Use context.perform { }
│   ├─ Passing objects between threads? → Pass objectID instead
│   └─ Merge conflicts? → Set appropriate mergePolicy
│
├─ Migration needed
│   ├─ Adding optional attribute? → Lightweight (automatic)
│   ├─ Renaming? → Set renamingIdentifier in model editor
│   ├─ Complex transform? → Custom NSEntityMigrationPolicy
│   └─ Multi-step? → Progressive migration through versions
│
├─ Performance issue
│   ├─ Slow list? → Batch size on fetch request + relationship faulting
│   ├─ Large import? → NSBatchInsertRequest (bypasses context)
│   ├─ Slow delete? → NSBatchDeleteRequest
│   └─ N+1 queries? → relationshipKeyPathsForPrefetching
│
└─ CloudKit integration
    ├─ Private database? → NSPersistentCloudKitContainer
    ├─ Public database? → Set databaseScope = .public
    └─ Conflict resolution? → mergePolicy on context
```

## Anti-Patterns

```swift
// ---- Thread-confinement violation ----
// WRONG: Passing NSManagedObject across threads
let track = viewContext.fetch(request).first!
DispatchQueue.global().async {
    track.title = "New Title"  // CRASH: wrong thread
}
// FIX: Pass objectID, fetch in new context
let objectID = track.objectID
DispatchQueue.global().async {
    let bgContext = container.newBackgroundContext()
    bgContext.perform {
        let bgTrack = bgContext.object(with: objectID) as! CDTrack
        bgTrack.title = "New Title"
        try? bgContext.save()
    }
}

// ---- Missing perform block ----
// WRONG: Accessing context without perform
let bgContext = container.newBackgroundContext()
let tracks = try bgContext.fetch(request)  // Unsafe
// FIX: Always wrap in perform
bgContext.perform {
    let tracks = try bgContext.fetch(request)
}

// ---- Batch operation without merge ----
// WRONG: Batch delete without updating viewContext
let deleteReq = NSBatchDeleteRequest(fetchRequest: fetchReq)
try bgContext.execute(deleteReq)
// viewContext still shows deleted objects!
// FIX: Merge changes into all contexts
deleteReq.resultType = .resultTypeObjectIDs
let result = try bgContext.execute(deleteReq) as? NSBatchDeleteResult
NSManagedObjectContext.mergeChanges(
    fromRemoteContextSave: [NSDeletedObjectsKey: result?.result ?? []],
    into: [container.viewContext]
)

// ---- Deleting database under pressure ----
// WRONG: "Just delete the database and let it recreate"
// This destroys ALL user data permanently
// FIX: ALWAYS use proper migration, even if complex
```

## Deep Patterns

### Safe Migration Under Production Pressure

Migration is non-negotiable for shipped apps. When stakeholders push back:

**When PM says "just delete the database":**
- User data is irreplaceable - photos, notes, preferences
- App Store reviews will tank immediately
- GDPR/legal liability for data destruction
- Migration takes days; reputation recovery takes months

**Progressive migration strategy:**
```
V1 → V2: lightweight (automatic)
V2 → V3: lightweight + custom policy
V3 → V4: If too complex, decompose into V3→V3.1→V4
```

**Always maintain:**
- Backup before migration
- Rollback capability
- Data integrity verification after migration
- Real device testing with production-sized data

### SwiftData + Core Data Bridging

```swift
// Same underlying store - coexistence possible
let coreDataURL = FileManager.default.urls(
    for: .applicationSupportDirectory, in: .userDomainMask
)[0].appendingPathComponent("MyModel.sqlite")

// SwiftData reads Core Data store
let swiftDataConfig = ModelConfiguration(url: coreDataURL)
let container = try ModelContainer(
    for: Track.self,
    configurations: swiftDataConfig
)

// Gradual migration: new features in SwiftData, legacy in Core Data
// Both access same SQLite file
```

### N+1 Query Prevention

```swift
// Set batch size for large result sets
let request = NSFetchRequest<CDTrack>(entityName: "Track")
request.fetchBatchSize = 50

// Prefetch relationships
request.relationshipKeyPathsForPrefetching = ["artist", "album"]

// Fetch only needed properties
request.propertiesToFetch = ["title", "artist"]
request.resultType = .dictionaryResultType
```

## Diagnostics

### Mandatory First Steps

```swift
// 1. Check model hash
func checkModelHash() {
    let model = persistentContainer.managedObjectModel
    for entity in model.entities {
        print("Entity: \(entity.name ?? "?"), hash: \(entity.versionHash)")
    }
}

// 2. Check store metadata
func checkStoreMetadata() throws {
    let metadata = try NSPersistentStoreCoordinator.metadataForPersistentStore(
        ofType: NSSQLiteStoreType, at: storeURL
    )
    print("Store metadata: \(metadata)")
}

// 3. Enable SQL debug logging
// Launch argument: -com.apple.CoreData.SQLDebug 1
// Verbose: -com.apple.CoreData.SQLDebug 3
```

### Common Error Decision Tree

```
Core Data error?
├─ "The model used to open the store is incompatible"
│   ├─ Dev build? → Delete app, reinstall
│   ├─ Production? → Add migration (VersionedSchema or mapping model)
│   └─ Check: model version matches store metadata hash
│
├─ EXC_BAD_ACCESS / Thread sanitizer warnings
│   ├─ Background context without perform? → Wrap in context.perform {}
│   ├─ Passing managed object across threads? → Use objectID
│   └─ Accessing fault after context reset? → Re-fetch before access
│
├─ Merge conflict (NSMergeConflict)
│   ├─ Optimistic locking failed → Set mergePolicy
│   ├─ CloudKit + local edit → NSMergeByPropertyObjectTrumpMergePolicy
│   └─ Multiple contexts saving → automaticallyMergesChangesFromParent = true
│
├─ N+1 query performance
│   ├─ Many faults firing in loop → relationshipKeyPathsForPrefetching
│   ├─ Large list scrolling → fetchBatchSize = 50
│   └─ Enable -com.apple.CoreData.SQLDebug 1 to see queries
│
└─ CloudKit sync not working
    ├─ Check entitlements (CloudKit + push notifications)
    ├─ Check iCloud account signed in
    ├─ Enable -com.apple.CoreData.CloudKitDebug 1
    └─ Verify NSPersistentCloudKitContainer (not NSPersistentContainer)
```

## Related

- `ax-swiftdata` - Modern SwiftData patterns, migration to SwiftData
- `ax-grdb` - When needing raw SQL performance
- `ax-cloud-storage` - CloudKit sync architecture and conflict resolution
- `ax-concurrency` - Thread-safe context access patterns
