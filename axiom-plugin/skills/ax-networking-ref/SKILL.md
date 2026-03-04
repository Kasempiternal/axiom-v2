---
name: ax-networking-ref
description: Network.framework API reference -- NetworkConnection (iOS 26+), NWConnection (iOS 12+), TLV, Coder, Listener, Browser, Wi-Fi Aware, mobility, security, performance APIs
license: MIT
---

# Network.framework API Reference

## Quick Patterns

### API Evolution
| Year | iOS | Key Features |
|------|-----|---|
| 2018 | 12 | NWConnection, NWListener, NWBrowser, NWPathMonitor |
| 2019 | 13 | User-space networking (30% CPU reduction), TLS 1.3 default |
| 2025 | 26 | NetworkConnection (async/await), TLV, Coder protocol, Wi-Fi Aware |

### When to Use vs URLSession
- **URLSession**: HTTP, HTTPS, WebSocket, simple TCP/TLS streams
- **Network.framework**: UDP, custom protocols, low-level control, peer-to-peer, gaming, streaming

### NetworkConnection API (iOS 26+)
```swift
// Create -- TLS() infers TCP/IP, no explicit start() needed
let conn = NetworkConnection(to: .hostPort(host: "example.com", port: 1029)) { TLS() }

// Send/Receive
try await conn.send(data)
let received = try await conn.receive(exactly: 98).content

// Receive variants
try await conn.receive(atLeast: 1, atMost: 1024).content
try await conn.receive(as: UInt32.self).content // Fixed-size type

// States (async sequence)
for await state in conn.states { /* .preparing, .ready, .waiting, .failed, .cancelled */ }

// Cancel
conn.cancel()
```

### NWConnection API (iOS 12-25)
```swift
let conn = NWConnection(host: "example.com", port: 443, using: .tls)
conn.stateUpdateHandler = { [weak self] state in /* handle states */ }
conn.start(queue: .main)

// Send with pacing
conn.send(content: data, completion: .contentProcessed { [weak self] error in
    self?.sendNext() // Pace: send next only after stack consumed current
})

// Receive
conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, ctx, isComplete, error in
    self?.receiveMore()
}

// Mobility
conn.viabilityUpdateHandler = { isViable in /* route valid? */ }
conn.betterPathUpdateHandler = { hasBetter in /* migrate? */ }
conn.cancel()
```

## Decision Tree

```
Choose API:
+-- iOS 26+ target?
|   +-- Custom protocols/UDP --> NetworkConnection { TLS()/UDP() }
|   +-- Codable messages --> NetworkConnection { Coder(T.self, using: .json) { TLS() } }
|   +-- Message framing --> NetworkConnection { TLV { TLS() } }
|   +-- Accept connections --> NetworkListener { ... }.run { conn in }
|   +-- Peer discovery --> NetworkBrowser(for: .wifiAware(...)).run { }
|
+-- iOS 12+ target?
    +-- TCP/TLS --> NWConnection(host:port:using: .tls)
    +-- UDP --> NWConnection(host:port:using: .udp)
    +-- Accept connections --> NWListener(using:on:)
    +-- Bonjour discovery --> NWBrowser(for: .bonjour(...), using:)
    +-- Network monitoring --> NWPathMonitor()
```

## Anti-Patterns

- Using URLSession for UDP or custom protocols (use Network.framework)
- Missing `[weak self]` in NWConnection callbacks (retain cycle)
- Mixing async/await and callbacks on NetworkConnection
- Not handling `.waiting` state (show UI, framework auto-retries)
- Tearing down connection immediately on viability loss (wait for recovery)

## Deep Patterns

### Protocol Stack Composition (iOS 26+)
```swift
TLS()                                    // TLS over TCP (most common)
UDP()                                    // Raw UDP datagrams
TCP()                                    // Unencrypted TCP stream
QUIC()                                   // TLS + UDP multiplexed
WebSocket { TLS() }                      // WebSocket over TLS
TLV { TLS() }                           // Type-Length-Value framing
Coder(GameMsg.self, using: .json) { TLS() } // Codable serialization
```

### Endpoint Types
```swift
.hostPort(host: "example.com", port: 443)
.service(name: "MyPrinter", type: "_ipp._tcp", domain: "local.", interface: nil)
.unix(path: "/tmp/my.sock")
```

### Custom Parameters
```swift
let conn = NetworkConnection(
    to: .hostPort(host: "example.com", port: 1029),
    using: .parameters {
        TLS { TCP { IP().fragmentationEnabled(false) } }
    }
    .constrainedPathsProhibited(true)  // Respect low data mode
    .expensivePathsProhibited(true)    // No cellular/hotspot
    .multipathServiceType(.handover)    // Multipath TCP
)
```

### TLV Framing (iOS 26+)
Type-Length-Value: 8 bytes overhead per message (UInt32 type + UInt32 length).
```swift
let conn = NetworkConnection(to: endpoint) { TLV { TLS() } }

// Send with type tag
try await conn.send(data, type: MessageType.chat.rawValue)

// Receive with type metadata
let (data, metadata) = try await conn.receive()
switch MyType(rawValue: metadata.type) { ... }
```

### Coder Protocol (iOS 26+)
Eliminates manual JSON encode/decode. Supports `.json` and `.propertyList`.
```swift
let conn = NetworkConnection(to: endpoint) {
    Coder(GameMessage.self, using: .json) { TLS() }
}
try await conn.send(GameMessage.move(row: 1, col: 2)) // No encoding
let msg = try await conn.receive().content // Returns GameMessage
```
Use when you control both ends. Not for non-Swift servers or custom wire formats.

### NetworkListener (iOS 26+)
```swift
try await NetworkListener {
    Coder(GameMessage.self, using: .json) { TLS() }
}.run { connection in
    for try await (msg, _) in connection.messages { /* handle */ }
}
// Automatic subtask per connection, structured cancellation
```

Configuration: `NetworkListener(port: 1029) { }`, `NetworkListener(service: .init(name:type:)) { }`

### NetworkBrowser & Wi-Fi Aware (iOS 26+)
```swift
let endpoint = try await NetworkBrowser(
    for: .wifiAware(.connecting(to: .allPairedDevices, from: .myService))
).run { endpoints in .finish(endpoints.first!) }

let conn = NetworkConnection(to: endpoint) { Coder(T.self, using: .json) { TLS() } }
```
Wi-Fi Aware: peer-to-peer without infrastructure, auto discovery of paired devices.

### NWListener (iOS 12-25)
```swift
let listener = try NWListener(using: .tcp, on: 1029)
listener.service = NWListener.Service(name: "MyApp", type: "_myapp._tcp")
listener.newConnectionHandler = { [weak self] conn in
    conn.stateUpdateHandler = { state in if case .ready = state { self?.handle(conn) } }
    conn.start(queue: .main)
}
listener.stateUpdateHandler = { state in /* .ready, .failed */ }
listener.start(queue: .main)
```

### NWBrowser (iOS 12-25)
```swift
let browser = NWBrowser(for: .bonjour(type: "_http._tcp", domain: nil), using: .tcp)
browser.browseResultsChangedHandler = { results, changes in
    for r in results {
        if case .service(let name, _, _, _) = r.endpoint { /* connect */ }
    }
}
browser.start(queue: .main)
```

### Mobility & Transitions

**Viability** -- connection can send/receive (has valid route):
```swift
conn.viabilityUpdateHandler = { isViable in
    // Don't tear down on false -- framework may recover
}
```

**Better Path** -- alternative network available:
```swift
conn.betterPathUpdateHandler = { hasBetter in
    if hasBetter { migrateToNewConnection() }
}
```

**Multipath TCP**:
```swift
let params = NWParameters.tcp
params.multipathServiceType = .handover   // Seamless WiFi<->cellular
// .interactive = lowest latency, .aggregate = highest throughput
```

**NWPathMonitor** (replaces SCNetworkReachability):
```swift
let monitor = NWPathMonitor()
monitor.pathUpdateHandler = { path in
    path.status == .satisfied    // Network available
    path.usesInterfaceType(.wifi) // On WiFi?
    path.isExpensive             // Cellular/hotspot?
    path.isConstrained           // Low data mode?
}
monitor.start(queue: .global())
```

### Security Configuration

**TLS Version**:
```swift
let tls = NWProtocolTLS.Options()
tls.minimumTLSProtocolVersion = .TLSv12 // Allow 1.2+1.3
let params = NWParameters(tls: tls)
```

**Certificate Pinning** (public key, not full cert -- survives rotation):
```swift
sec_protocol_options_set_verify_block(tls.securityProtocolOptions, { metadata, trust, complete in
    let secTrust = sec_trust_copy_ref(trust).takeRetainedValue()
    SecTrustEvaluateAsyncWithError(secTrust, .main) { _, result, _ in
        guard result else { complete(false); return }
        if PinningConfig.isEnabled {
            let serverKey = SecTrustCopyKey(secTrust)
            complete(pinnedKeys.contains { $0 == serverKey })
        } else { complete(true) } // Enterprise mode
    }
}, .main)
```
Rules: validate system trust first, pin 2+ keys, provide MDM escape hatch.

**Cipher Suites** (usually default is fine):
```swift
tls.tlsCipherSuites = [
    tls_ciphersuite_t(rawValue: 0x1301), // AES_128_GCM_SHA256
    tls_ciphersuite_t(rawValue: 0x1302), // AES_256_GCM_SHA384
]
```

### Performance APIs

**UDP Batching** (30% CPU reduction):
```swift
conn.batch {
    for frame in frames {
        conn.send(content: frame, completion: .contentProcessed { _ in })
    }
} // 100 datagrams = ~1 syscall
```

**ECN (Explicit Congestion Notification)**:
```swift
let ip = NWProtocolIP.Metadata()
ip.ecnFlag = .ect0
let ctx = NWConnection.ContentContext(identifier: "frame", metadata: [ip])
conn.send(content: data, contentContext: ctx, completion: .contentProcessed { _ in })
```

**Service Class** (traffic priority):
```swift
params.serviceClass = .background           // Large downloads
params.serviceClass = .responsiveData       // API calls
params.serviceClass = .realTimeInteractive  // Voice/gaming
```

**TCP Fast Open** (send data in SYN, saves 1 RTT):
```swift
params.allowFastOpen = true
conn.send(content: initialData, contentContext: .defaultMessage, isComplete: false, completion: .idempotent)
conn.start(queue: .main) // Initial data sent in SYN packet
```

## Diagnostics

### State Machine
```
setup -> preparing -> waiting (no network, retries) -> ready -> failed/cancelled
```
- `.preparing`: DNS, TCP SYN, TLS handshake
- `.waiting`: No network, auto-retries when available
- `.ready`: Can send/receive
- `.failed`: Unrecoverable (server refused, TLS failed)

### Logging
Add to Xcode scheme arguments: `-NWLoggingEnabled 1 -NWConnectionLoggingEnabled 1`

### User-Space Networking
Automatic on iOS/tvOS. Moves TCP/UDP stack into app process. ~30% lower CPU, no kernel-to-userspace copy, reduced context switches.

## Related

- `ax-networking` -- Patterns, anti-patterns, diagnostics decision tree, migration guides
- `ax-concurrency` -- async/await, Task cancellation, @MainActor for state updates
- `ax-performance` -- Instruments Network template profiling
- WWDC 2018-715, WWDC 2025-250
