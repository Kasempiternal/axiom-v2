---
name: ax-foundation-models-ref
description: Complete Foundation Models API reference -- LanguageModelSession, @Generable, @Guide, Tool protocol, streaming, dynamic schemas, built-in use cases, and all WWDC 2025 code examples
license: MIT
---
# Foundation Models Framework — API Reference

## Quick Patterns

### LanguageModelSession
```swift
import FoundationModels

// Basic
let session = LanguageModelSession()

// With instructions
let session = LanguageModelSession(instructions: "You are a helpful assistant.")

// With tools
let session = LanguageModelSession(tools: [GetWeatherTool()], instructions: "Help with weather.")

// With use case adapter
let session = LanguageModelSession(model: SystemLanguageModel(useCase: .contentTagging))
```

### respond Methods
```swift
// Plain text
let response = try await session.respond(to: "Write a haiku")
response.content // String

// Structured output
let response = try await session.respond(to: "Generate a person", generating: Person.self)
response.content // Person

// With options
let response = try await session.respond(to: prompt, options: GenerationOptions(sampling: .greedy))

// Streaming
let stream = session.streamResponse(to: prompt, generating: Itinerary.self)
for try await partial in stream { self.itinerary = partial }
```

### SystemLanguageModel
```swift
SystemLanguageModel.default.availability      // .available | .unavailable(reason)
SystemLanguageModel.default.supportedLanguages // [Locale.Language]
SystemLanguageModel(useCase: .contentTagging)  // Built-in adapter
```

---

## Decision Tree

```
Looking up Foundation Models API?
|
+-- Session creation/config?   -> LanguageModelSession section
+-- Structured output?         -> @Generable + @Guide section
+-- Streaming?                 -> Streaming section
+-- External data integration? -> Tool Protocol section
+-- Runtime-defined schema?    -> Dynamic Schemas section
+-- Sampling/temperature?      -> Generation Options section
+-- Content tagging?           -> Built-in Use Cases section
+-- Error handling?            -> Error Handling section
+-- Performance tuning?        -> Performance section
+-- Availability check?        -> Availability section
```

---

## Anti-Patterns

### Skipping availability check before session creation
Always check `SystemLanguageModel.default.availability` first. Session creation on unsupported device crashes.

### Interpolating user input into instructions
Instructions are developer-controlled. User input goes in prompts only. Mixing them enables prompt injection.

### Nested types missing @Generable
Every type in a @Generable graph must also be @Generable. Arrays of non-Generable types compile but fail at runtime.

### Using index-based identity in streaming ForEach
`ForEach(items.indices, id: \.self)` breaks animations during streaming. Use `ForEach(items, id: \.id)`.

---

## Deep Patterns

### LanguageModelSession

**Instructions vs Prompts**: Instructions define model role (developer, static, first transcript entry). Prompts carry user input (dynamic, each `respond()` call). Model trained to obey instructions over prompts (security feature).

**Multi-turn**: Session retains transcript automatically. Each `respond()` adds entry. Model uses full transcript for context. Inspect via `session.transcript.entries`.

**isResponding**: Gate UI to prevent concurrent requests:
```swift
Button("Go!") {
    Task { haiku = try await session.respond(to: prompt).content }
}.disabled(session.isResponding)
```
*WWDC 286:18:22*

**Transcript**: Access `session.transcript.entries` for debugging, UI display, export, or condensing for context management.

### @Generable Macro

**Constrained decoding**: Macro generates schema at compile-time. During generation, framework masks invalid tokens. Model can only produce tokens valid per schema. Guarantees structural correctness -- no hallucinated keys, no invalid JSON, no parsing errors. *WWDC 286*

**Supported types**: `String`, `Int`, `Float`, `Double`, `Decimal`, `Bool`, arrays, nested @Generable types, enums with associated values, recursive types. *WWDC 286:6:18*

**On structs**:
```swift
@Generable
struct Person {
    let name: String
    let age: Int
}
```
*WWDC 301:8:14*

**On enums** (with associated values):
```swift
@Generable
struct NPC {
    let name: String
    let encounter: Encounter

    @Generable
    enum Encounter {
        case orderCoffee(String)
        case wantToTalkToManager(complaint: String)
    }
}
```
*WWDC 301:10:49*

**Property order**: Generated in declaration order. Later properties can reference earlier ones. Summaries best as last property. For streaming, put most important properties first. *WWDC 286:11:00*

### @Guide Constraints

```swift
@Generable
struct NPC {
    @Guide(description: "A full name")
    let name: String

    @Guide(.range(1...10))
    let level: Int

    @Guide(.count(3))
    let attributes: [String]

    @Guide(.maximumCount(5))
    let inventory: [String]
}
```

Constraint types: `description:` (natural language), `.range()` (numeric bounds), `.count()` (exact array length), `.maximumCount()` (max array length), `Regex` (pattern matching). All enforced via constrained decoding -- model cannot produce out-of-range values. *WWDC 301:11:20*

### Streaming (PartiallyGenerated)

**Snapshot streaming** (not delta): Framework streams `PartiallyGenerated` types where all properties are optional, filling in progressively. *WWDC 286:9:20*

```swift
// Auto-generated by @Generable macro:
extension Itinerary {
    struct PartiallyGenerated {
        var name: String?
        var days: [DayPlan]?
    }
}
```

**SwiftUI integration**:
```swift
struct ItineraryView: View {
    let session: LanguageModelSession
    @State private var itinerary: Itinerary.PartiallyGenerated?

    var body: some View {
        VStack {
            if let name = itinerary?.name { Text(name).font(.title) }
            if let days = itinerary?.days {
                ForEach(days, id: \.id) { day in DayView(day: day) }
            }
            Button("Start") {
                Task {
                    let stream = session.streamResponse(to: prompt, generating: Itinerary.self)
                    for try await partial in stream { self.itinerary = partial }
                }
            }
        }
    }
}
```
*WWDC 286:10:05*

### Tool Protocol

```swift
protocol Tool {
    var name: String { get }
    var description: String { get }
    associatedtype Arguments: Generable
    func call(arguments: Arguments) async throws -> ToolOutput
}
```

**Example** (GetWeatherTool):
```swift
struct GetWeatherTool: Tool {
    let name = "getWeather"
    let description = "Retrieve the latest weather information for a city"

    @Generable
    struct Arguments {
        @Guide(description: "The city to fetch the weather for")
        var city: String
    }

    func call(arguments: Arguments) async throws -> ToolOutput {
        let places = try await CLGeocoder().geocodeAddressString(arguments.city)
        let weather = try await WeatherService.shared.weather(for: places.first!.location!)
        return ToolOutput("\(arguments.city): \(weather.currentWeather.temperature.value) degrees")
    }
}
```
*WWDC 286:13:42*

**ToolOutput forms**: `ToolOutput("natural language string")` or `ToolOutput(GeneratedContent(properties: ["key": value]))`. *WWDC 286:15:03*

**Stateful tools**: Use `class` for state across calls. Instance persists for session lifetime:
```swift
class FindContactTool: Tool {
    var pickedContacts = Set<String>()
    // ...
    func call(arguments: Arguments) async throws -> ToolOutput {
        pickedContacts.insert(contact.givenName)
        return ToolOutput(contact.givenName)
    }
}
```
*WWDC 301:18:47, 301:21:55*

**Naming**: Short readable verbs (`getWeather`, `findContact`). Name and description go verbatim in prompt -- longer = more tokens = more latency. *WWDC 301*

**Behavior**: Can be called multiple times per request, multiple tools in parallel. Model decides autonomously when to call. Arguments guaranteed valid via @Generable. Tool invocation not guaranteed. *WWDC 301*

### Dynamic Schemas

Runtime schema creation with `DynamicGenerationSchema`:

```swift
let questionProp = DynamicGenerationSchema.Property(
    name: "question", schema: DynamicGenerationSchema(type: String.self)
)
let answersProp = DynamicGenerationSchema.Property(
    name: "answers", schema: DynamicGenerationSchema(
        arrayOf: DynamicGenerationSchema(referenceTo: "Answer")
    )
)

let riddleSchema = DynamicGenerationSchema(name: "Riddle", properties: [questionProp, answersProp])
let schema = try GenerationSchema(root: riddleSchema, dependencies: [answerSchema])
let response = try await session.respond(to: "Generate a riddle", schema: schema)
let question = try response.content.value(String.self, forProperty: "question")
```
*WWDC 301:14:50, 301:15:10*

Use @Generable for compile-time safety; DynamicGenerationSchema for runtime flexibility. Both use same constrained decoding guarantees.

### Generation Options

```swift
// Greedy (deterministic) -- tests, demos. Only stable within same model version.
GenerationOptions(sampling: .greedy)

// Temperature -- 0.1-0.5 focused, 1.0 default, 1.5-2.0 creative
GenerationOptions(temperature: 0.5)

// Skip schema re-insertion for subsequent requests with same @Generable type
GenerationOptions(includeSchemaInPrompt: false)
```
*WWDC 301:6:14*

### Built-in Use Cases

**Content tagging adapter**:
```swift
let session = LanguageModelSession(model: SystemLanguageModel(useCase: .contentTagging))

@Generable
struct Top3ActionEmotionResult {
    @Guide(.maximumCount(3)) let actions: [String]
    @Guide(.maximumCount(3)) let emotions: [String]
}

let response = try await session.respond(to: text, generating: Top3ActionEmotionResult.self)
```
*WWDC 286:19:19, 286:19:35*

### Error Handling

Three `LanguageModelSession.GenerationError` cases:
- **`.exceededContextWindowSize`** -- 4096 token limit exceeded. Condense transcript or fresh session.
- **`.guardrailViolation`** -- Content policy triggered. Show graceful message.
- **`.unsupportedLanguageOrLocale`** -- Check `supportedLanguages`.

*WWDC 301:3:37, 301:7:06*

**Context condensation**:
```swift
func condensedSession(from previous: LanguageModelSession) -> LanguageModelSession {
    let entries = previous.transcript.entries
    guard entries.count > 2 else { return LanguageModelSession(transcript: previous.transcript) }
    let condensed = [entries.first!, entries.last!]
    return LanguageModelSession(transcript: Transcript(entries: condensed))
}
```
*WWDC 301:3:55*

**Fallback architecture**: Wrap behind protocol for swappable implementations:
```swift
protocol TextSummarizer { func summarize(_ text: String) async throws -> String }
struct OnDeviceSummarizer: TextSummarizer { /* Foundation Models */ }
struct ServerSummarizer: TextSummarizer { /* Server API fallback */ }
```

---

## Diagnostics

### Availability

```swift
switch SystemLanguageModel.default.availability {
case .available: // proceed
case .unavailable(let reason): // show fallback UI
}
```
Requires: Apple Intelligence device (iPhone 15 Pro+, iPad M1+, Mac Apple silicon), supported region, user opt-in. *WWDC 286:19:56*

### Performance Profiling

Use **Instruments > Foundation Models** template. Metrics: model load time, token counts (input/output), generation time, latency breakdown. *WWDC 286*

**Prewarm**: Create session at init, not on button tap. Saves 1-2s. *WWDC 259*
**includeSchemaInPrompt: false**: Skip for subsequent same-type requests. Saves 10-20% tokens. *WWDC 259*
**Property order**: Important properties first for streaming UX. *WWDC 286:11:00*

### Feedback to Apple

`LanguageModelFeedbackAttachment`: Create with `input`, `output`, `sentiment` (.positive/.negative), `issues` (category + explanation), `desiredOutputExamples`. Encode as JSON, attach to Feedback Assistant report. *WWDC 286:22:13*

### Xcode Playgrounds

Rapid prompt iteration without full app rebuild:
```swift
import FoundationModels
import Playgrounds

#Playground {
    let session = LanguageModelSession()
    let response = try await session.respond(to: "Name for a trip to Japan? Title only")
}
```
*WWDC 286:2:28*

---

## Related

- `ax-foundation-models` -- Patterns, anti-patterns, decision trees, diagnostics
- `ax-coreml` -- CoreML for custom ML models (not LLM)
- WWDC 2025: 286 (Meet Foundation Models), 259, 301 (Deep dive)

## API Quick Reference

| API | Purpose |
|-----|---------|
| `LanguageModelSession` | Main interface: respond, stream, transcript |
| `SystemLanguageModel` | Availability, supported languages, use cases |
| `GenerationOptions` | Sampling (.greedy/.random), temperature, includeSchemaInPrompt |
| `@Generable` | Structured output via constrained decoding |
| `@Guide` | Property constraints (description, range, count, regex) |
| `Tool` protocol | External data integration (name, description, Arguments, call) |
| `ToolOutput` | String or GeneratedContent return from tools |
| `DynamicGenerationSchema` | Runtime schema definition |
| `GenerationError` | exceededContextWindowSize, guardrailViolation, unsupportedLanguageOrLocale |
| `LanguageModelFeedbackAttachment` | Quality feedback to Apple |

**Model specs**: 3B params, 2-bit quantized, 4096 token context (input+output), on-device only, no network, no cost.
