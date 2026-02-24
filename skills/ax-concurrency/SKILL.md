---
name: ax-concurrency
description: Swift 6 concurrency, async/await, @MainActor, actors, Sendable, @concurrent, assumeIsolated, Mutex, Atomic, ownership modifiers, progressive concurrency adoption
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-swift-concurrency", "axiom-assume-isolated", "axiom-synchronization", "axiom-ownership-conventions"]
---

# Concurrency

## Quick Patterns

### Progressive Journey (Start Simple)

```
Single-Threaded → Asynchronous → Concurrent → Actors
     |                |             |           |
   Start here    Hide latency   Background   Move data
                 (network)      CPU work     off main
```

**Advance only when profiling proves it's needed.**

1. **Stay single-threaded** if UI is responsive and operations are fast (<16ms)
2. **Add async/await** when high-latency operations (network, file I/O) block UI
3. **Add @concurrent** when CPU-intensive work freezes UI (image processing, parsing)
4. **Add actors** when too much main actor code causes contention

### Main Actor Mode (Xcode 26+)

```
Build Settings → Swift Compiler — Language
→ "Default Actor Isolation" = Main Actor
→ "Approachable Concurrency" = Yes

Build Settings → Swift Compiler — Concurrency
→ "Strict Concurrency Checking" = Complete
```

All code protected by `@MainActor` by default unless explicitly marked otherwise.

### Async/Await (Hide Latency)

```swift
// Suspends without blocking main thread
func fetchAndDisplay(url: URL) async throws {
    let (data, _) = try await URLSession.shared.data(from: url)  // Suspends here
    let image = decodeImage(data)  // Resumes on main thread
    view.displayImage(image)
}

// Create task for user action
func onTapEvent() {
    Task {
        do {
            try await fetchAndDisplay(url: url)
        } catch {
            displayError(error)
        }
    }
}
```

### @concurrent (Background CPU Work, Swift 6.2+)

```swift
// Always runs on background thread pool
@concurrent
func decodeImage(_ data: Data) async -> UIImage {
    // Image processing, parsing, heavy computation
    return UIImage(data: data)!
}

// Usage - automatically offloads
let image = await decodeImage(data)
```

**Use `@concurrent`** when work should **always** run on background (image processing, parsing).
**Use `nonisolated`** when **caller decides** where work runs (library APIs).

### @MainActor for UI Code

```swift
@MainActor
class PlayerViewModel: ObservableObject {
    @Published var currentTrack: Track?
    @Published var isPlaying: Bool = false

    func play(_ track: Track) async {
        self.currentTrack = track
        self.isPlaying = true
        // Already on MainActor - direct state access
    }
}
```

### Actors (Move Data Off Main Thread)

```swift
// Extract non-UI subsystems into actors
actor NetworkManager {
    var openConnections: [URL: Connection] = [:]

    func openConnection(for url: URL) -> Connection {
        if let existing = openConnections[url] { return existing }
        let connection = Connection()
        openConnections[url] = connection
        return connection
    }
}

// Access requires await
let connection = await networkManager.openConnection(for: url)
```

**Use actors for**: Non-UI subsystems with independent state (cache, database, network).
**Do NOT use actors for**: ViewModels, View Controllers, model classes (use `@MainActor`).

### Sendable Types

```swift
// Value types are Sendable (copy when passed between actors)
struct Track: Sendable {
    let id: UUID
    let title: String
    let duration: TimeInterval
}

enum PlaybackState: Sendable {
    case stopped, playing, paused
}

// Classes are NOT Sendable by default
// Keep @MainActor or non-Sendable (don't share concurrently)
@MainActor class ViewModel: ObservableObject { }  // Implicitly Sendable
actor Cache { }  // Implicitly Sendable
```

### Delegate Value Capture (Critical Pattern)

```swift
// nonisolated delegate method needs to update @MainActor state
nonisolated func locationManager(
    _ manager: CLLocationManager,
    didUpdateLocations locations: [CLLocation]
) {
    // Step 1: Capture values BEFORE Task
    let location = locations.last

    // Step 2: Hop to MainActor
    Task { @MainActor in
        // Step 3: Safe to access self
        self.currentLocation = location
    }
}
```

### Weak Self in Stored Tasks

```swift
class Player {
    private var progressTask: Task<Void, Never>?

    func startMonitoring() {
        progressTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                await self.updateProgress()
            }
        }
    }

    deinit { progressTask?.cancel() }
}
```

### assumeIsolated (Synchronous Actor Access)

```swift
// When you KNOW you're on the correct actor (documented guarantee)
// CLLocationManager delivers callbacks on main thread when created there

@MainActor class LocationDelegate: NSObject, CLLocationManagerDelegate {
    var location: CLLocation?

    nonisolated func locationManager(
        _ manager: CLLocationManager,
        didUpdateLocations locations: [CLLocation]
    ) {
        MainActor.assumeIsolated {
            self.location = locations.last  // Synchronous, no Task overhead
        }
    }
}

// @preconcurrency equivalent (cleaner syntax)
extension MyClass: @preconcurrency SomeDelegate {
    func callback() {
        self.updateUI()  // Compiler wraps in assumeIsolated
    }
}

// DANGER: Crashes if not actually on the correct actor!
// Only use when callback isolation is documented/guaranteed
```

### Task vs assumeIsolated

| Aspect | `Task { @MainActor in }` | `MainActor.assumeIsolated` |
|--------|--------------------------|---------------------------|
| Timing | Deferred (next run loop) | Synchronous (inline) |
| Async support | Yes (can await) | No (sync only) |
| Failure mode | Runs anyway | **Crashes** if wrong isolation |
| Use case | Start async work | Verified synchronous access |

---

### Mutex (Thread-Safe Primitives)

```swift
import Synchronization

// Mutex (iOS 18+) - faster than actor for microsecond operations
let counter = Mutex<Int>(0)
counter.withLock { $0 += 1 }
let value = counter.withLock { $0 }

// Thread-safe wrapper
final class ThreadSafeValue<T: Sendable>: @unchecked Sendable {
    private let mutex: Mutex<T>
    init(_ value: T) { mutex = Mutex(value) }
    var value: T {
        get { mutex.withLock { $0 } }
        set { mutex.withLock { $0 = newValue } }
    }
}

// Fast sync read in actor (bypass actor hop)
actor ImageCache {
    private let mutex = Mutex<[URL: Data]>([:])

    nonisolated func cachedSync(_ url: URL) -> Data? {
        mutex.withLock { $0[url] }
    }

    func cacheAsync(_ url: URL, data: Data) {
        mutex.withLock { $0[url] = data }
    }
}
```

### OSAllocatedUnfairLock (iOS 16+)

```swift
import os

let lock = OSAllocatedUnfairLock(initialState: 0)
lock.withLock { state in state += 1 }

// Fallback for iOS 16-17
#if compiler(>=6.0)
import Synchronization
typealias Lock<T> = Mutex<T>
#else
import os
// Use OSAllocatedUnfairLock
#endif
```

### Atomic Types (iOS 18+)

```swift
import Synchronization

let counter = Atomic<Int>(0)
counter.wrappingAdd(1, ordering: .relaxed)

let (exchanged, original) = counter.compareExchange(
    expected: 0, desired: 42,
    ordering: .acquiringAndReleasing
)
```

### Ownership Modifiers (Performance)

```swift
// borrowing: Read-only, no copy (for large value types)
func process(_ buffer: borrowing LargeBuffer) -> Int {
    buffer.data.count  // No copy of large array
}

// consuming: Transfer ownership (for factory/builder patterns)
struct Builder {
    consuming func build() -> Product {
        Product(config: config)  // Builder invalid after call
    }
}

// ~Copyable: Enforce single ownership
struct FileHandle: ~Copyable {
    borrowing func read(count: Int) -> Data { ... }
    consuming func close() { Darwin.close(fd) }
    deinit { Darwin.close(fd) }
}
```

**When to use ownership**: Large structs in tight loops, ARC traffic visible in profiler, ~Copyable types. **Skip for**: Small types, most code (compiler optimizes well).

## Decision Tree

```
Concurrency task?

├─ Starting new feature
│   ├─ UI responsive with sync code? → Stay single-threaded
│   ├─ High-latency operation? → async/await
│   ├─ CPU-intensive blocking UI? → @concurrent (Swift 6.2+) or nonisolated
│   └─ Main actor contention? → Extract to actor
│
├─ Error: "actor-isolated property accessed from nonisolated context"
│   ├─ In delegate method? → Capture values, Task { @MainActor in }
│   ├─ In async function? → Add @MainActor or use Task
│   └─ In @concurrent function? → Move access to caller or use await
│
├─ Error: "Type does not conform to Sendable"
│   ├─ Struct/enum with Sendable properties? → Add : Sendable
│   └─ Class? → Make @MainActor, actor, or keep non-Sendable
│
├─ Need synchronization
│   ├─ Lock-free counter/flag? → Atomic (iOS 18+)
│   ├─ Microsecond operations? → Mutex (iOS 18+) or OSAllocatedUnfairLock
│   ├─ Need suspension points (await)? → Actor
│   ├─ Cross-await access? → Actor
│   └─ Performance-critical hot path? → Mutex/Atomic
│
├─ Delegate callback needs actor access
│   ├─ Documented main thread delivery? → assumeIsolated
│   ├─ Unknown delivery context? → Task { @MainActor in }
│   └─ Protocol will add isolation? → @preconcurrency conformance
│
└─ Performance optimization
    ├─ Large value type copies? → borrowing parameter
    ├─ ARC traffic in profiler? → borrowing for reference types
    ├─ Single-use builder? → consuming method
    └─ Unique resource handle? → ~Copyable
```

## Anti-Patterns

```swift
// ---- Premature concurrency ----
// WRONG: Concurrency for trivial work
@concurrent
func add(_ a: Int, _ b: Int) async -> Int { a + b }
// FIX: Stay synchronous
func add(_ a: Int, _ b: Int) -> Int { a + b }

// ---- Making ViewModel an actor ----
// WRONG: UI code should be @MainActor
actor MyViewModel: ObservableObject {
    @Published var state: State  // Won't work correctly
}
// FIX: @MainActor for UI-facing classes
@MainActor class MyViewModel: ObservableObject {
    @Published var state: State
}

// ---- Strong self in stored tasks ----
// WRONG: Memory leak
progressTask = Task {
    while true { await self.update() }
}
// FIX: Weak capture
progressTask = Task { [weak self] in
    guard let self else { return }
    while !Task.isCancelled { await self.updateProgress() }
}

// ---- Holding lock across await ----
// WRONG: Deadlock risk
mutex.withLock {
    await someAsyncWork()  // Task suspends while holding lock!
}
// FIX: Release before await
let value = mutex.withLock { $0 }
let result = await process(value)
mutex.withLock { $0 = result }

// ---- DispatchSemaphore in async context ----
// WRONG: Blocks cooperative thread → thread pool exhaustion
Task {
    semaphore.wait()  // NEVER in async context
}
// FIX: Use async continuation
await withCheckedContinuation { continuation in
    callback { continuation.resume() }
}

// ---- os_unfair_lock in Swift ----
// WRONG: Lock may move in memory
var lock = os_unfair_lock()
os_unfair_lock_lock(&lock)  // Undefined behavior
// FIX: Use OSAllocatedUnfairLock (heap-allocated, stable)
let lock = OSAllocatedUnfairLock()

// ---- assumeIsolated to silence warnings ----
// WRONG: Crashes if not actually on correct actor
func unknownContext() {
    MainActor.assumeIsolated { updateUI() }  // May crash!
}
// FIX: Use async when uncertain
func unknownContext() async {
    await MainActor.run { updateUI() }
}

// ---- Recursive locking ----
// WRONG: OSAllocatedUnfairLock is non-recursive
lock.withLock {
    doWork()  // If doWork() also locks → deadlock
}
// FIX: Extract data, operate outside lock
let data = lock.withLock { $0.copy() }
doWork(with: data)

// ---- Over-optimizing with ownership ----
// WRONG: Unnecessary for small types
func add(_ a: borrowing Int, _ b: borrowing Int) -> Int { a + b }
// FIX: Let compiler optimize
func add(_ a: Int, _ b: Int) -> Int { a + b }
```

## Deep Patterns

### Background SwiftData Access

```swift
actor DataFetcher {
    let modelContainer: ModelContainer

    func fetchAllTracks() throws -> [Track] {
        let context = ModelContext(modelContainer)
        return try context.fetch(FetchDescriptor<Track>(
            sortBy: [SortDescriptor(\.title)]
        ))
    }
}

// Core Data thread-safe fetch
actor CoreDataFetcher {
    func fetchTrackIDs(genre: String) async throws -> [String] {
        let context = persistentContainer.newBackgroundContext()
        var trackIDs: [String] = []
        try await context.perform {
            let request = NSFetchRequest<CDTrack>(entityName: "Track")
            request.predicate = NSPredicate(format: "genre = %@", genre)
            trackIDs = try context.fetch(request).map(\.id)
        }
        return trackIDs
    }
}
```

### Batch Import with Progress

```swift
actor DataImporter {
    func importRecords(
        _ records: [RawRecord],
        onProgress: @MainActor (Int, Int) -> Void
    ) async throws {
        let context = ModelContext(modelContainer)
        let chunkSize = 1000

        for (index, chunk) in records.chunked(into: chunkSize).enumerated() {
            for record in chunk {
                context.insert(Track(from: record))
            }
            try context.save()

            let processed = min((index + 1) * chunkSize, records.count)
            await onProgress(processed, records.count)
            if Task.isCancelled { throw CancellationError() }
        }
    }
}
```

### Isolated Protocol Conformances (Swift 6.2+)

```swift
protocol Exportable {
    func export()
}

// Conform with explicit isolation
extension StickerModel: @MainActor Exportable {
    func export() {
        photoProcessor.exportAsPNG()  // Safe: both on MainActor
    }
}
```

### Breaking Main Actor Ties for @concurrent

```swift
@MainActor class ImageModel {
    var cachedImage: [URL: UIImage] = [:]

    func fetchAndDisplay(url: URL) async throws {
        // Strategy 1: Check cache on main actor BEFORE background work
        if let image = cachedImage[url] {
            view.displayImage(image)
            return
        }

        let (data, _) = try await URLSession.shared.data(from: url)
        let image = await decodeImage(data)
        view.displayImage(image)
    }

    @concurrent
    func decodeImage(_ data: Data) async -> UIImage {
        // No main actor access needed - clean background work
        UIImage(data: data)!
    }
}
```

### Synchronization Decision Matrix

| Need | Mutex | Atomic | Actor | OSAllocatedUnfairLock |
|------|-------|--------|-------|----------------------|
| iOS 18+ | Yes | Yes | Yes | Yes |
| iOS 16+ | No | No | Yes | Yes |
| Sendable | Yes | Yes | Yes | Yes |
| Async support | No | No | Yes | No |
| Lock-free | No | Yes | No | No |
| Microsecond ops | Yes | Yes | No | Yes |
| Complex state | Yes | No | Yes | Yes |

### Memory Ordering for Atomics

| Ordering | Use Case |
|----------|----------|
| `.relaxed` | Counters, no dependencies between operations |
| `.acquiring` | Load before dependent operations |
| `.releasing` | Store after dependent operations |
| `.acquiringAndReleasing` | Read-modify-write |
| `.sequentiallyConsistent` | Strongest guarantee (rarely needed) |

### ~Copyable Limitations

| Limitation | Impact |
|-----------|--------|
| Can't store in Array, Dictionary, Set | Collections require Copyable |
| Can't use with most generics | `<T>` implicitly means `<T: Copyable>` |
| Protocol conformance restricted | Most protocols require Copyable |
| Can't capture in closures by default | Closures copy captured values |
| No existential support | `any ~Copyable` doesn't work |

**Prefer** `consuming func` on regular types as a lighter alternative for "use once" semantics.

## Diagnostics

```
Concurrency issue?

├─ "Sending 'self' risks causing data races"
│   ├─ In delegate? → Capture values before Task
│   ├─ Passing object to another actor? → Make Sendable or copy data
│   └─ Class crossing boundaries? → Keep @MainActor or make struct
│
├─ "Main actor-isolated property accessed from nonisolated context"
│   ├─ Delegate callback → Pattern: capture + Task { @MainActor in }
│   ├─ @concurrent function → Move access to caller or use await
│   └─ Protocol conformance → @preconcurrency or isolated conformance
│
├─ UI freezing (main thread blocked)
│   ├─ Check Instruments → Swift Concurrency template
│   ├─ Long blue bars on main? → Offload with @concurrent
│   ├─ Sync code in async function? → Add await/suspension
│   └─ Heavy work on MainActor? → Extract to actor
│
├─ Actor contention (serialized parallel work)
│   ├─ High red:blue ratio in Instruments → Too much serialization
│   ├─ Heavy work inside actor? → Mark nonisolated
│   ├─ Single actor bottleneck? → Split into multiple actors
│   └─ Hot path through actor? → Use Mutex for fast reads
│
├─ Thread pool exhaustion
│   ├─ Tasks queued but not executing → Blocking call detected
│   ├─ DispatchSemaphore in Task? → Use async continuation
│   ├─ Sync file I/O in Task? → Use async APIs
│   └─ Debug: SWIFT_CONCURRENCY_COOPERATIVE_THREAD_BOUNDS=1
│
├─ assumeIsolated crash
│   ├─ Not actually on expected actor → Use async/await instead
│   ├─ GCD main queue != MainActor (edge case) → Check docs
│   └─ Only use when callback isolation is documented
│
└─ Deadlock
    ├─ Lock held across await? → Release before await
    ├─ Recursive lock attempt? → Non-recursive locks deadlock
    ├─ Nested withLock calls? → Extract data, operate outside
    └─ Semaphore in cooperative pool? → Use continuation
```

## Related

- `ax-concurrency-ref` - Instruments workflows for profiling concurrency
- `ax-swiftdata` - Background ModelContext patterns
- `ax-core-data` - Thread-safe NSManagedObjectContext
- `ax-grdb` - Background database operations
