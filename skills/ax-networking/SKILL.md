---
name: ax-networking
description: Network.framework patterns, diagnostics, migration from sockets/URLSession, NWConnection (iOS 12+) and NetworkConnection (iOS 26+) with structured concurrency
license: MIT
---

# Network.framework Networking

## Quick Patterns

### NetworkConnection with TLS (iOS 26+)
```swift
let connection = NetworkConnection(
    to: .hostPort(host: "example.com", port: 1029)
) { TLS() }

func communicate() async throws {
    try await connection.send(Data("Hello".utf8))
    let data = try await connection.receive(exactly: 98).content
}

Task { for await state in connection.states {
    switch state {
    case .ready: print("Connected")
    case .waiting(let e): print("Waiting: \(e)")
    case .failed(let e): print("Failed: \(e)")
    default: break
    }
}}
```

### NetworkConnection UDP (iOS 26+)
```swift
let connection = NetworkConnection(
    to: .hostPort(host: "game.example.com", port: 9000)
) { UDP() }

func sendUpdate() async throws { try await connection.send(gameState) }
```

### TLV Framing (iOS 26+)
```swift
let connection = NetworkConnection(
    to: .hostPort(host: "example.com", port: 1029)
) { TLV { TLS() } }

try await connection.send(data, type: MessageType.chat.rawValue)
let (data, metadata) = try await connection.receive()
// metadata.type gives you the message type (UInt32)
```

### Coder Protocol (iOS 26+)
```swift
let connection = NetworkConnection(
    to: .hostPort(host: "example.com", port: 1029)
) { Coder(GameMessage.self, using: .json) { TLS() } }

try await connection.send(GameMessage.move(row: 1, col: 2)) // No JSON boilerplate
let msg = try await connection.receive().content // Returns GameMessage directly
```

### NWConnection with TLS (iOS 12-25)
```swift
let connection = NWConnection(host: "mail.example.com", port: 993, using: .tls)
connection.stateUpdateHandler = { [weak self] state in
    switch state {
    case .ready: self?.sendData()
    case .waiting(let e): print("Waiting: \(e)") // Don't fail here
    case .failed(let e): print("Failed: \(e)")
    default: break
    }
}
connection.start(queue: .main)

connection.send(content: data, completion: .contentProcessed { [weak self] error in
    self?.sendNextChunk() // Pace with contentProcessed
})
```

### NWConnection UDP Batch (iOS 12-25)
```swift
let connection = NWConnection(host: "stream.example.com", port: 9000, using: .udp)
connection.batch {
    for frame in frames {
        connection.send(content: frame, completion: .contentProcessed { _ in })
    }
} // All sends batched into ~1 syscall, 30% lower CPU
```

### NWListener (iOS 12-25)
```swift
let listener = try NWListener(using: .tcp, on: 1029)
listener.service = NWListener.Service(name: "MyApp", type: "_myservice._tcp")
listener.newConnectionHandler = { [weak self] conn in
    conn.stateUpdateHandler = { state in if case .ready = state { self?.handleClient(conn) } }
    conn.start(queue: .main)
}
listener.start(queue: .main)
```

### NWBrowser Discovery (iOS 12-25)
```swift
let browser = NWBrowser(for: .bonjour(type: "_myservice._tcp", domain: nil), using: .tcp)
browser.browseResultsChangedHandler = { results, _ in
    for result in results {
        if case .service(let name, _, _, _) = result.endpoint { print("Found: \(name)") }
    }
}
browser.start(queue: .main)
```

### NWPathMonitor (replaces SCNetworkReachability)
```swift
let monitor = NWPathMonitor()
monitor.pathUpdateHandler = { path in
    print(path.status == .satisfied ? "Online" : "Offline")
}
monitor.start(queue: .global())
```

## Decision Tree

```
Need networking?
+-- HTTP/HTTPS/WebSocket? --> Use URLSession (NOT Network.framework)
|
+-- iOS 26+ with structured concurrency?
|   +-- TCP+TLS --> NetworkConnection { TLS() }
|   +-- UDP --> NetworkConnection { UDP() }
|   +-- Message boundaries --> NetworkConnection { TLV { TLS() } }
|   +-- Codable objects --> NetworkConnection { Coder(T.self, using: .json) { TLS() } }
|   +-- Accept connections --> NetworkListener
|   +-- Peer discovery --> NetworkBrowser (Wi-Fi Aware)
|
+-- iOS 12-25 (completion handlers)?
    +-- TCP+TLS --> NWConnection(host:port:using: .tls)
    +-- UDP batch --> NWConnection + connection.batch {}
    +-- Accept connections --> NWListener
    +-- Peer discovery --> NWBrowser (Bonjour)

Quick selection:
  Gaming (low latency) --> UDP patterns
  Messaging (reliable) --> TLS patterns
  Mixed message types --> TLV or Coder
  Peer-to-peer --> Discovery + Listener
```

## Anti-Patterns

### SCNetworkReachability before connecting
```swift
// WRONG: Race condition -- network changes between check and connect
if SCNetworkReachabilityGetFlags(reachability, &flags) {
    connection.start() // May fail even though reachability said OK
}
// FIX: Just connect. Handle .waiting state for "no network" UI.
```

### Blocking sockets on main thread
```swift
// WRONG: Guaranteed ANR, App Store rejection
connect(socket, &addr, addrlen) // Blocks 200-500ms minimum
// FIX: Use NWConnection (non-blocking) or dispatch to background queue
```

### Manual DNS with getaddrinfo
```swift
// WRONG: Misses Happy Eyeballs, proxies, VPN detection
getaddrinfo("example.com", "443", &hints, &results)
// FIX: Use hostname with NWConnection/NetworkConnection -- framework handles DNS
```

### Hardcoded IP addresses
```swift
// WRONG: Breaks proxy/VPN, fails on IPv6-only cellular
let host = "192.168.1.1"
// FIX: Use hostname. Framework resolves A + AAAA, tries IPv6 first, falls back.
```

### Ignoring .waiting state
```swift
// WRONG: Shows "failed" in Airplane Mode instead of "waiting"
connection.stateUpdateHandler = { state in
    if case .ready = state { /* only handle ready */ }
}
// FIX: Handle .waiting with "Waiting for network..." UI. Auto-retries when network returns.
```

### Missing [weak self] in NWConnection handlers
```swift
// WRONG: Retain cycle -- connection -> handler -> self -> connection
connection.send(content: data, completion: .contentProcessed { error in
    self.handleSend(error)
})
// FIX: Use [weak self] in all NWConnection callbacks. Not needed with NetworkConnection async/await.
```

### Mixing async/await and callbacks (iOS 26+)
```swift
// WRONG: NetworkConnection designed for pure async/await
connection.send(data) // async
connection.stateUpdateHandler = { ... } // callback -- don't mix
// FIX: Use connection.states async sequence for state, await for send/receive.
```

### Sending without pacing
```swift
// WRONG: Memory spike, congestion
for frame in frames { connection.send(content: frame, completion: .contentProcessed { _ in }) }
// FIX: Wait for contentProcessed before sending next. Or use async/await (natural backpressure).
```

## Deep Patterns

### Network Transitions (WiFi to Cellular)
40% of connection failures happen during transitions. For NWConnection:
```swift
connection.viabilityUpdateHandler = { viable in
    if !viable { /* show reconnecting UI, don't tear down immediately */ }
}
connection.betterPathUpdateHandler = { hasBetter in
    if hasBetter { /* migrate to new connection */ }
}
```
For NetworkConnection (iOS 26+), monitor `connection.states` async sequence.

### Custom TLS Parameters
```swift
// Low data mode support
let connection = NetworkConnection(
    to: .hostPort(host: "example.com", port: 1029),
    using: .parameters {
        TLS { TCP { IP().fragmentationEnabled(false) } }
    }.constrainedPathsProhibited(true)
)
```

### Manual Length-Prefix Framing (iOS 12-25)
When TLV is unavailable, prefix each message with UInt32 length:
```swift
// Send: length (4 bytes big-endian) + message
var length = UInt32(message.count).bigEndian
let lengthData = Data(bytes: &length, count: 4)
connection.send(content: lengthData, completion: .contentProcessed { _ in
    connection.send(content: message, completion: .contentProcessed { _ in })
})

// Receive: read 4 bytes -> decode length -> read that many bytes
connection.receive(minimumIncompleteLength: 4, maximumLength: 4) { lengthData, _, _, _ in
    let len = lengthData!.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
    connection.receive(minimumIncompleteLength: Int(len), maximumLength: Int(len)) { msg, _, _, _ in
        // Complete message received
    }
}
```

### Migration Mappings

**BSD Sockets to NWConnection:**
| BSD Sockets | NWConnection |
|---|---|
| `socket() + connect()` | `NWConnection(host:port:using:) + start()` |
| `send() / sendto()` | `connection.send(content:completion:)` |
| `recv() / recvfrom()` | `connection.receive(min:max:completion:)` |
| `bind() + listen()` | `NWListener(using:on:)` |
| `accept()` | `listener.newConnectionHandler` |
| `getaddrinfo()` | Let NWConnection handle DNS |
| `SCNetworkReachability` | `.waiting` state handler |

**NWConnection to NetworkConnection (iOS 26+):**
| NWConnection | NetworkConnection |
|---|---|
| `stateUpdateHandler = { }` | `for await state in connection.states` |
| `send(content:completion:)` | `try await connection.send()` |
| `receive(min:max:completion:)` | `try await connection.receive()` |
| `[weak self]` everywhere | Not needed (Task cancellation) |
| Manual JSON encode/decode | `Coder(T.self, using: .json)` |
| Custom framer | `TLV { TLS() }` |

## Diagnostics

### Enable Logging First
Add to Xcode scheme arguments: `-NWLoggingEnabled 1 -NWConnectionLoggingEnabled 1`

### Quick Reference

| Symptom | Likely Cause | First Check |
|---|---|---|
| Stuck in .preparing >5s | DNS failure | `nslookup hostname` |
| .waiting immediately | No connectivity | Airplane Mode? |
| .failed POSIX 61 | Connection refused | Server listening? |
| .failed POSIX 50 | Network down | Interface active? |
| TLS error -9806 | Certificate invalid | `openssl s_client -connect host:443` |
| TLS error -9801 | Protocol version | Server supports TLS 1.2+? |
| Send OK, no data arrives | Framing problem | Packet capture (Charles/Wireshark) |
| Latency increasing | No send pacing | Use contentProcessed callback |
| High CPU | No UDP batching | Use connection.batch {} |
| Memory growing | Connection/retain leak | Check [weak self], cancel() on deinit |
| Works WiFi, fails cellular | IPv6-only network | `dig AAAA hostname`, use hostname not IP |
| Works without VPN, fails with | Proxy/DNS interference | Check PAC file, test direct |

### POSIX Error Codes
```swift
if case .failed(let error) = state {
    switch (error as NSError).code {
    case 61: print("ECONNREFUSED -- server not listening")
    case 50: print("ENETDOWN -- interface disabled")
    case 60: print("ETIMEDOUT -- firewall/DNS issue")
    case 65: print("EHOSTUNREACH -- IPv6/routing issue")
    case 54: print("ECONNRESET -- connection reset by peer")
    default: print("Error: \(error)")
    }
}
```

### TLS Diagnosis
```bash
# Verify certificate
openssl s_client -connect example.com:443 -showcerts
# Check expiration
openssl s_client -connect example.com:443 | openssl x509 -noout -dates
# Test specific TLS version
openssl s_client -connect example.com:443 -tls1_2
# ATS diagnostics (macOS)
nscurl --ats-diagnostics https://example.com
```

### ATS (App Transport Security)
ATS applies to URLSession/WKWebView, NOT Network.framework. If URLSession fails but NWConnection works, ATS is the cause.
```xml
<!-- Allow specific HTTP domain (never use NSAllowsArbitraryLoads) -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>legacy-api.example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

### Mandatory Testing Checklist
- [ ] Real device (not just simulator -- different networking stack)
- [ ] WiFi to cellular transition
- [ ] Airplane Mode toggle
- [ ] IPv6-only network (some carriers)
- [ ] Corporate VPN active
- [ ] Low signal conditions

## Related

- `ax-networking-ref` -- Complete Network.framework API reference with WWDC examples
- `ax-concurrency` -- async/await patterns, Task cancellation, @MainActor
- `ax-performance` -- Instruments profiling including Network template
