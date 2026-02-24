---
name: ax-concurrency-ref
description: Instruments profiling for async/await, actor contention analysis, thread pool exhaustion detection, Swift Concurrency template workflows, priority inversion diagnosis
license: MIT
metadata:
  version: "2.0.0"
  last-updated: "2026-02-23"
  sources: ["axiom-concurrency-profiling"]
---

# Concurrency Profiling Reference

## Quick Patterns

### Swift Concurrency Instruments Template

| Track | Information |
|-------|-------------|
| **Swift Tasks** | Task lifetimes, parent-child relationships |
| **Swift Actors** | Actor access, contention visualization |
| **Thread States** | Blocked vs running vs suspended |

**Color Coding:**
- **Blue**: Task executing
- **Red**: Task waiting (contention)
- **Gray**: Task suspended (awaiting)

**Statistics:**
- Running Tasks: Currently executing
- Alive Tasks: Present at a point in time
- Total Tasks: Cumulative count created

### Cooperative Thread Pool Model

| Aspect | GCD | Swift Concurrency |
|--------|-----|-------------------|
| Threads | Grows unbounded | Fixed to core count |
| Blocking | Creates new threads | Suspends, frees thread |
| Dependencies | Hidden | Runtime-tracked |
| Context switch | Full kernel switch | Lightweight continuation |

## Decision Tree

```
Performance issue with async code?

├─ UI freezing
│   └─ Workflow 1: Main Thread Blocking
│
├─ Parallel work running sequentially
│   └─ Workflow 2: Actor Contention
│
├─ Tasks queued but not executing
│   └─ Workflow 3: Thread Pool Exhaustion
│
├─ High-priority work delayed
│   └─ Workflow 4: Priority Inversion
│
└─ Not sure where the bottleneck is
    └─ Start with Quick Checks, then profile
```

## Deep Patterns

### Workflow 1: Main Thread Blocking

**Symptom**: UI freezes, main thread timeline full

1. Profile with Swift Concurrency template
2. Look at main thread "Swift Tasks" lane
3. Find long blue bars (task executing on main)
4. Check if work could be offloaded

```swift
// WRONG: Heavy work on MainActor
@MainActor class ViewModel: ObservableObject {
    func process() {
        let result = heavyComputation()  // Blocks UI
        self.data = result
    }
}

// FIX: Offload heavy work
@MainActor class ViewModel: ObservableObject {
    func process() async {
        let result = await Task.detached {
            heavyComputation()
        }.value
        self.data = result
    }
}
```

### Workflow 2: Actor Contention

**Symptom**: Tasks serializing unexpectedly, parallel work running sequentially

1. Enable "Swift Actors" instrument
2. Look for serialized access patterns
3. Red = waiting, Blue = executing
4. High red:blue ratio = contention problem

```swift
// WRONG: All work serialized through actor
actor DataProcessor {
    func process(_ data: Data) -> Result {
        heavyProcessing(data)  // All callers wait in line
    }
}

// FIX: Mark heavy work as nonisolated
actor DataProcessor {
    nonisolated func process(_ data: Data) -> Result {
        heavyProcessing(data)  // Runs in parallel
    }

    func storeResult(_ result: Result) {
        // Only actor state access is serialized
    }
}
```

**Additional fixes for contention:**
- Split single actor into multiple (domain separation)
- Use Mutex for hot-path reads (faster than actor hop)
- Reduce actor scope (fewer isolated properties)

### Workflow 3: Thread Pool Exhaustion

**Symptom**: Tasks queued but not executing, gaps in task execution

**Cause**: Blocking calls exhaust the cooperative thread pool

1. Look for gaps in task execution across all threads
2. Check for blocking primitives
3. Replace with async equivalents

```swift
// WRONG: Blocks cooperative thread
Task { semaphore.wait() }                           // NEVER
Task { let data = Data(contentsOf: fileURL) }       // Blocks
Task { Thread.sleep(forTimeInterval: 1.0) }         // Blocks

// FIX: Use async APIs
Task { await withCheckedContinuation { ... } }      // Non-blocking
Task { let (data, _) = try await URLSession... }    // Async
Task { try await Task.sleep(for: .seconds(1)) }     // Cooperative
```

**Debug flag**: `SWIFT_CONCURRENCY_COOPERATIVE_THREAD_BOUNDS=1` detects unsafe blocking in async context.

### Workflow 4: Priority Inversion

**Symptom**: High-priority task waits for low-priority

1. Inspect task priorities in Instruments
2. Follow wait chains
3. Ensure critical paths use appropriate priority

```swift
// Explicit priority for critical work
Task(priority: .userInitiated) {
    await criticalUIUpdate()
}

// Task groups inherit priority
await withTaskGroup(of: Void.self) { group in
    // Child tasks inherit parent priority
    group.addTask { await processItem(item) }
}
```

### Quick Checks Before Profiling

Run these before opening Instruments:

**1. Is work actually async?**
```swift
// Sync code in async function still blocks!
func fetchData() async -> Data {
    return Data(contentsOf: url)  // NOT async - blocks thread
}
```

**2. Holding locks across await?**
```swift
// DEADLOCK RISK
mutex.withLock {
    await something()  // Never!
}
```

**3. Tasks in tight loops?**
```swift
// WRONG: Task creation overhead
for item in items { Task { process(item) } }

// FIX: Structured concurrency
await withTaskGroup(of: Void.self) { group in
    for item in items { group.addTask { process(item) } }
}
```

**4. Blocking primitives in async context?**
- DispatchSemaphore.wait() - always unsafe
- pthread_cond_wait - always unsafe
- Thread.sleep() - always unsafe
- Sync file/network I/O - always unsafe

## Anti-Patterns

```swift
// ---- Using Task.detached unnecessarily ----
// WRONG: Loses structured concurrency benefits
Task.detached { await self.process() }
// FIX: Use regular Task (inherits priority, cancellation)
Task { await self.process() }
// Only use Task.detached when you explicitly need to escape actor context

// ---- Profiling without Instruments ----
// WRONG: Adding print timestamps manually
let start = Date()
await work()
print("Took \(Date().timeIntervalSince(start))s")
// FIX: Use Instruments Swift Concurrency template
// Shows actual thread utilization, contention, waits

// ---- Ignoring task group errors ----
// WRONG: Errors silently lost
await withTaskGroup(of: Void.self) { group in
    group.addTask { try await riskyWork() }  // Error lost!
}
// FIX: Use throwing task group
try await withThrowingTaskGroup(of: Void.self) { group in
    group.addTask { try await riskyWork() }
}
```

## Diagnostics

### Common Issues Summary

| Issue | Symptom in Instruments | Fix |
|-------|------------------------|-----|
| MainActor overload | Long blue bars on main thread | `@concurrent`, `Task.detached`, `nonisolated` |
| Actor contention | High red:blue ratio in actor lane | Split actors, use `nonisolated` for pure work |
| Thread exhaustion | Gaps across all cooperative threads | Remove blocking calls, use async APIs |
| Priority inversion | High-pri task waits for low-pri | Check task priorities, follow wait chains |
| Too many tasks | Task creation overhead visible | Use task groups instead of individual Tasks |
| Unnecessary detached | Lost cancellation propagation | Use regular Task unless escaping actor needed |

### Safe vs Unsafe Primitives

**Safe with cooperative pool:**
- `await`, actors, task groups
- `os_unfair_lock`, `NSLock` (short critical sections only)
- `Mutex` (iOS 18+)
- `Atomic` (iOS 18+)

**Unsafe (violate forward progress):**
- `DispatchSemaphore.wait()`
- `pthread_cond_wait`
- `pthread_mutex_lock` (long hold)
- Sync file/network I/O in Task
- `Thread.sleep()` in Task
- `DispatchQueue.sync` from async context

### Debug Environment Variables

```
SWIFT_CONCURRENCY_COOPERATIVE_THREAD_BOUNDS=1
→ Detects unsafe blocking in async context

SWIFT_IS_CURRENT_EXECUTOR_LEGACY_MODE_OVERRIDE=swift6
→ Strict executor checking

LIBDISPATCH_COOPERATIVE_POOL_STRICT=1
→ Assert on cooperative pool misuse
```

## Related

- `ax-concurrency` - Swift 6 concurrency patterns, actors, Sendable, Mutex
- `axiom-lldb` - Interactive thread and task state inspection in debugger
- `axiom-performance-profiling` - General Instruments workflows
