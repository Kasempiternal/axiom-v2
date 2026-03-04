---
name: ax-lldb
description: Runtime debugging with LLDB — breakpoints, variable inspection, crash triage, hang diagnosis, async debugging, expression evaluation, and complete command reference
license: MIT
---
# LLDB

## Quick Patterns

### Crash Triage (When Debugger Stops)

```
(lldb) thread info              # What happened?
(lldb) bt                       # Where did it happen?
(lldb) frame select 3           # Jump to your code frame
(lldb) v                        # Inspect all variables
(lldb) v self.someProperty      # Inspect specific property
```

### The Four Print Commands

| Command | Best For | Reliability |
|---------|----------|-------------|
| `v` | Swift structs, enums, locals, stored properties | Most reliable (reads memory directly) |
| `p` | Computed properties, function calls | Compiles expression |
| `po` | Classes with `CustomDebugStringConvertible` | Calls debugDescription |
| `expr` | Modifying state, calling methods | Full expression evaluation |

**Default to `v`** -- it never fails for stored properties. Use `p` when `v` can't reach it (computed properties, function calls). Use `po` only for class descriptions.

### Exception Breakpoints (Set These Always)

```
(lldb) breakpoint set -E swift   # Break on all Swift errors
(lldb) breakpoint set -E objc    # Break on all ObjC exceptions
```

These catch errors at the throw site instead of the crash site.

### Hang Diagnosis

```
(lldb) process interrupt         # Pause hung app
(lldb) bt all                    # All thread backtraces
(lldb) thread list               # Thread states (look for deadlocks)
```

---

## Decision Tree

```
What do you need?
├─ App crashed, debugger stopped
│  ├─ Read stop reason -> thread info
│  ├─ Get backtrace -> bt
│  ├─ Find your frame -> frame select N
│  ├─ Inspect state -> v self, v localVar
│  └─ Classify: EXC_BAD_ACCESS? EXC_BREAKPOINT? SIGABRT?
├─ App is frozen/hung
│  ├─ Pause -> process interrupt
│  ├─ All backtraces -> bt all
│  ├─ Check main thread (Thread 0)
│  │  ├─ __psynch_mutexwait -> Blocked on mutex
│  │  ├─ _dispatch_sync_f_slow -> dispatch_sync deadlock
│  │  └─ Your code at top -> CPU-bound, move to background
│  └─ Check for deadlocks -> thread list (multiple threads waiting)
├─ Need to inspect a variable at runtime
│  └─ Set breakpoint -> v self.property
├─ po doesn't work / shows garbage
│  └─ Use v instead (see Swift Value Inspection)
├─ Need to test a fix without rebuilding
│  └─ expr self.property = newValue
├─ Want to break on specific condition
│  └─ breakpoint set -f File.swift -l 42 -c "value == nil"
└─ Need to log without stopping
   └─ Logpoint: breakpoint + command add + continue
```

### Stop Reason Classification

| Stop Reason | Meaning | Typical Cause |
|-------------|---------|---------------|
| `EXC_BAD_ACCESS` (SIGSEGV) | Invalid memory access | Force-unwrap nil, use-after-free, array OOB |
| `EXC_BAD_ACCESS` at address 0x0-0x10 | Nil dereference | Force-unwrap nil optional |
| `EXC_BAD_ACCESS` at high address | Dangling reference | Object lifetime issue, missing `[weak self]` |
| `EXC_BREAKPOINT` (SIGTRAP) | Swift runtime trap | `fatalError()`, `preconditionFailure()`, bounds check |
| `EXC_CRASH` (SIGABRT) | Deliberate abort | Uncaught ObjC exception, assertion failure |
| `breakpoint` | Your breakpoint hit | Normal -- inspect state |

---

## Anti-Patterns

**Using `po` for everything** -- `po` fails for Swift structs, enums, and optionals. Use `v` as your default.

**Print-debug cycles instead of breakpoints** -- Each print cycle costs 3-5 min (edit, build, run, navigate). A breakpoint costs 30 seconds.

**"LLDB doesn't work with Swift"** -- It does. The problem is using the wrong command. `v` is designed for Swift values.

**Ignoring backtraces** -- Read `bt` first, navigate to your frame, then inspect. Don't jump to guesses.

**No exception breakpoints set** -- Without them, crashes land in system code. With them, you stop at the throw site.

**Debugging Release builds** -- Variables are optimized out, code is reordered. Use Debug config, or per-file `-Onone`.

**Force-continuing past exceptions** -- Fix the exception; don't suppress it.

---

## Deep Patterns

### Swift Value Inspection

**`v` (frame variable)** -- reads memory directly, no compilation:

```
(lldb) v                          # All variables in current frame
(lldb) v self                     # Self in current context
(lldb) v self.propertyName        # Specific property
(lldb) v localVariable            # Local variable
(lldb) v self.array[0]           # Collection element
(lldb) v self._showDetails        # SwiftUI @State backing store
(lldb) v optionalValue            # Shows: (String?) some = "hello" or none
```

`v` flags: `-d run` (dynamic type resolution), `-T` (show types), `-R` (raw output), `-D N` (depth limit).

**Limitation:** `v` only reads stored properties. For computed properties, `lazy var`, and property wrapper projected values, use `p`.

**`p` (expression with formatter):**

```
(lldb) p self.computedProperty
(lldb) p items.count
(lldb) p someFunction()
(lldb) p Array(myArray.prefix(5))    # Large collections
(lldb) p type(of: someValue)         # Runtime type
```

**`po` (object description):**

```
(lldb) po myObject
(lldb) po error
(lldb) po notification.userInfo
```

Best for classes with `CustomDebugStringConvertible`.

**`expression` (modify state):**

```
(lldb) expr self.debugFlag = true
(lldb) expr myArray.append("test")
(lldb) expr self.view.backgroundColor = UIColor.red
(lldb) expr CATransaction.flush()              # Force UI update
(lldb) expr Self._printChanges()               # SwiftUI re-render debug
```

### "LLDB Is Broken" Fixes

| Symptom | Cause | Fix |
|---------|-------|-----|
| `<uninitialized>` | `po` failed / optimizer | Use `v` |
| `expression failed to parse` | Type resolution failure | Use `v`, or `expr -l objc -- (id)0x12345` |
| `<variable not available>` | Optimized out (Release) | Debug config, per-file `-Onone`, or `register read` |
| `po` shows memory address | No `CustomDebugStringConvertible` | Use `v` for raw value |
| `cannot find 'self' in scope` | Static/closure context | Use `v` with explicit variable name |
| `p` works but `po` crashes | Different compilation paths | Stick with `p` |

### Inspecting SwiftUI State

```
(lldb) v self._isPresented           # @State backing store
(lldb) v self._items                 # @State backing store
(lldb) v self.viewModel.propertyName # @Observable model
(lldb) expr Self._printChanges()     # What triggered re-render (inside body)
```

If a property changes (confirmed with `v`) but the view doesn't re-render, check which thread the mutation happens on with `bt`. `@Observable` mutations must happen on `@MainActor`.

### Inspecting Actors

```
(lldb) v actor    # Shows all stored properties
```

Works because LLDB pauses the entire process. Actor isolation is compile-time only.

### Breakpoint Strategies

**Source breakpoints:**
```
(lldb) breakpoint set -f File.swift -l 42
(lldb) b File.swift:42                           # Short form
```

**Conditional:**
```
(lldb) breakpoint set -f File.swift -l 42 -c "value == nil"
(lldb) breakpoint set -f File.swift -l 42 -c "index > 100"
```

**Ignore count (skip first N hits):**
```
(lldb) breakpoint set -f File.swift -l 42 -i 50
```

**One-shot (auto-delete after hit):**
```
(lldb) breakpoint set -f File.swift -l 42 -o
```

**Logpoints (log without stopping):**
```
(lldb) breakpoint set -f File.swift -l 42
(lldb) breakpoint command add 1
> v self.value
> continue
> DONE
```

**Symbolic (by function name):**
```
(lldb) breakpoint set -n viewDidLoad
(lldb) breakpoint set -n "MyClass.myMethod"
(lldb) breakpoint set -S layoutSubviews          # ObjC selector
(lldb) breakpoint set -r "viewDid.*"             # Regex
```

**Watchpoints (break on value change):**
```
(lldb) watchpoint set variable self.count
(lldb) watchpoint set variable -w read_write myGlobal
```

Hardware-backed, limited to ~4 per process.

**Managing:**
```
(lldb) breakpoint list
(lldb) breakpoint disable 3
(lldb) breakpoint enable 3
(lldb) breakpoint delete 3
(lldb) breakpoint modify 3 -c "x > 10"
```

### Thread and Backtrace

```
(lldb) bt                         # Current thread backtrace
(lldb) bt 10                      # Limit to 10 frames
(lldb) bt all                     # All threads
(lldb) thread list                # All threads with state
(lldb) thread info                # Current thread + stop reason
(lldb) thread select 3            # Switch to thread 3
(lldb) frame info                 # Current frame details
(lldb) frame select 5             # Jump to frame 5
(lldb) up                         # Go up one frame (toward caller)
(lldb) down                       # Go down one frame
(lldb) thread return              # Force early return (void)
(lldb) thread return 42           # Force return with value
```

### Process Control

```
(lldb) continue                   # Resume (c)
(lldb) process interrupt          # Pause running process
(lldb) n                          # Step over (next)
(lldb) s                          # Step into
(lldb) finish                     # Step out
(lldb) ni                         # Step over one instruction
(lldb) process attach --pid 1234  # Attach to running process
(lldb) process attach --name MyApp
(lldb) process detach             # Detach without killing
```

### ObjC Expressions for Swift Debugging

```
(lldb) expr -l objc -- (void)[[[UIApplication sharedApplication] keyWindow] recursiveDescription]
(lldb) expr -l objc -- (void)[CATransaction flush]
(lldb) expr -l objc -- (int)[[UIApplication sharedApplication] _isForeground]
```

### Memory and Image Lookup

```
(lldb) memory read 0x100abc123               # Read memory at address
(lldb) memory read -c 64 -f x 0x100abc123   # 64 bytes as hex
(lldb) image lookup -a 0x100abc123           # Symbol at address
(lldb) image lookup -n myFunction            # Find function by name
(lldb) image lookup -rn "MyClass.*"          # Regex search
(lldb) image list                            # All loaded frameworks
```

### Register Reading (Release-Only Crashes)

```
(lldb) register read
(lldb) register read x0 x1 x2
```

ARM64 convention: `x0` = self/return value, `x1`-`x7` = first 7 arguments.

### Async/Concurrency Debugging

Swift concurrency backtraces include `swift_task_switch`, `_dispatch_call_block_and_release`, and executor internals. Focus on frames from YOUR module.

```
(lldb) bt all                    # Find threads with swift_task frames
(lldb) v self                    # Inspect actor state (safe -- LLDB pauses everything)
```

### Release-Only Crash Debugging

1. Build Debug config with Release-like settings: `-O` optimization, `dwarf-with-dsym`
2. Enable Address Sanitizer (`-fsanitize=address`)
3. Set exception breakpoints
4. If variable shows `<optimized out>`: per-file `-Onone` in Build Settings
5. Last resort: `register read x0 x1 x2`

### .lldbinit Customization

Add to `~/.lldbinit`:

```
# Quick reload UI changes
command alias flush expr -l objc -- (void)[CATransaction flush]

# Print view hierarchy
command alias views expr -l objc -- (void)[[[UIApplication sharedApplication] keyWindow] recursiveDescription]

# Print auto layout constraints
command alias constraints po [[UIWindow keyWindow] _autolayoutTrace]

# Custom type summary
type summary add CLLocationCoordinate2D --summary-string "${var.latitude}, ${var.longitude}"
```

Per-project: Edit Scheme -> Run -> Options -> "LLDB Init File"

### Troubleshooting LLDB Itself

| Problem | Fix |
|---------|-----|
| "expression failed to parse" | Use `v` instead; or `expr -l objc --` for ObjC types |
| "variable not available" | Debug build, per-file `-Onone`, or `register read` |
| "wrong language mode" | `settings set target.language swift` |
| "expression caused a crash" | Use `v` for read-only; avoid mutating state |
| LLDB hangs on `po` | Ctrl+C to cancel, use `v` instead |
| Breakpoint not hit | Verify Debug config, correct file/line, code path reached |

---

## Diagnostics

### Debug Session Checklist

**Before starting:**
- [ ] Debug build configuration (not Release)
- [ ] Exception breakpoints enabled (Swift Error + ObjC Exception)
- [ ] Breakpoint set before suspected problem area
- [ ] Know which command: `v` for values, `p` for computed, `po` for descriptions

**During session:**
- [ ] Read stop reason (`thread info`)
- [ ] Get backtrace (`bt`) -- find your frame
- [ ] Navigate to your frame (`frame select N`)
- [ ] Inspect relevant state (`v self`, `v localVar`)
- [ ] Understand the cause before writing any fix

**After finding issue:**
- [ ] Set conditional breakpoint to catch recurrence
- [ ] Consider adding assertion/precondition
- [ ] Remove temporary breakpoints

### Common Useful Breakpoints

```
(lldb) breakpoint set -E swift                                    # Swift errors
(lldb) breakpoint set -E objc                                     # ObjC exceptions
(lldb) breakpoint set -n UIViewAlertForUnsatisfiableConstraints    # Auto Layout issues
(lldb) breakpoint set -n swift_willThrow                           # Swift throw
```

### Print Command Decision

```
Need to inspect something?
├─ Stored property or local variable?
│  └─ v self.property / v localVar
├─ Computed property or function result?
│  └─ p self.computedValue / p someFunc()
├─ Class with good debug description?
│  └─ po myObject
├─ Need to modify state?
│  └─ expr self.flag = true
└─ Everything failing?
   └─ v self (always works inside a method)
```

---

## Related

For build failures, environment diagnostics, and TestFlight crash triage, load `ax-build`.
