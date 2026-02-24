---
name: ax-swiftdata
description: SwiftData @Model, @Query, relationships, ModelContainer, CRUD, predicates, CloudKit integration, schema migrations, performance patterns, Swift 6 concurrency
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-swiftdata", "axiom-swiftdata-migration", "axiom-swiftdata-migration-diag"]
---

# SwiftData

## Quick Patterns

### @Model Definition

```swift
@Model
final class Track {
    @Attribute(.unique) var id: UUID
    var title: String
    var artist: String
    var duration: TimeInterval
    var playCount: Int = 0

    // Relationships
    @Relationship(deleteRule: .cascade, inverse: \Playlist.tracks)
    var playlists: [Playlist] = []

    // Transient (not persisted)
    @Transient var isPlaying: Bool = false

    // Indexes for query performance
    static let indexes: [[IndexColumn<Track>]] = [
        [.init(\.artist), .init(\.title)]
    ]

    init(id: UUID = UUID(), title: String, artist: String, duration: TimeInterval) {
        self.id = id
        self.title = title
        self.artist = artist
        self.duration = duration
    }
}
```

### ModelContainer Setup

```swift
// Basic
let container = try ModelContainer(for: Track.self, Playlist.self)

// With configuration
let config = ModelConfiguration(
    "MyStore",
    schema: Schema([Track.self, Playlist.self]),
    isStoredInMemoryOnly: false,
    allowsSave: true,
    cloudKitDatabase: .private("iCloud.com.app.id")
)
let container = try ModelContainer(
    for: Track.self, Playlist.self,
    configurations: config
)

// SwiftUI
@main
struct MyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
            .modelContainer(for: [Track.self, Playlist.self])
    }
}
```

### @Query in SwiftUI

```swift
struct TrackListView: View {
    @Query(
        filter: #Predicate<Track> { $0.playCount > 0 },
        sort: [SortDescriptor(\.title)],
        animation: .default
    ) private var tracks: [Track]

    @Environment(\.modelContext) private var context

    var body: some View {
        List(tracks) { track in
            Text(track.title)
        }
    }
}
```

### CRUD Operations

```swift
// Create
let track = Track(title: "Song", artist: "Artist", duration: 210)
context.insert(track)

// Read
let descriptor = FetchDescriptor<Track>(
    predicate: #Predicate { $0.artist == "Artist" },
    sortBy: [SortDescriptor(\.title)]
)
descriptor.fetchLimit = 20
let tracks = try context.fetch(descriptor)

// Update
track.playCount += 1
// Auto-saved by context

// Delete
context.delete(track)

// Batch delete
try context.delete(model: Track.self, where: #Predicate { $0.playCount == 0 })

// Save explicitly
try context.save()
```

### Complex Predicates

```swift
// Compound
#Predicate<Track> { $0.artist == "Artist" && $0.duration > 180 }

// String operations
#Predicate<Track> { $0.title.localizedStandardContains("love") }

// Optional handling
#Predicate<Track> { $0.album != nil }

// Relationship query
#Predicate<Playlist> { $0.tracks.contains(where: { $0.artist == "Artist" }) }

// Dynamic predicate from variable
func search(_ term: String) -> Predicate<Track> {
    #Predicate<Track> { $0.title.localizedStandardContains(term) }
}
```

### Relationships

```swift
// One-to-Many
@Model class Playlist {
    var name: String
    @Relationship(deleteRule: .cascade, inverse: \Track.playlist)
    var tracks: [Track] = []
}

@Model class Track {
    var title: String
    var playlist: Playlist?
}

// Many-to-Many
@Model class Tag {
    var name: String
    @Relationship(inverse: \Track.tags) var tracks: [Track] = []
}

@Model class Track {
    var tags: [Tag] = []
}

// Self-Referential
@Model class Person {
    var name: String
    @Relationship(inverse: \Person.followers) var following: [Person] = []
    var followers: [Person] = []
}
```

### Background Operations (Swift 6)

```swift
// ModelContext is NOT Sendable - create new context per actor
actor DataImporter {
    let modelContainer: ModelContainer

    func importTracks(_ records: [RawRecord]) throws {
        let context = ModelContext(modelContainer)
        context.autosaveEnabled = false

        for chunk in records.chunked(into: 1000) {
            for record in chunk {
                context.insert(Track(from: record))
            }
            try context.save()
        }
    }
}

// SwiftUI usage
struct ImportView: View {
    @Environment(\.modelContext) private var context

    func importInBackground() {
        let container = context.container
        Task.detached {
            let importer = DataImporter(modelContainer: container)
            try await importer.importTracks(records)
        }
    }
}
```

### CloudKit Integration

```swift
// Container setup
let config = ModelConfiguration(
    cloudKitDatabase: .private("iCloud.com.myapp")
)

// Constraints for CloudKit
// - All properties must have defaults or be optional
// - @Attribute(.unique) not supported with CloudKit
// - Relationships must be optional on both sides
// - Delete rules: only .nullify supported

@Model class CloudTrack {
    var id: UUID = UUID()          // Default required
    var title: String = ""          // Default required
    var playlist: Playlist? = nil   // Must be optional
}
```

### iOS 26+ Features

```swift
// Custom data store
let config = ModelConfiguration(
    dataStore: .custom(MyCustomStore.self)
)

// History tracking
let historyDescriptor = HistoryDescriptor(author: "myApp")
let changes = try context.fetchHistory(historyDescriptor)

// Composite unique constraints
@Model class Track {
    @Attribute(.unique) var compositeKey: String

    init(artist: String, title: String) {
        self.compositeKey = "\(artist)|\(title)"
    }
}
```

## Decision Tree

```
SwiftData task?
├─ New model definition
│   ├─ Needs CloudKit? → All properties optional/defaulted, no .unique
│   ├─ Many-to-many? → Both sides get array + one side gets @Relationship(inverse:)
│   └─ Performance sensitive? → Add static indexes property
│
├─ Migration needed
│   ├─ Adding optional property? → Lightweight (automatic)
│   ├─ Renaming property? → @Attribute(originalName: "oldName")
│   ├─ Changing type? → Two-stage migration (see Deep Patterns)
│   ├─ Complex data transform? → willMigrate with old schema only
│   └─ Deduplication after .unique? → didMigrate stage
│
├─ Performance issue
│   ├─ N+1 queries? → Prefetch relationships
│   ├─ Slow inserts? → Batch with chunked saves, disable autosave
│   ├─ Large dataset? → fetchLimit + fetchOffset
│   └─ Relationship access slow? → Check indexes, prefetch
│
├─ Background work needed
│   ├─ Import/export? → New ModelContext in actor
│   ├─ Heavy fetch? → FetchDescriptor in background context
│   └─ Never pass ModelContext across actors
│
└─ Query in SwiftUI
    ├─ Static filter? → @Query with inline predicate
    ├─ Dynamic filter? → @Query with computed Predicate
    ├─ Sorted? → SortDescriptor in @Query
    └─ Search? → Combine @Query + .searchable
```

## Anti-Patterns

```swift
// ---- Sharing ModelContext across actors ----
// WRONG: ModelContext is NOT Sendable
let context = modelContext
Task.detached {
    let tracks = try context.fetch(descriptor) // Data race
}
// FIX: Create new ModelContext from container
Task.detached {
    let context = ModelContext(container)
    let tracks = try context.fetch(descriptor)
}

// ---- N+1 queries in loops ----
// WRONG: Fetching relationship per item
for track in tracks {
    let artist = track.artist // Lazy fault per iteration
}
// FIX: Prefetch relationships
var descriptor = FetchDescriptor<Track>()
descriptor.relationshipKeyPathsForPrefetching = [\.artist]

// ---- Missing autosave disable for batch ----
// WRONG: Auto-saving after each insert
for record in largeDataset {
    context.insert(Track(from: record))
}
// FIX: Disable autosave, save in chunks
context.autosaveEnabled = false
for chunk in largeDataset.chunked(into: 1000) {
    for record in chunk { context.insert(Track(from: record)) }
    try context.save()
}

// ---- @Attribute(.unique) with CloudKit ----
// WRONG: .unique breaks CloudKit sync
@Attribute(.unique) var id: UUID // Breaks CloudKit
// FIX: Remove .unique, handle deduplication manually

// ---- Accessing willMigrate + didMigrate models ----
// WRONG: Can't access BOTH old and new model in same stage
static var migrationsStages: [MigrationStage] {
    [.custom(fromVersion: V1.self, toVersion: V2.self,
        willMigrate: { context in
            // context has V1 schema - can read old data
        },
        didMigrate: { context in
            // context has V2 schema - can only see new model
            // CANNOT read old field values here
        }
    )]
}
// FIX: Use two-stage migration (see Deep Patterns)

// ---- Forgetting inverse on relationships ----
// WRONG: Missing inverse causes silent data issues
@Relationship var tracks: [Track] = []
// FIX: Always specify inverse
@Relationship(deleteRule: .cascade, inverse: \Track.playlist)
var tracks: [Track] = []
```

## Deep Patterns

### Schema Migration with VersionedSchema

```swift
// Define schema versions
enum SchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version = Schema.Version(1, 0, 0)
    static var models: [any PersistentModel.Type] { [Track.self] }

    @Model class Track {
        var title: String
        var artist: String
        init(title: String, artist: String) {
            self.title = title
            self.artist = artist
        }
    }
}

enum SchemaV2: VersionedSchema {
    static var versionIdentifier: Schema.Version = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] { [Track.self] }

    @Model class Track {
        var title: String
        var artist: String
        var genre: String  // New field
        init(title: String, artist: String, genre: String = "Unknown") {
            self.title = title
            self.artist = artist
            self.genre = genre
        }
    }
}

// Migration plan
enum TrackMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [SchemaV1.self, SchemaV2.self]
    }

    static var stages: [MigrationStage] {
        [migrateV1toV2]
    }

    static let migrateV1toV2 = MigrationStage.custom(
        fromVersion: SchemaV1.self,
        toVersion: SchemaV2.self,
        willMigrate: { context in
            // Access V1 model - set defaults for new fields
            let tracks = try context.fetch(FetchDescriptor<SchemaV1.Track>())
            // Pre-migration logic here
            try context.save()
        },
        didMigrate: { context in
            // Access V2 model - post-migration cleanup
            let tracks = try context.fetch(FetchDescriptor<SchemaV2.Track>())
            for track in tracks {
                if track.genre.isEmpty { track.genre = "Unknown" }
            }
            try context.save()
        }
    )
}

// Apply to container
let container = try ModelContainer(
    for: SchemaV2.Track.self,
    migrationPlan: TrackMigrationPlan.self
)
```

### Two-Stage Migration (Type Changes)

The critical limitation: `willMigrate` sees old schema, `didMigrate` sees new schema. You cannot access both old and new field values simultaneously when changing types.

**Solution**: Introduce intermediate schema V1.1 that adds the new field alongside the old one.

```swift
// V1: durationString is String
// V2: duration is TimeInterval (Double)
// Problem: Can't read String and write Double in one stage

// Step 1: Intermediate schema adds new field
enum SchemaV1_1: VersionedSchema {
    static var versionIdentifier = Schema.Version(1, 1, 0)
    static var models: [any PersistentModel.Type] { [Track.self] }

    @Model class Track {
        var title: String
        var durationString: String    // Old field kept
        var duration: TimeInterval    // New field added
        init(title: String, durationString: String, duration: TimeInterval = 0) {
            self.title = title
            self.durationString = durationString
            self.duration = duration
        }
    }
}

// Step 2: V1 -> V1.1 didMigrate: both fields accessible, copy data
static let stage1 = MigrationStage.custom(
    fromVersion: SchemaV1.self,
    toVersion: SchemaV1_1.self,
    willMigrate: nil,
    didMigrate: { context in
        let tracks = try context.fetch(FetchDescriptor<SchemaV1_1.Track>())
        for track in tracks {
            // Both fields accessible! Convert data
            track.duration = TimeInterval(track.durationString) ?? 0
        }
        try context.save()
    }
)

// Step 3: V1.1 -> V2 removes old field (lightweight migration)
enum SchemaV2: VersionedSchema {
    static var versionIdentifier = Schema.Version(2, 0, 0)
    static var models: [any PersistentModel.Type] { [Track.self] }

    @Model class Track {
        var title: String
        var duration: TimeInterval  // Only new field
        init(title: String, duration: TimeInterval) {
            self.title = title
            self.duration = duration
        }
    }
}
```

### Relationship Migration

```swift
// Migrating from flat string to relationship
// V1: Track has artistName: String
// V2: Track has artist: Artist (relationship)

// willMigrate (V1 schema): collect unique artist names
static let stage = MigrationStage.custom(
    fromVersion: SchemaV1.self,
    toVersion: SchemaV2.self,
    willMigrate: { context in
        let tracks = try context.fetch(FetchDescriptor<SchemaV1.Track>())
        // Prefetch to avoid N+1
        let artistNames = Set(tracks.map(\.artistName))
        // Store in UserDefaults for didMigrate stage
        UserDefaults.standard.set(Array(artistNames), forKey: "migrationArtists")
        try context.save()
    },
    didMigrate: { context in
        let artistNames = UserDefaults.standard.stringArray(forKey: "migrationArtists") ?? []
        for name in artistNames {
            let artist = SchemaV2.Artist(name: name)
            context.insert(artist)
        }
        try context.save()

        // Link tracks to artists
        let tracks = try context.fetch(FetchDescriptor<SchemaV2.Track>())
        let artists = try context.fetch(FetchDescriptor<SchemaV2.Artist>())
        let artistMap = Dictionary(uniqueKeysWithValues: artists.map { ($0.name, $0) })

        for track in tracks {
            if let mappedArtist = artistMap[track.artistNameLegacy ?? ""] {
                track.artist = mappedArtist
            }
        }
        try context.save()
        UserDefaults.standard.removeObject(forKey: "migrationArtists")
    }
)
```

### Property Renaming

```swift
// Use @Attribute(originalName:) for renames (lightweight migration)
@Model class Track {
    @Attribute(originalName: "songTitle") var title: String
    @Attribute(originalName: "length") var duration: TimeInterval
}
```

### Deduplication After Unique Constraint

```swift
// When adding .unique to existing data with duplicates
didMigrate: { context in
    let tracks = try context.fetch(FetchDescriptor<SchemaV2.Track>(
        sortBy: [SortDescriptor(\.createdAt)]
    ))

    var seen = Set<String>()
    for track in tracks {
        if seen.contains(track.uniqueKey) {
            context.delete(track)  // Delete duplicate
        } else {
            seen.insert(track.uniqueKey)
        }
    }
    try context.save()
}
```

### Performance Optimization

```swift
// Prefetch relationships
var descriptor = FetchDescriptor<Track>()
descriptor.relationshipKeyPathsForPrefetching = [\.artist, \.album]

// Fetch count only
let count = try context.fetchCount(FetchDescriptor<Track>())

// Pagination
var descriptor = FetchDescriptor<Track>(sortBy: [SortDescriptor(\.title)])
descriptor.fetchLimit = 50
descriptor.fetchOffset = page * 50

// Batch insert with autosave disabled
func batchInsert(_ items: [RawData]) throws {
    let context = ModelContext(container)
    context.autosaveEnabled = false

    for chunk in items.chunked(into: 1000) {
        for item in chunk {
            context.insert(Track(from: item))
        }
        try context.save()
    }
}
```

### Search + Sort in SwiftUI

```swift
struct TrackSearchView: View {
    @State private var searchText = ""
    @State private var sortOrder = [SortDescriptor(\Track.title)]

    var body: some View {
        TrackList(searchText: searchText, sortOrder: sortOrder)
            .searchable(text: $searchText)
            .toolbar {
                Menu("Sort") {
                    Button("Title") { sortOrder = [SortDescriptor(\.title)] }
                    Button("Artist") { sortOrder = [SortDescriptor(\.artist)] }
                }
            }
    }
}

struct TrackList: View {
    @Query private var tracks: [Track]

    init(searchText: String, sortOrder: [SortDescriptor<Track>]) {
        _tracks = Query(
            filter: searchText.isEmpty ? nil :
                #Predicate<Track> { $0.title.localizedStandardContains(searchText) },
            sort: sortOrder
        )
    }

    var body: some View {
        List(tracks) { track in Text(track.title) }
    }
}
```

### Testing Setup

```swift
@Test func trackCreation() throws {
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try ModelContainer(
        for: Track.self,
        configurations: config
    )
    let context = ModelContext(container)

    let track = Track(title: "Test", artist: "Artist", duration: 180)
    context.insert(track)
    try context.save()

    let fetched = try context.fetch(FetchDescriptor<Track>())
    #expect(fetched.count == 1)
    #expect(fetched.first?.title == "Test")
}

// Migration testing - MUST test on real device
@Test func migrationV1toV2() throws {
    // 1. Create V1 store with test data
    let v1Config = ModelConfiguration(isStoredInMemoryOnly: true)
    let v1Container = try ModelContainer(
        for: SchemaV1.Track.self,
        configurations: v1Config
    )
    let v1Context = ModelContext(v1Container)
    v1Context.insert(SchemaV1.Track(title: "Song", artist: "Artist"))
    try v1Context.save()

    // 2. Open with V2 + migration plan
    let v2Container = try ModelContainer(
        for: SchemaV2.Track.self,
        migrationPlan: TrackMigrationPlan.self,
        configurations: v1Config
    )
    let v2Context = ModelContext(v2Container)

    // 3. Verify
    let tracks = try v2Context.fetch(FetchDescriptor<SchemaV2.Track>())
    #expect(tracks.first?.genre == "Unknown")
}
```

## Diagnostics

### Migration Failures

```
Migration crashed?
├─ "Cannot migrate store in-place"
│   └─ Schema change too complex for lightweight migration
│       → Need custom MigrationStage
│
├─ "Persistent store is not reachable"
│   └─ Database file locked or corrupt
│       → Delete store file for dev, restore from backup for production
│
├─ willMigrate crash
│   ├─ Fetching new-schema model in willMigrate? → Only V(old) models accessible
│   ├─ Relationship fault during migration? → Prefetch relationships
│   └─ Memory pressure with large dataset? → Batch fetch with fetchLimit
│
├─ didMigrate crash
│   ├─ Accessing old field values? → Old fields gone, use two-stage pattern
│   └─ Unique constraint violation? → Deduplicate first
│
├─ Data missing after migration
│   ├─ Type change without two-stage? → Data lost, use intermediate schema
│   ├─ Relationship not mapped? → Check inverse specification
│   └─ Default values wrong? → Check init defaults in new schema
│
└─ Migration works in sim, fails on device
    └─ ALWAYS test migrations on real device with real data
        → Simulator may not catch all schema edge cases
```

### Post-Migration Verification Checklist

```swift
func verifyMigration(context: ModelContext) throws {
    // 1. Record count preserved
    let count = try context.fetchCount(FetchDescriptor<Track>())
    assert(count == expectedCount, "Record count mismatch")

    // 2. No nil values where unexpected
    let tracks = try context.fetch(FetchDescriptor<Track>())
    for track in tracks {
        assert(!track.title.isEmpty, "Empty title found")
    }

    // 3. Relationships intact
    let playlists = try context.fetch(FetchDescriptor<Playlist>())
    for playlist in playlists {
        assert(!playlist.tracks.isEmpty || playlist.name == "Empty",
               "Playlist lost tracks")
    }

    // 4. New fields populated
    let withGenre = tracks.filter { !$0.genre.isEmpty }
    assert(withGenre.count == tracks.count, "Genre not populated")
}
```

### Common Error-to-Fix Table

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `NSInternalInconsistencyException` | Schema mismatch with store | Delete dev store or add migration |
| `EXC_BAD_ACCESS` in migration | Accessing wrong schema version model | Check willMigrate vs didMigrate model access |
| "Duplicate unique values" | Adding .unique to existing duplicates | Deduplicate in didMigrate before constraint |
| Relationship data lost | Missing inverse on @Relationship | Always specify inverse parameter |
| "Cannot migrate in-place" | Non-lightweight change without plan | Add VersionedSchema + MigrationStage |
| Crash only on device | Simulator doesn't catch all issues | Always test migration on real device |
| N+1 during migration | Relationship faulting in loop | Use relationshipKeyPathsForPrefetching |

## Related

- `ax-core-data` - Core Data patterns, Core Data to SwiftData bridging
- `ax-grdb` - When SwiftData performance is insufficient, drop to SQL
- `ax-cloud-storage` - CloudKit sync setup and conflict resolution
- `ax-file-storage` - Choosing storage location for SwiftData store file
- `ax-concurrency` - Background ModelContext usage, actor patterns
