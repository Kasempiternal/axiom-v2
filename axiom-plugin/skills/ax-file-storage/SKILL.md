---
name: ax-file-storage
description: iOS file system directories, FileProtectionType, backup exclusion, storage capacity, Codable encoding/decoding, purge behavior, file storage decisions
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-storage", "axiom-storage-diag", "axiom-storage-management-ref", "axiom-file-protection-ref", "axiom-codable"]
---

# File Storage

## Quick Patterns

### Storage Location Decision

```
What are you storing?
├─ User-created content (photos, notes, recordings)
│   └─ Documents/ → backed up, never purged, visible in Files app
│
├─ App-generated data that CAN'T be recreated
│   └─ Application Support/ → backed up, never purged, hidden from user
│
├─ Downloaded/cached content that CAN be re-downloaded
│   └─ Caches/ → NOT backed up, purged under storage pressure
│
├─ Temporary files (in-progress operations)
│   └─ tmp/ → NOT backed up, purged aggressively on reboot
│
├─ Structured data (database)
│   └─ Application Support/ with appropriate protection level
│
└─ Small preferences/settings
    └─ UserDefaults or NSUbiquitousKeyValueStore (cloud)
```

### Directory Quick Reference

| Directory | Backed Up | Purged | User Visible | Use For |
|-----------|-----------|--------|--------------|---------|
| `Documents/` | Yes | Never | Yes (Files) | User content |
| `Application Support/` | Yes | Never | No | App data, databases |
| `Caches/` | No | Under pressure | No | Re-downloadable content |
| `tmp/` | No | Aggressively | No | Temporary operations |

### Getting Directory URLs

```swift
// Documents
let documentsURL = FileManager.default.urls(
    for: .documentDirectory, in: .userDomainMask
)[0]

// Application Support
let appSupportURL = FileManager.default.urls(
    for: .applicationSupportDirectory, in: .userDomainMask
)[0]
try FileManager.default.createDirectory(
    at: appSupportURL, withIntermediateDirectories: true
)

// Caches
let cachesURL = FileManager.default.urls(
    for: .cachesDirectory, in: .userDomainMask
)[0]

// Temporary
let tmpURL = FileManager.default.temporaryDirectory
```

### File Protection Levels

| Level | Accessible When | Use For |
|-------|----------------|---------|
| `.complete` | Device unlocked only | Sensitive user data |
| `.completeUnlessOpen` | After first open until lock | Files opened before lock |
| `.completeUntilFirstUserAuthentication` | After first unlock | Most app data, background tasks |
| `.none` | Always (even before unlock) | System resources, non-sensitive |

```swift
// Set protection on write
try data.write(to: url, options: .completeFileProtectionUntilFirstUserAuthentication)

// Set protection on existing file
try FileManager.default.setAttributes(
    [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
    ofItemAtPath: url.path
)

// Check protection level
let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
let protection = attrs[.protectionKey] as? FileProtectionType
```

### Backup Exclusion

```swift
// Mark as excluded from backup (for re-downloadable content)
var resourceValues = URLResourceValues()
resourceValues.isExcludedFromBackup = true
try url.setResourceValues(resourceValues)

// Check exclusion
let values = try url.resourceValues(forKeys: [.isExcludedFromBackupKey])
let excluded = values.isExcludedFromBackup ?? false
```

### Storage Capacity Check

```swift
// Check available space
let values = try URL(fileURLWithPath: NSHomeDirectory()).resourceValues(forKeys: [
    .volumeAvailableCapacityForImportantUsageKey,
    .volumeAvailableCapacityForOpportunisticUsageKey
])

// Important usage: space for user-initiated operations
let importantCapacity = values.volumeAvailableCapacityForImportantUsage ?? 0

// Opportunistic: space for prefetching, caching
let opportunisticCapacity = values.volumeAvailableCapacityForOpportunisticUsage ?? 0

// Decision
if importantCapacity < 100_000_000 {  // < 100 MB
    // Warn user, defer non-critical writes
}
if opportunisticCapacity < 50_000_000 {  // < 50 MB
    // Skip cache prefetching, cleanup old caches
}
```

### Codable Encoding/Decoding

```swift
// Basic struct
struct Track: Codable {
    var id: UUID
    var title: String
    var artist: String
    var duration: TimeInterval
}

// JSON encode/decode
let encoder = JSONEncoder()
encoder.dateEncodingStrategy = .iso8601
encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
let data = try encoder.encode(track)

let decoder = JSONDecoder()
decoder.dateDecodingStrategy = .iso8601
let track = try decoder.decode(Track.self, from: data)

// Save to file
try data.write(to: fileURL, options: .completeFileProtectionUntilFirstUserAuthentication)

// Load from file
let loadedData = try Data(contentsOf: fileURL)
let loadedTrack = try decoder.decode(Track.self, from: loadedData)
```

### CodingKeys Customization

```swift
struct Track: Codable {
    var id: UUID
    var trackTitle: String  // Maps to "title" in JSON
    var isPlaying: Bool     // Excluded from encoding

    enum CodingKeys: String, CodingKey {
        case id
        case trackTitle = "title"  // Rename
        // isPlaying excluded by omission
    }
}

// Snake case conversion (automatic)
let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase
// "play_count" → playCount

let encoder = JSONEncoder()
encoder.keyEncodingStrategy = .convertToSnakeCase
// playCount → "play_count"
```

### Date Handling Strategies

```swift
// ISO 8601 (recommended for APIs)
decoder.dateDecodingStrategy = .iso8601

// Unix timestamp (seconds since 1970)
decoder.dateDecodingStrategy = .secondsSince1970

// Milliseconds (Java/JavaScript style)
decoder.dateDecodingStrategy = .millisecondsSince1970

// Custom format
decoder.dateDecodingStrategy = .formatted({
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.locale = Locale(identifier: "en_US_POSIX")
    return formatter
}())

// Multiple formats (custom)
decoder.dateDecodingStrategy = .custom { decoder in
    let container = try decoder.singleValueContainer()
    let string = try container.decode(String.self)

    let iso = ISO8601DateFormatter()
    if let date = iso.date(from: string) { return date }

    let fallback = DateFormatter()
    fallback.dateFormat = "yyyy-MM-dd"
    if let date = fallback.date(from: string) { return date }

    throw DecodingError.dataCorruptedError(
        in: container, debugDescription: "Cannot decode date: \(string)"
    )
}
```

## Decision Tree

```
File storage task?

├─ Choosing where to store
│   ├─ User created it? → Documents/
│   ├─ App needs it, can't recreate? → Application Support/
│   ├─ Can re-download? → Caches/ + isExcludedFromBackup
│   ├─ Temporary operation? → tmp/
│   └─ Small settings? → UserDefaults
│
├─ Choosing protection level
│   ├─ Sensitive data (health, financial)? → .complete
│   ├─ Need background access? → .completeUntilFirstUserAuthentication
│   ├─ File opened before lock? → .completeUnlessOpen
│   └─ Non-sensitive system resource? → .none
│
├─ File vs Keychain decision
│   ├─ Passwords, tokens, keys → Keychain (always)
│   ├─ Large encrypted data → File + .complete protection
│   ├─ User documents → File + .complete or .completeUntilFirstAuth
│   └─ Certificates → Keychain
│
├─ Backup bloat (app > 500 MB)
│   ├─ Downloaded media in Documents? → Move to App Support + exclude
│   ├─ Caches not excluded? → Set isExcludedFromBackup
│   └─ Audit: which directories are large?
│
├─ Codable task
│   ├─ API JSON? → JSONDecoder with appropriate strategies
│   ├─ Local persistence? → JSONEncoder to file
│   ├─ Snake case keys? → .convertFromSnakeCase strategy
│   ├─ Multiple date formats? → .custom strategy
│   └─ Nested/complex JSON? → Manual init(from:)/encode(to:)
│
└─ Files disappearing
    ├─ In tmp/? → Expected (purged on reboot)
    ├─ In Caches/? → Expected (storage pressure)
    ├─ Protection .complete + device locked? → Wait for unlock
    └─ In Documents/App Support? → Check if user deleted app
```

## Anti-Patterns

```swift
// ---- Storing persistent data in tmp/ ----
// WRONG: tmp/ purged aggressively
let url = FileManager.default.temporaryDirectory.appending(path: "data.json")
try data.write(to: url)  // WILL BE DELETED
// FIX: Use Caches/ or Application Support/
let url = cachesURL.appending(path: "data.json")

// ---- Downloaded content in Documents/ without exclusion ----
// WRONG: Bloats user's iCloud backup
let podcastURL = documentsURL.appending(path: "episode.mp3")
try data.write(to: podcastURL)
// FIX: Application Support/ + exclude from backup
let podcastURL = appSupportURL.appending(path: "Podcasts/episode.mp3")
try data.write(to: podcastURL)
var rv = URLResourceValues()
rv.isExcludedFromBackup = true
try podcastURL.setResourceValues(rv)

// ---- .complete protection for background-accessed files ----
// WRONG: Background tasks can't access when locked
try data.write(to: url, options: .completeFileProtection)
// Background fetch: "permission denied"!
// FIX: Use .completeUntilFirstUserAuthentication
try data.write(to: url, options: .completeFileProtectionUntilFirstUserAuthentication)

// ---- Not handling cache misses ----
// WRONG: Assuming cache file exists
let data = try Data(contentsOf: cacheURL)  // Crash if purged!
// FIX: Handle gracefully, re-download
if FileManager.default.fileExists(atPath: cacheURL.path),
   let data = try? Data(contentsOf: cacheURL) {
    return data
}
return try await redownload(from: sourceURL)

// ---- Codable: Force unwrapping decode ----
// WRONG: Crash on malformed data
let track = try! JSONDecoder().decode(Track.self, from: data)
// FIX: Handle errors
do {
    let track = try JSONDecoder().decode(Track.self, from: data)
} catch let DecodingError.keyNotFound(key, context) {
    print("Missing key: \(key.stringValue) at \(context.codingPath)")
} catch let DecodingError.typeMismatch(type, context) {
    print("Type mismatch: expected \(type) at \(context.codingPath)")
}
```

## Deep Patterns

### Purge Priority Hierarchy

```
System purges in this order under storage pressure:
1. tmp/        → First to go, purged aggressively
2. Caches/     → Purged when system needs space
3. isPurgeable  → Files marked purgeable by app
4. Documents/   → NEVER purged by system
5. App Support/ → NEVER purged by system
```

### Progressive Cache Cleanup

```swift
func cleanupCaches(targetFreeMB: Int) {
    let currentFree = availableCapacityMB()
    guard currentFree < targetFreeMB else { return }

    // Phase 1: Delete expired caches
    deleteExpiredCaches()
    guard availableCapacityMB() < targetFreeMB else { return }

    // Phase 2: Delete oldest caches
    deleteOldestCaches(keepCount: 100)
    guard availableCapacityMB() < targetFreeMB else { return }

    // Phase 3: Delete all caches
    deleteAllCaches()
}
```

### File Size Calculation

```swift
func directorySize(url: URL) -> Int64 {
    let resourceKeys: Set<URLResourceKey> = [.fileSizeKey, .isDirectoryKey]
    guard let enumerator = FileManager.default.enumerator(
        at: url, includingPropertiesForKeys: Array(resourceKeys)
    ) else { return 0 }

    var totalSize: Int64 = 0
    for case let fileURL as URL in enumerator {
        guard let values = try? fileURL.resourceValues(forKeys: resourceKeys),
              values.isDirectory != true,
              let size = values.fileSize else { continue }
        totalSize += Int64(size)
    }
    return totalSize
}
```

### Database File Protection

```swift
// SwiftData/Core Data databases need .completeUntilFirstUserAuthentication
// for background access (sync, fetch, etc.)

// Set on the directory containing the database
let dbDirectory = appSupportURL.appending(path: "Database")
try FileManager.default.setAttributes(
    [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
    ofItemAtPath: dbDirectory.path
)

// Or set default protection in entitlements:
// NSFileProtectionCompleteUntilFirstUserAuthentication
```

### Manual Codable Implementation

```swift
struct APIResponse: Codable {
    var tracks: [Track]
    var totalCount: Int
    var nextPage: URL?

    // Nested JSON structure
    enum CodingKeys: String, CodingKey {
        case data, meta
    }
    enum DataKeys: String, CodingKey {
        case tracks
    }
    enum MetaKeys: String, CodingKey {
        case totalCount = "total_count"
        case nextPage = "next_page"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let data = try container.nestedContainer(keyedBy: DataKeys.self, forKey: .data)
        tracks = try data.decode([Track].self, forKey: .tracks)

        let meta = try container.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta)
        totalCount = try meta.decode(Int.self, forKey: .totalCount)
        nextPage = try meta.decodeIfPresent(URL.self, forKey: .nextPage)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        var data = container.nestedContainer(keyedBy: DataKeys.self, forKey: .data)
        try data.encode(tracks, forKey: .tracks)

        var meta = container.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta)
        try meta.encode(totalCount, forKey: .totalCount)
        try meta.encodeIfPresent(nextPage, forKey: .nextPage)
    }
}
```

### Bridge Types for API Mismatches

```swift
// When API sends numbers as strings
@propertyWrapper
struct StringBacked<Value: LosslessStringConvertible>: Codable {
    var wrappedValue: Value

    init(wrappedValue: Value) {
        self.wrappedValue = wrappedValue
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let string = try container.decode(String.self)
        guard let value = Value(string) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Cannot convert '\(string)' to \(Value.self)"
            )
        }
        wrappedValue = value
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(String(wrappedValue))
    }
}

struct Track: Codable {
    var title: String
    @StringBacked var duration: Double  // API sends "210.5"
    @StringBacked var playCount: Int    // API sends "42"
}

// Flexible value (handles both String and Number for same field)
enum FlexibleValue: Codable {
    case string(String)
    case int(Int)
    case double(Double)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let intVal = try? container.decode(Int.self) {
            self = .int(intVal)
        } else if let doubleVal = try? container.decode(Double.self) {
            self = .double(doubleVal)
        } else {
            self = .string(try container.decode(String.self))
        }
    }
}
```

### DecodableWithConfiguration

```swift
// When decoding needs external context
struct Track: DecodableWithConfiguration {
    typealias DecodingConfiguration = TrackDecodingConfig

    struct TrackDecodingConfig {
        var defaultArtist: String
    }

    var title: String
    var artist: String

    init(from decoder: Decoder, configuration: TrackDecodingConfig) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        artist = try container.decodeIfPresent(String.self, forKey: .artist)
            ?? configuration.defaultArtist
    }
}
```

## Diagnostics

### Storage Issue Diagnostic

```swift
func diagnoseStorageIssue(fileURL: URL) {
    print("=== Storage Diagnosis ===")

    // 1. Location
    let path = fileURL.path
    if path.contains("/tmp/") {
        print("WARNING: File in tmp/ - purged aggressively")
    } else if path.contains("/Caches/") {
        print("WARNING: File in Caches/ - purged under storage pressure")
    } else if path.contains("/Documents/") {
        print("OK: File in Documents/ - never purged, backed up")
    } else if path.contains("/Library/Application Support/") {
        print("OK: File in Application Support/ - never purged, backed up")
    }

    // 2. Existence and size
    if FileManager.default.fileExists(atPath: path) {
        if let attrs = try? FileManager.default.attributesOfItem(atPath: path) {
            let size = attrs[.size] as? Int64 ?? 0
            print("File exists, size: \(size) bytes")

            // 3. Protection
            if let protection = attrs[.protectionKey] as? FileProtectionType {
                print("Protection: \(protection)")
                if protection == .complete {
                    print("WARNING: Inaccessible when device locked")
                }
            }
        }
    } else {
        print("ERROR: File does not exist")
    }

    // 4. Backup status
    if let values = try? fileURL.resourceValues(forKeys: [.isExcludedFromBackupKey]) {
        print("Excluded from backup: \(values.isExcludedFromBackup ?? false)")
    }

    // 5. Parent directory size
    let parentURL = fileURL.deletingLastPathComponent()
    let parentSize = directorySize(url: parentURL)
    print("Parent directory size: \(parentSize / 1_000_000) MB")

    print("=== End Diagnosis ===")
}
```

### Common Issues

```
File storage issue?

├─ Files disappeared after restart
│   ├─ Was in tmp/? → Expected, use Caches/ or Application Support/
│   ├─ Was in Caches/? → System purged, re-download or move to App Support
│   └─ Protection .complete? → Wait for device unlock
│
├─ Files disappeared randomly (weeks later)
│   ├─ In Caches/? → Expected under storage pressure
│   ├─ In Documents/App Support? → User deleted app? iOS update?
│   └─ Check isExcludedFromBackup + iCloud sync status
│
├─ Permission denied / NSFileReadNoPermissionError
│   ├─ Device locked + .complete protection? → Use .completeUntilFirstAuth
│   ├─ Background task? → .complete blocks background access
│   └─ Check file exists and is readable
│
├─ Backup too large (> 500 MB)
│   ├─ Downloaded content in Documents? → Move + exclude from backup
│   ├─ Application Support not excluded? → Audit and exclude re-downloadable
│   └─ Run directorySize() on each directory
│
├─ Codable decode error
│   ├─ keyNotFound → Check key name / CodingKeys mapping
│   ├─ typeMismatch → API changed type? Use FlexibleValue
│   ├─ dataCorrupted → Check date format, number format
│   └─ valueNotFound → Use decodeIfPresent for optionals
│
└─ Storage full
    ├─ Check volumeAvailableCapacityForImportantUsage
    ├─ Run progressive cache cleanup
    └─ Alert user if critically low
```

## Related

- `ax-swiftdata` - SwiftData store file location
- `ax-grdb` - Database file storage and protection
- `ax-cloud-storage` - iCloud Drive file coordination, CloudKit assets
- `ax-concurrency` - Background file operations with protection considerations
