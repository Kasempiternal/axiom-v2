---
name: ax-swift-perf
description: Use when optimizing Swift code performance - COW, ARC, generics specialization, noncopyable types, InlineArray, Span, memory layout, collection optimization, concurrency overhead
license: MIT
---

# Swift Performance

## Quick Patterns

### Reserve Capacity

```swift
// BAD: ~14 reallocations for 10000 appends
var array: [Int] = []
for i in 0..<10000 { array.append(i) }

// GOOD: Single allocation
var array: [Int] = []
array.reserveCapacity(10000)
for i in 0..<10000 { array.append(i) }
```

### ContiguousArray (15% faster)

```swift
// For pure Swift (no ObjC bridging)
var array: ContiguousArray<Int> = []
array.reserveCapacity(count)
```

### Avoid Defensive Copies

```swift
class DataStore { var items: [Item] = [] }

// BAD: Swift may defensively copy store.items each iteration
func process(_ store: DataStore) {
    for item in store.items { handle(item) }
}

// GOOD: One explicit copy
func process(_ store: DataStore) {
    let items = store.items
    for item in items { handle(item) }
}
```

### Unowned vs Weak (2x faster)

```swift
// Use unowned when child lifetime < parent lifetime
class Child {
    unowned let parent: Parent  // No atomic overhead
}
```

### Generic over Existential (10x faster)

```swift
// BAD: Existential container + dynamic dispatch
func drawAll(shapes: [any Drawable]) { for s in shapes { s.draw() } }

// GOOD: Specializable, static dispatch
func drawAll<T: Drawable>(shapes: [T]) { for s in shapes { s.draw() } }
```

### Batch Actor Calls

```swift
// BAD: 10000 actor hops
for _ in 0..<10000 { await counter.increment() }

// GOOD: Single actor hop
await counter.incrementBatch(10000)
```

### Lazy Evaluation

```swift
// BAD: Processes entire array
let result = array.map { expensive($0) }.filter { $0 > 0 }.first

// GOOD: Stops at first match
let result = array.lazy.map { expensive($0) }.filter { $0 > 0 }.first
```

---

## Decision Tree

```
Performance issue identified?
|
|-- Profiler shows excessive copying?
|   |-- Large types copied repeatedly -> Noncopyable Types
|   +-- COW triggers in loop -> Copy-on-Write optimization
|
|-- Retain/release overhead in Time Profiler?
|   +-- ARC Optimization (unowned, capture only what's needed)
|
|-- Generic code in hot path?
|   |-- Using `any Protocol`? -> Switch to `some` or generic <T>
|   +-- Cross-module? -> @inlinable, @_specialize
|
|-- Collection operations slow?
|   |-- Many reallocations? -> reserveCapacity
|   |-- Pure Swift? -> ContiguousArray
|   |-- Fixed size? -> InlineArray
|   +-- Short-circuit needed? -> .lazy
|
|-- Async/await overhead visible?
|   |-- Many actor hops? -> Batch operations
|   |-- Task per item? -> TaskGroup instead
|   +-- Sync func marked async? -> Remove async
|
|-- Struct vs class decision?
|   |-- <= 64 bytes, no identity -> Struct
|   |-- > 64 bytes or shared -> Class
|   +-- Large + value semantics -> COW wrapper
|
+-- Memory layout concerns?
    |-- Struct padding -> Reorder fields (largest first)
    |-- Cache misses -> ContiguousArray (not linked list)
    +-- Runtime exclusivity checks -> Move to struct
```

---

## Anti-Patterns

**Premature optimization**. Complex COW/ContiguousArray without profiling data. Start simple, profile, optimize what matters.

**Weak everywhere**. `weak` on every delegate adds atomic overhead. Use `unowned` when lifetime is guaranteed (2x faster).

**Actor for everything**. Actor isolation on simple counters costs ~100us/call. Use lock-free atomics for simple sync data.

**Existential in hot loop**. `[any Protocol]` costs ~10ns/access via witness table. Use `[T]` with generics for ~2ns.

**Inline everything**. Large functions marked `@inlinable` cause code bloat and slower launch. Only inline small, frequently called functions.

**Array without reserveCapacity**. Appending 10000 items causes ~14 reallocations. Reserve upfront when size is known.

**InlineArray passed by value**. Copies eagerly (not COW). Pass `.span` for zero-copy access to large InlineArrays.

**Creating Task per item**. ~100us overhead each. Use single Task with loop or TaskGroup.

**Sync function marked async**. Each async suspension costs ~20-30us. Don't mark sync operations as async.

---

## Deep Patterns

### Four Principles of Swift Performance

From WWDC 2024-10217:

| Principle | Cost | Skill Coverage |
|-----------|------|----------------|
| **Function Calls** | Dispatch overhead, optimization barriers | Generics, Inlining |
| **Memory Allocation** | Stack vs heap, allocation frequency | Value vs Reference, Collections |
| **Memory Layout** | Cache locality, padding, contiguity | Memory Layout, Span |
| **Value Copying** | COW triggers, defensive copies, ARC | Noncopyable, COW, ARC |

### Noncopyable Types (~Copyable, Swift 6.0+)

For types that should never be copied: file handles, GPU buffers, ownership semantics.

```swift
struct FileHandle: ~Copyable {
    private let fd: Int32
    init(path: String) throws {
        self.fd = open(path, O_RDONLY)
        guard fd != -1 else { throw FileError.openFailed }
    }
    deinit { close(fd) }
    consuming func close() { _ = consume self }
}
```

Ownership annotations:

```swift
consuming func process(consuming data: [UInt8]) { }  // Takes ownership
borrowing func validate(borrowing data: [UInt8]) -> Bool { }  // Temporary access
```

### Copy-on-Write

Swift collections share storage until mutation:

```swift
var array1 = [1, 2, 3]  // Single allocation
var array2 = array1      // Shares storage (no copy)
array2.append(4)         // NOW copies
```

Custom COW wrapper:

```swift
final class Storage<T> {
    var value: T
    init(_ value: T) { self.value = value }
}

struct COWWrapper<T> {
    private var storage: Storage<T>
    init(_ value: T) { storage = Storage(value) }

    var value: T {
        get { storage.value }
        set {
            if !isKnownUniquelyReferenced(&storage) {
                storage = Storage(newValue)
            } else {
                storage.value = newValue
            }
        }
    }
}
```

### Value vs Reference

| Factor | Struct | Class |
|--------|--------|-------|
| Size | <= 64 bytes | > 64 bytes |
| Identity | Not needed | Needs === |
| Inheritance | Not needed | Required |
| Mutation | Infrequent | Frequent in-place |
| Sharing | Not needed | Must share |

### ARC Optimization

**Closure capture**: Capture values, not self:

```swift
// BAD: Captures self
DispatchQueue.global().async { [weak self] in
    guard let self else { return }
    self.data.forEach { print($0) }
}

// GOOD: Capture only what's needed
let data = self.data
DispatchQueue.global().async {
    data.forEach { print($0) }  // No self captured
}
```

**Closure costs**: Non-escaping closures are stack-allocated (zero ARC). Escaping closures (`@escaping`, `@Sendable`) heap-allocate context. In hot paths, prefer non-escaping.

**Object lifetimes end at last use** (not closing brace). Use `withExtendedLifetime` when needed:

```swift
let traveler = Traveler()
let account = Account(traveler: traveler)
withExtendedLifetime(traveler) {
    account.printSummary()  // traveler guaranteed alive
}
```

### Generics & Specialization

**Existential container**: `any Protocol` uses 40-byte container. Types <= 24 bytes stored inline (~5ns). Larger types heap-allocate (~15ns). `some Protocol` eliminates container (~2ns).

**When `some` unavailable** (heterogeneous collections): Reduce type sizes to <= 24 bytes, or use enum dispatch:

```swift
enum Shape { case circle(Circle), rect(Rect) }
func draw(_ shape: Shape) {
    switch shape {
    case .circle(let c): c.draw()
    case .rect(let r): r.draw()
    }
}
```

**Force specialization**:

```swift
@_specialize(where T == Int)
@_specialize(where T == String)
func process<T: Comparable>(_ value: T) -> T { value }
```

### Inlining

```swift
// Small, frequently called: inline
@inlinable
public func fastAdd(_ a: Int, _ b: Int) -> Int { a + b }

// Cross-module helper access
@usableFromInline internal func helperFunction() { }

@inlinable
public func publicAPI() { helperFunction() }
```

Trade-off: `@inlinable` exposes implementation, prevents future changes without breaking ABI.

### InlineArray (Swift 6.2)

Fixed-size, stack-allocated. No heap, no COW.

```swift
var sprites = InlineArray<40, Sprite>(repeating: .default)
```

Conforms to `RandomAccessCollection`, `MutableCollection`, `BitwiseCopyable`, `Sendable`. Supports `~Copyable` elements.

**Copy warning**: InlineArray copies eagerly. Pass `.span` for zero-copy:

```swift
struct Buffer {
    var storage = InlineArray<1000, UInt8>(repeating: 0)
    func process() { helper(storage.span) }  // Zero-copy view
}
```

Use when: fixed size at compile time, hot paths, avoiding heap. Don't use when: dynamic size, > 1KB, frequently passed by value.

### Span Types (Swift 6.2)

Non-escapable, non-owning view into contiguous memory. Safe replacement for `UnsafeBufferPointer`.

```swift
let span = array.span       // Read-only
var mSpan = array.mutableSpan // Read-write
let raw = bytes.rawSpan      // Untyped bytes
```

Span provides: spatial safety (bounds-checked), temporal safety (lifetime-bound), zero overhead (no heap, no ARC). Performance matches `UnsafeBufferPointer` (~2ns) with bounds checking.

```swift
// Migration from unsafe
func parseLegacy(_ buffer: UnsafeBufferPointer<UInt8>) -> Header { ... }
func parseModern(_ span: Span<UInt8>) -> Header { ... }  // Same speed, safe
let span = buffer.span  // Bridge
```

**OutputSpan** for safe initialization (replaces `UnsafeMutableBufferPointer`):

```swift
@lifetime(&output)
func writeHeader(to output: inout OutputRawSpan) {
    output.append(0x01); output.append(0x00)
}
```

### Concurrency Performance

**Actor overhead**: ~100us per hop. Batch operations.

**Task creation**: ~100us each. Use TaskGroup, not Task-per-item.

**Async suspension**: ~20-30us. Don't mark sync functions async.

**@concurrent (Swift 6.2)**: Force background execution:

```swift
@concurrent
func expensiveComputation() -> Int { complexCalculation() }

@MainActor
func updateUI() async {
    let result = await expensiveComputation()  // Guaranteed off main
    label.text = "\(result)"
}
```

### Memory Layout

**Struct padding**: Order fields largest-to-smallest:

```swift
// BAD: 24 bytes (padding)
struct Bad { var a: Bool; var b: Int64; var c: Bool }

// GOOD: 16 bytes
struct Good { var b: Int64; var a: Bool; var c: Bool }
```

**Exclusivity checks**: Class properties require runtime `swift_beginAccess`/`swift_endAccess`. Struct properties are compile-time checked (zero cost):

```swift
// BAD: Runtime exclusivity checks
class Parser { var state: ParserState; var cache: [Int: Pixel] }

// GOOD: Compile-time checks
struct Parser { var state: ParserState; var cache: InlineArray<64, Pixel> }
```

**Cache locality**: ContiguousArray for iteration (~10x faster than pointer chasing).

### Typed Throws (Swift 6)

```swift
// Untyped: existential container for error
func fetch() throws -> Data { }

// Typed: concrete type, ~5-10% faster
func fetch() throws(NetworkError) -> Data { }
```

Use typed for: library code, hot paths. Untyped for: application code, unknown error types.

---

## Diagnostics

### Code Review Checklist

**Memory Management**:
- Large structs (>64 bytes) use indirect storage or are classes
- COW types use `isKnownUniquelyReferenced` before mutation
- Collections use `reserveCapacity` when size known
- Weak only where needed (prefer unowned when safe)

**Generics**:
- Protocol types use `some` over `any` where possible
- Hot paths use concrete types or `@_specialize`
- Generic constraints as specific as possible

**Collections**:
- Pure Swift uses `ContiguousArray`
- Dictionary keys have efficient `hash(into:)`
- Lazy evaluation for short-circuit operations

**Concurrency**:
- Sync operations not marked async
- Actor calls batched
- Task creation minimized (TaskGroup)
- CPU-intensive work uses `@concurrent`

**Optimization**:
- Profiling data exists before optimization
- Inlining only for small, frequent functions
- Memory layout optimized for cache locality

### Performance-Critical Loop Pattern

```swift
func processLargeArray(_ input: [Int]) -> [Int] {
    var result = ContiguousArray<Int>()
    result.reserveCapacity(input.count)
    for element in input { result.append(transform(element)) }
    return Array(result)
}
```

### Profiler Indicators

| Time Profiler Shows | Likely Cause | Fix |
|---------------------|-------------|-----|
| `swift_retain`/`swift_release` | Excessive ARC | Capture values, not self |
| `Array.__allocating_init` | Defensive copies | Local variable before loop |
| `swift_allocObject` for closures | Escaping closure contexts | Non-escaping if possible |
| `swift_beginAccess` | Runtime exclusivity | Move to struct |
| `protocol witness table` | Existential dispatch | Generics or enum |

---

## Related

**WWDC**: 2016-416, 2021-10216, 2024-10170, 2024-10217, 2025-312

**Docs**: /swift/inlinearray, /swift/span, /swift/outputspan

**Skills**: ax-performance, ax-concurrency, ax-swiftui
