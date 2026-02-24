---
name: ax-foundation-models
description: On-device AI with Apple Foundation Models framework — sessions, @Generable structured output, streaming, tool calling, context management, and diagnostics. iOS 26+
license: MIT
---
# Foundation Models — On-Device AI for Apple Platforms

## Quick Patterns

### Basic Session
```swift
import FoundationModels

let session = LanguageModelSession(instructions: "You are a helpful assistant.")
let response = try await session.respond(to: userInput)
response.content // plain String
```

### @Generable Structured Output
```swift
@Generable
struct Person {
    @Guide(description: "Full name")
    let name: String
    @Guide(.range(1...120))
    let age: Int
}

let response = try await session.respond(to: "Generate a person", generating: Person.self)
response.content // type-safe Person
```

### Streaming
```swift
let stream = session.streamResponse(to: prompt, generating: Itinerary.self)
for try await partial in stream {
    self.itinerary = partial // PartiallyGenerated — all properties optional
}
```

### Tool Calling
```swift
struct GetWeatherTool: Tool {
    let name = "getWeather"
    let description = "Retrieve latest weather for a city"

    @Generable
    struct Arguments {
        @Guide(description: "The city to fetch weather for")
        var city: String
    }

    func call(arguments: Arguments) async throws -> ToolOutput {
        let weather = try await WeatherService.shared.weather(for: /* geocoded location */)
        return ToolOutput("\(arguments.city): \(weather.currentWeather.temperature.value) degrees")
    }
}

let session = LanguageModelSession(tools: [GetWeatherTool()])
```

### Availability Check (mandatory)
```swift
switch SystemLanguageModel.default.availability {
case .available:
    let session = LanguageModelSession()
case .unavailable(let reason):
    // Show: "AI features require Apple Intelligence"
}
```

### Error Handling (mandatory)
```swift
do {
    let response = try await session.respond(to: prompt)
} catch LanguageModelSession.GenerationError.exceededContextWindowSize {
    session = condensedSession(from: session) // see Context Management
} catch LanguageModelSession.GenerationError.guardrailViolation {
    showMessage("I can't help with that request")
} catch LanguageModelSession.GenerationError.unsupportedLanguageOrLocale {
    showMessage("Language not supported")
}
```

---

## Decision Tree

```
Need on-device AI?
|
+-- World knowledge / complex reasoning?
|   NO -> Use server LLM (ChatGPT, Claude, Gemini)
|   Reason: 3B param model, not trained for encyclopedic knowledge
|
+-- Summarization / extraction / classification?
|   YES -> Foundation Models
|   |
|   +-- Plain text output?     -> Basic Session
|   +-- Structured output?     -> @Generable
|   +-- Content tagging?       -> contentTagging adapter
|   +-- External data needed?  -> Tool calling
|   +-- Long generation (>1s)? -> Streaming
|   +-- Runtime-defined schema? -> DynamicGenerationSchema
|
+-- Generation fails?
|   +-- exceededContextWindowSize -> Condense transcript
|   +-- guardrailViolation        -> Graceful message
|   +-- unsupportedLanguageOrLocale -> Check supportedLanguages
|
+-- Too slow?
|   +-- First request slow (1-2s) -> Prewarm session at init
|   +-- User waits 3-5s           -> Add streaming
|   +-- Repeated same schema      -> includeSchemaInPrompt: false
|   +-- Massive prompt             -> Break into smaller tasks
|
+-- UI frozen?
    -> Wrap in Task {} (never call respond() on main thread)
```

---

## Anti-Patterns

### Using for World Knowledge
The on-device model is 3B parameters optimized for summarization, extraction, classification. Asking "What's the capital of France?" produces hallucinations. Use server LLMs for world knowledge, or provide facts via Tool calling.

### Manual JSON Parsing
Prompting for JSON and parsing with JSONDecoder leads to hallucinated keys, invalid JSON, crashes. Use `@Generable` -- constrained decoding masks invalid tokens and guarantees structure.

### Single Huge Prompt
4096 token context window (input + output combined). One massive prompt exceeds the limit and yields poor quality. Break into focused tasks: extract vendor, then extract line items separately.

### Blocking Main Thread
`session.respond()` is async but wrapping it synchronously freezes UI for 1-5 seconds. Always wrap in `Task {}`.

### Ignoring Availability
Foundation Models only runs on Apple Intelligence devices in supported regions with user opt-in. Always check `SystemLanguageModel.default.availability` before creating a session.

### Not Handling Generation Errors
Three errors MUST be caught: `exceededContextWindowSize`, `guardrailViolation`, `unsupportedLanguageOrLocale`. Unhandled = production crash.

### Interpolating User Input into Instructions
Instructions define model role (developer-controlled). Prompts carry user input. Never interpolate user text into instructions -- prompt injection risk.

---

## Deep Patterns

### @Generable Details

**Supported types**: `String`, `Int`, `Float`, `Double`, `Bool`, arrays, nested `@Generable` types, enums with associated values, recursive types.

**@Guide constraints**: descriptions, `.range()`, `.count()`, `.regex()`. Enforced during generation via constrained decoding -- model cannot produce out-of-range values. Validate business logic on the result since model may produce semantically wrong but structurally valid output.

**Property order matters**: properties generated in declaration order. Later properties can reference earlier ones. Put most important properties first for streaming. Summaries work best as last property.

### Streaming with PartiallyGenerated

`@Generable` macro auto-generates a `PartiallyGenerated` type where all properties are optional (fill in as model generates). Use stable identity for arrays in SwiftUI:

```swift
ForEach(days, id: \.id) { day in DayView(day: day) }   // stable
ForEach(days.indices, id: \.self) { ... }               // breaks animations
```

Handle mid-stream errors gracefully -- partial results may already be displayed.

### Tool Calling Flow

1. Session initialized with tools
2. User prompt received
3. Model decides it needs external data
4. Model generates tool call with @Generable arguments
5. Framework calls your `call()` method
6. Tool output inserted into transcript
7. Model generates final response using tool output

Model autonomously decides when and how often to call tools, can call multiple per request. Guaranteed: valid tool names, valid arguments. Not guaranteed: tool will be called, specific argument values.

Use `class` (not `struct`) for stateful tools that maintain state across calls.

### Context Management (4096 token window)

~3 chars per token in English. 4096 tokens ~ 12,000 chars ~ 2,000-3,000 words total.

**Condense transcript** when `exceededContextWindowSize` is caught:
```swift
func condensedSession(from previous: LanguageModelSession) -> LanguageModelSession {
    let entries = previous.transcript.entries
    guard entries.count > 2 else {
        return LanguageModelSession(transcript: previous.transcript)
    }
    // Keep first (instructions) + last (recent context)
    let condensed = [entries.first!, entries.last!]
    return LanguageModelSession(transcript: Transcript(entries: condensed))
}
```

Prevention: concise prompts, tools for data instead of embedding in prompt, break complex tasks into steps.

### Sampling & Generation Options

| Goal | Setting | Use Cases |
|------|---------|-----------|
| Deterministic | `.greedy` | Unit tests, demos, consistency-critical |
| Focused | `temperature: 0.5` | Fact extraction, classification |
| Balanced | `temperature: 1.0` (default) | General use |
| Creative | `temperature: 2.0` | Story generation, brainstorming |

Greedy determinism only holds for same model version. OS updates may change output.

### Performance Optimization

1. **Prewarm session** at init, not on button tap -- saves 1-2s on first generation
2. **`includeSchemaInPrompt: false`** on subsequent requests with same @Generable type -- saves 10-20% tokens
3. **Property order** for streaming -- user sees title in 0.2s instead of waiting 2.5s
4. **Instruments > Foundation Models** template for profiling latency and token counts

### Foundation Models vs Server LLMs

| Factor | Foundation Models | Server LLM |
|--------|------------------|------------|
| Privacy | On-device, no data leaves | Data sent to server |
| Cost | Free | Per-API-call cost |
| Offline | Works offline | Requires internet |
| Latency | <100ms startup | 500-2000ms network |
| Knowledge | Summarize/extract/classify | World knowledge, complex reasoning |
| Context | 4096 tokens | 128K+ tokens |

---

## Diagnostics

### Mandatory First Steps (before changing code)

```swift
// 1. Availability
let availability = SystemLanguageModel.default.availability // .available or .unavailable(reason)

// 2. Language support
let supported = SystemLanguageModel.default.supportedLanguages
// Check: Locale.current.language in supported?

// 3. Context usage
// session.transcript.entries.count and approximate char count
// 4096 token limit ~ 12,000 chars

// 4. Profile with Instruments > Foundation Models template
```

### Symptom Table

| Symptom | Likely Cause | Fix | Time |
|---------|-------------|-----|------|
| Won't start (.unavailable) | Device/region/opt-in | Availability check + fallback UI | 5-10 min |
| exceededContextWindowSize | >4096 tokens | Condense transcript | 15 min |
| guardrailViolation | Content policy triggered | Graceful message | 5 min |
| unsupportedLanguageOrLocale | Wrong language | Check supportedLanguages | 10 min |
| Hallucinated facts | Wrong use case | Use server LLM or add Tools | 20-30 min |
| Wrong structure / parsing crash | Manual JSON | Switch to @Generable | 10 min |
| Missing data in output | No external data | Implement Tool calling | 20-30 min |
| Different output each time | Random sampling | Use `.greedy` or lower temperature | 2-5 min |
| Initial 1-2s delay | Model loading | Prewarm session at init | 10 min |
| User waits 3-5s | Not streaming | Add streamResponse | 15-20 min |
| Schema overhead on repeat | Re-inserting schema | `includeSchemaInPrompt: false` | 2 min |
| >5s generation, poor quality | Prompt too complex | Break into smaller tasks | 20-30 min |
| UI frozen | Main thread blocking | Wrap in `Task {}` | 5 min |

### Production Crisis Protocol

If 20%+ users report "AI doesn't work" after launch:
1. **Identify** (5 min): Check `SystemLanguageModel.default.availability` on multiple devices
2. **Confirm** (5 min): Map affected devices -- likely non-Apple-Intelligence hardware
3. **Fix** (15 min): Add availability check + graceful fallback UI with "Use Standard Mode" option
4. **Deploy** (20 min): Test across device generations, submit hotfix

Do NOT disable the feature, roll back, or switch to server API. Diagnose first.

---

## Related

- `ax-foundation-models-ref` -- Complete API reference with all WWDC 2025 code examples
- `ax-coreml` -- CoreML for custom ML models (not LLM)
- WWDC 2025 Sessions: 286 (Meet Foundation Models), 259, 301 (Deep dive)
- Instruments Foundation Models template for profiling

### Checklist Before Shipping

- Availability checked before creating session
- Using @Generable for structured output (not manual JSON)
- All three GenerationErrors handled
- Streaming for generations >1 second
- Not blocking UI (Task {})
- Tools for external data (not prompting model for weather/locations)
- Session prewarmed if latency-sensitive
- Tested on real device + offline + non-Apple-Intelligence device
- Profiled with Instruments
