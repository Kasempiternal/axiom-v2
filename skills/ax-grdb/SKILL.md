---
name: ax-grdb
description: GRDB direct SQLite, DatabaseQueue/Pool, raw SQL, ValueObservation, DatabaseMigrator, SQLiteData Point-Free @Table models, CTE, FTS5, CloudKit SyncEngine, database migration safety, Realm-to-SwiftData migration
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-grdb", "axiom-sqlitedata", "axiom-sqlitedata-ref", "axiom-sqlitedata-migration", "axiom-realm-migration-ref", "axiom-database-migration"]
---

# GRDB & SQLite

## Quick Patterns

### GRDB Setup

```swift
import GRDB

// DatabaseQueue (single connection, safe for all use cases)
let dbQueue = try DatabaseQueue(path: dbPath)

// DatabasePool (concurrent reads, single writer - better performance)
let dbPool = try DatabasePool(path: dbPath)

// In-memory for testing
let dbQueue = try DatabaseQueue()
```

### GRDB Model Definition

```swift
struct Track: Codable, FetchableRecord, PersistableRecord {
    var id: Int64?
    var title: String
    var artist: String
    var duration: TimeInterval
    var playCount: Int

    // Table name (default: "track")
    static let databaseTableName = "tracks"

    // Auto-increment
    mutating func didInsert(_ inserted: InsertionSuccess) {
        id = inserted.rowID
    }
}
```

### GRDB Raw SQL Queries

```swift
// Read
let tracks = try dbQueue.read { db in
    try Track.fetchAll(db, sql: """
        SELECT * FROM tracks
        WHERE artist = ? AND duration > ?
        ORDER BY title
        LIMIT 50
        """, arguments: ["Artist", 180])
}

// Single row
let track = try dbQueue.read { db in
    try Track.fetchOne(db, sql: "SELECT * FROM tracks WHERE id = ?", arguments: [42])
}

// Aggregate
let count = try dbQueue.read { db in
    try Int.fetchOne(db, sql: "SELECT COUNT(*) FROM tracks WHERE playCount > 0")!
}

// Write
try dbQueue.write { db in
    var track = Track(id: nil, title: "Song", artist: "Artist", duration: 210, playCount: 0)
    try track.insert(db)
}

// Update
try dbQueue.write { db in
    try db.execute(sql: "UPDATE tracks SET playCount = playCount + 1 WHERE id = ?", arguments: [42])
}

// Delete
try dbQueue.write { db in
    try db.execute(sql: "DELETE FROM tracks WHERE playCount = 0")
}
```

### GRDB Type-Safe Query Interface

```swift
let tracks = try dbQueue.read { db in
    try Track
        .filter(Column("artist") == "Artist")
        .filter(Column("duration") > 180)
        .order(Column("title"))
        .limit(50)
        .fetchAll(db)
}

// Joins
struct TrackInfo: Decodable, FetchableRecord {
    var trackTitle: String
    var artistName: String
}

let infos = try dbQueue.read { db in
    try Track
        .joining(required: Track.artist)
        .select(
            Column("title").forKey("trackTitle"),
            Artist.Columns.name.forKey("artistName")
        )
        .asRequest(of: TrackInfo.self)
        .fetchAll(db)
}
```

### GRDB ValueObservation (Reactive Queries)

```swift
// Observe query changes
let observation = ValueObservation.tracking { db in
    try Track
        .filter(Column("playCount") > 0)
        .order(Column("title"))
        .fetchAll(db)
}

// SwiftUI
struct TrackListView: View {
    @Query(TrackRequest()) var tracks: [Track]
}

// Combine
let cancellable = observation.publisher(in: dbQueue)
    .sink(
        receiveCompletion: { _ in },
        receiveValue: { tracks in
            self.tracks = tracks
        }
    )
```

### GRDB DatabaseMigrator

```swift
var migrator = DatabaseMigrator()

migrator.registerMigration("v1") { db in
    try db.create(table: "tracks") { t in
        t.autoIncrementedPrimaryKey("id")
        t.column("title", .text).notNull()
        t.column("artist", .text).notNull()
        t.column("duration", .double).notNull()
        t.column("playCount", .integer).notNull().defaults(to: 0)
    }
}

migrator.registerMigration("v2-add-genre") { db in
    try db.alter(table: "tracks") { t in
        t.add(column: "genre", .text).defaults(to: "Unknown")
    }
    try db.create(index: "idx_tracks_genre", on: "tracks", columns: ["genre"])
}

// Apply
try migrator.migrate(dbQueue)

// Erase and re-create for dev
#if DEBUG
migrator.eraseDatabaseOnSchemaChange = true
#endif
```

---

### SQLiteData (Point-Free) Setup

```swift
import SQLiteData
import Dependencies

// Define table
@Table
struct Track {
    @Column(primaryKey: true) var id = UUID()
    @Column var title = ""
    @Column var artist = ""
    @Column var duration: TimeInterval = 0
    @Column var playCount = 0

    @Ephemeral var isPlaying = false  // Not persisted
}

// Setup with Dependencies
extension DatabaseClient: DependencyKey {
    static let liveValue = DatabaseClient(
        setup: { db in
            try #sql("""
                CREATE TABLE IF NOT EXISTS "Track" (
                    "id" TEXT PRIMARY KEY NOT NULL,
                    "title" TEXT NOT NULL DEFAULT '',
                    "artist" TEXT NOT NULL DEFAULT '',
                    "duration" REAL NOT NULL DEFAULT 0,
                    "playCount" INTEGER NOT NULL DEFAULT 0
                )
            """).execute(db)
        }
    )
}
```

### SQLiteData Query Patterns

```swift
// Fetch all
@FetchAll var tracks = Track.order(by: \.title)

// Fetch one
@FetchOne var currentTrack = Track.where(\.id, equals: trackID)

// Filter and sort
@FetchAll var recentTracks = Track
    .where(\.playCount, .greaterThan, 0)
    .order(by: \.playCount, .desc)
    .limit(20)

// Lifecycle-aware (auto-observes changes)
struct TrackListView: View {
    @FetchAll var tracks = Track.order(by: \.title)

    var body: some View {
        List(tracks) { track in Text(track.title) }
    }
}
```

### SQLiteData CRUD

```swift
@Dependency(\.database) var database

// Insert
try database.insert(Track(title: "Song", artist: "Artist"))

// Upsert (INSERT ON CONFLICT DO UPDATE)
try database.upsert(
    Track(id: existingID, title: "Updated", artist: "Artist"),
    onConflict: .doUpdate(set: \.title, \.artist)
)

// Batch upsert
try database.upsert(
    contentsOf: tracks,
    onConflict: .doUpdate(set: \.title, \.playCount)
)

// Update
try database.update(Track.where(\.id, equals: id)) {
    $0.playCount += 1
}

// Delete
try database.delete(Track.where(\.playCount, equals: 0))
```

### SQLiteData Advanced: @Selection, CTE, FTS5

```swift
// @Selection - column group projections
@Selection
struct TrackSummary {
    var title: String
    var artist: String
}
// Usage: Track.select(TrackSummary.self).fetchAll(db)

// CTE (Common Table Expressions)
let topArtists = Track
    .select(\.artist, aggregate: .count(\.id))
    .group(by: \.artist)
    .having(.count(\.id), .greaterThan, 5)

let cte = CommonTableExpression("TopArtists", topArtists)
let result = Track
    .with(cte)
    .joining(cte, on: \.artist)
    .fetchAll(db)

// Recursive CTE (hierarchies)
let hierarchy = CommonTableExpression.recursive("CategoryTree") { cte in
    Category.where(\.parentID, .isNull)
        .union(all:
            Category.joining(cte, on: \.parentID, equals: \.id)
        )
}

// FTS5 Full-Text Search
try #sql("""
    CREATE VIRTUAL TABLE "TrackSearch" USING fts5(title, artist, content="Track")
""").execute(db)

let results = TrackSearch
    .match("love OR heart")
    .order(by: .rank)
    .fetchAll(db)
```

### SQLiteData CloudKit SyncEngine Integration

```swift
import CloudKit

class SyncManager {
    let syncEngine: CKSyncEngine

    // Track sync metadata alongside app data
    @Table
    struct SyncMetadata {
        @Column(primaryKey: true) var recordName: String = ""
        @Column var zoneName: String = ""
        @Column var changeTag: String = ""
        @Column var lastModified: Date = .now
    }

    func handleFetchedRecords(_ records: [CKRecord]) throws {
        for record in records {
            let track = Track(from: record)
            try database.upsert(track, onConflict: .doUpdate(set: \.title, \.artist))

            try database.upsert(SyncMetadata(
                recordName: record.recordID.recordName,
                zoneName: record.recordID.zoneID.zoneName,
                changeTag: record.recordChangeTag ?? "",
                lastModified: record.modificationDate ?? .now
            ))
        }
    }
}
```

## Decision Tree

```
SQLite-level task?

├─ Choosing between GRDB vs SQLiteData
│   ├─ Need raw SQL control? → GRDB
│   ├─ Using TCA/Dependencies? → SQLiteData (Point-Free ecosystem)
│   ├─ Need CloudKit sharing? → SQLiteData + CKSyncEngine
│   ├─ Need FTS5, CTEs, advanced SQL? → SQLiteData (better abstractions)
│   └─ Existing GRDB codebase? → Stay with GRDB
│
├─ Migration / schema change
│   ├─ Adding column? → ALTER TABLE ADD COLUMN with DEFAULT
│   ├─ Renaming column? → ALTER TABLE RENAME COLUMN (SQLite 3.25+)
│   ├─ Changing type? → Create new table, copy, rename
│   ├─ Adding index? → CREATE INDEX IF NOT EXISTS
│   └─ Complex refactor? → Multi-step with temp tables
│
├─ Performance issue
│   ├─ Slow reads? → Check indexes with EXPLAIN QUERY PLAN
│   ├─ Slow writes? → Batch in transaction, disable journal briefly
│   ├─ Large import? → Prepared statements + chunked transactions
│   └─ N+1 joins? → Single query with JOIN
│
├─ Reactive queries
│   ├─ GRDB → ValueObservation
│   └─ SQLiteData → @FetchAll / @FetchOne (lifecycle-aware)
│
└─ Migrating from another database
    ├─ From SwiftData? → See migration patterns below
    ├─ From Realm? → See Realm migration section
    └─ From Core Data? → Export to SQL, import
```

## Anti-Patterns

```swift
// ---- GRDB: Read in write block ----
// WRONG: Using write for read-only operations
try dbQueue.write { db in
    let tracks = try Track.fetchAll(db)  // Blocks writers
}
// FIX: Use read for queries
try dbQueue.read { db in
    let tracks = try Track.fetchAll(db)
}

// ---- Missing indexes ----
// WRONG: Filtering without index
try Track.filter(Column("artist") == "Artist").fetchAll(db)
// When tracks table has 100K+ rows, this is a full table scan
// FIX: Create index
try db.create(index: "idx_tracks_artist", on: "tracks", columns: ["artist"])

// ---- Modifying shipped migrations ----
// WRONG: Changing a migration that already shipped
migrator.registerMigration("v1") { db in
    try db.create(table: "tracks") { t in
        t.column("genre", .text)  // Added after ship!
    }
}
// FIX: Add new migration
migrator.registerMigration("v2-add-genre") { db in
    try db.alter(table: "tracks") { t in
        t.add(column: "genre", .text).defaults(to: "Unknown")
    }
}

// ---- DROP TABLE in production ----
// NEVER drop tables in migration - data loss is permanent
// FIX: Rename, archive, or soft-delete

// ---- SQLiteData: Forgetting @Ephemeral ----
// WRONG: Non-persisted property without @Ephemeral
@Table struct Track {
    var isSelected = false  // Creates column!
}
// FIX:
@Table struct Track {
    @Ephemeral var isSelected = false  // Not persisted
}

// ---- Non-idempotent migrations ----
// WRONG: Migration crashes if run twice
migrator.registerMigration("v3") { db in
    try db.create(table: "artists")  // Fails if exists
}
// FIX: Use IF NOT EXISTS
migrator.registerMigration("v3") { db in
    try db.create(table: "artists", ifNotExists: true) { t in ... }
}
```

## Deep Patterns

### Database Migration Safety Rules

**NEVER** in a shipped migration:
- DROP TABLE (data loss)
- Modify existing migration code (breaks installed base)
- Remove columns without backup (SQLite requires table rebuild)
- ALTER COLUMN type (SQLite doesn't support it)

**ALWAYS:**
- Additive changes only (ADD COLUMN, CREATE TABLE, CREATE INDEX)
- Idempotent (IF NOT EXISTS, IF NOT EXISTS)
- Transactional (all or nothing)
- Tested on real data (not just empty database)

```swift
// Safe column addition
migrator.registerMigration("v4-add-rating") { db in
    try db.alter(table: "tracks") { t in
        t.add(column: "rating", .integer).defaults(to: 0)
    }
}

// Safe type change (new table approach)
migrator.registerMigration("v5-duration-to-double") { db in
    try db.alter(table: "tracks") { t in
        t.add(column: "durationSeconds", .double).defaults(to: 0)
    }
    try db.execute(sql: """
        UPDATE tracks SET durationSeconds = CAST(duration AS REAL)
    """)
    // Keep old column for safety, remove in future version
}

// Safe foreign key addition
migrator.registerMigration("v6-add-artist-fk") { db in
    try db.create(table: "artists", ifNotExists: true) { t in
        t.autoIncrementedPrimaryKey("id")
        t.column("name", .text).notNull().unique()
    }
    try db.alter(table: "tracks") { t in
        t.add(column: "artistId", .integer)
            .references("artists", column: "id", onDelete: .setNull)
    }
}
```

### GRDB Query Performance

```swift
// EXPLAIN QUERY PLAN
try dbQueue.read { db in
    let plan = try String.fetchAll(db, sql: """
        EXPLAIN QUERY PLAN
        SELECT * FROM tracks WHERE artist = 'Artist' ORDER BY title
    """)
    print(plan)  // Check for SCAN vs SEARCH
}

// Prepared statements for batch operations
try dbQueue.write { db in
    let stmt = try db.makeStatement(sql: """
        INSERT INTO tracks (title, artist, duration) VALUES (?, ?, ?)
    """)

    for item in items {
        try stmt.execute(arguments: [item.title, item.artist, item.duration])
    }
}

// Batch with transaction
try dbQueue.write { db in
    for chunk in items.chunked(into: 1000) {
        try db.inTransaction {
            for item in chunk {
                try Track(from: item).insert(db)
            }
            return .commit
        }
    }
}
```

### SQLiteData Batch Upsert Performance Tiers

```swift
// Tier 1: Simple (< 100 rows) - individual upserts
for track in tracks {
    try database.upsert(track, onConflict: .doUpdate(set: \.title))
}

// Tier 2: Moderate (100-10K rows) - batch upsert
try database.upsert(contentsOf: tracks, onConflict: .doUpdate(set: \.title))

// Tier 3: Large (10K+ rows) - chunked with progress
for chunk in tracks.chunked(into: 5000) {
    try database.upsert(contentsOf: chunk, onConflict: .doUpdate(set: \.title))
    await reportProgress()
}
```

### SwiftData to SQLiteData Migration

**When to migrate:** Performance requirements exceed SwiftData (5-40x improvement possible), need CloudKit sharing (SwiftData can't), need advanced SQL (FTS5, CTEs, window functions).

```swift
// Pattern equivalents
// SwiftData @Model → SQLiteData @Table
// SwiftData @Query → SQLiteData @FetchAll
// SwiftData ModelContext → SQLiteData DatabaseClient
// SwiftData @Relationship → SQLiteData foreign keys

// Data migration
func migrateFromSwiftData() throws {
    let swiftDataContainer = try ModelContainer(for: OldTrack.self)
    let context = ModelContext(swiftDataContainer)
    let oldTracks = try context.fetch(FetchDescriptor<OldTrack>())

    for oldTrack in oldTracks {
        try database.insert(Track(
            id: oldTrack.id,
            title: oldTrack.title,
            artist: oldTrack.artist
        ))
    }
}
```

### Realm to SwiftData Migration

**Critical context**: Realm Sync was deprecated. Migration is necessary for apps using Realm with cloud sync.

**4-Phase Strategy:**
1. **Audit** - Map all Realm models to SwiftData equivalents
2. **Build** - Create SwiftData models, set up CloudKit
3. **Migrate** - Export Realm data, import to SwiftData
4. **Verify** - Data integrity checks, remove Realm dependency

```swift
// Realm → SwiftData model mapping
// Realm: class Track: Object { @Persisted var title: String }
// SwiftData: @Model class Track { var title: String }

// Realm: LinkingObjects → SwiftData: @Relationship(inverse:)
// Realm: List<T> → SwiftData: [T] with @Relationship
// Realm: @Persisted(indexed: true) → SwiftData: static let indexes

// Threading model conversion
// Realm: DispatchQueue + realm.objects() → SwiftData: actor + ModelContext
// Realm: .freeze() for thread-safe → SwiftData: not needed (ModelContext per actor)

// Data export
func exportFromRealm() throws -> [TrackDTO] {
    let realm = try Realm()
    return realm.objects(RealmTrack.self).map { realmTrack in
        TrackDTO(
            id: realmTrack.id,
            title: realmTrack.title,
            artist: realmTrack.artist
        )
    }
}

// Import to SwiftData
func importToSwiftData(_ dtos: [TrackDTO]) throws {
    let context = ModelContext(container)
    context.autosaveEnabled = false
    for chunk in dtos.chunked(into: 1000) {
        for dto in chunk {
            context.insert(Track(from: dto))
        }
        try context.save()
    }
}
```

### Common Migration Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "table already exists" | Missing IF NOT EXISTS | Use `CREATE TABLE IF NOT EXISTS` |
| "duplicate column name" | Column already added | Use `IF NOT EXISTS` or check schema first |
| "no such column" | Migration order wrong | Ensure migrations run sequentially |
| "UNIQUE constraint failed" | Duplicate data on new unique | Clean duplicates before adding constraint |
| "foreign key mismatch" | Referenced table missing | Create parent table in same migration |
| "database is locked" | Concurrent write access | Use DatabasePool or serialize writes |

## Diagnostics

```
SQLite issue?

├─ Slow query
│   ├─ Run EXPLAIN QUERY PLAN → look for "SCAN" (bad) vs "SEARCH" (good)
│   ├─ Missing index? → CREATE INDEX on filtered/sorted columns
│   └─ Too many rows? → Add LIMIT, use pagination
│
├─ Database locked
│   ├─ Using DatabaseQueue? → Expected for concurrent writes
│   ├─ Long transaction? → Break into smaller transactions
│   └─ Background thread holding lock? → Check transaction boundaries
│
├─ Migration failed
│   ├─ "table already exists" → Add IF NOT EXISTS
│   ├─ "no such column" → Check migration order
│   └─ Data corruption? → Restore from backup, check write patterns
│
├─ ValueObservation not updating (GRDB)
│   ├─ Writing through raw SQL? → Use record.save(db) instead
│   ├─ Different database connection? → Use same DatabaseQueue
│   └─ Filter excludes changes? → Check observation query
│
└─ @FetchAll not updating (SQLiteData)
    ├─ Writing outside DatabaseClient? → All writes through client
    ├─ Using different table name? → Check @Table name matches
    └─ Complex join? → Ensure all involved tables trigger observation
```

## Related

- `ax-swiftdata` - When SwiftData abstraction is preferred over raw SQL
- `ax-core-data` - Legacy Core Data patterns, migration from Core Data
- `ax-cloud-storage` - CloudKit SyncEngine integration with SQLiteData
- `ax-file-storage` - Database file location and protection
- `ax-concurrency` - Background database access patterns
