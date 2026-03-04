---
name: ax-media
description: Now Playing, AVFoundation audio, haptics, photo library, MusicKit, CarPlay, and spatial audio patterns for iOS
license: MIT
---

# Media & Audio

## Quick Patterns

```swift
// NOW PLAYING (iOS 16+ recommended)
let session = MPNowPlayingSession(players: [player])
session.automaticallyPublishNowPlayingInfo = true
session.remoteCommandCenter.playCommand.addTarget { [weak self] _ in
    self?.player.play(); return .success
}
session.remoteCommandCenter.playCommand.isEnabled = true
session.becomeActiveIfPossible { _ in }

// NOW PLAYING (manual, iOS 14+)
try AVAudioSession.sharedInstance().setCategory(.playback, options: [])
try AVAudioSession.sharedInstance().setActive(true)
var info: [String: Any] = [
    MPMediaItemPropertyTitle: "Title",
    MPMediaItemPropertyArtist: "Artist",
    MPMediaItemPropertyPlaybackDuration: duration,
    MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
    MPNowPlayingInfoPropertyPlaybackRate: 1.0  // 1.0=playing, 0.0=paused
]
MPNowPlayingInfoCenter.default().nowPlayingInfo = info

// REMOTE COMMANDS
let cc = MPRemoteCommandCenter.shared()
cc.playCommand.addTarget { [weak self] _ in self?.play(); return .success }
cc.playCommand.isEnabled = true
cc.skipForwardCommand.preferredIntervals = [15.0]

// AUDIO SESSION
try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
try AVAudioSession.sharedInstance().setActive(true)

// AUDIO ENGINE
let engine = AVAudioEngine()
let player = AVAudioPlayerNode()
engine.attach(player)
engine.connect(player, to: engine.mainMixerNode, format: nil)
try engine.start()

// HAPTICS
let impact = UIImpactFeedbackGenerator(style: .medium)
impact.prepare()
impact.impactOccurred()

// PHOTO PICKER (SwiftUI, iOS 16+ - NO permission needed)
@State private var item: PhotosPickerItem?
PhotosPicker(selection: $item, matching: .images) { Text("Select") }

// PHOTO PICKER (UIKit, iOS 14+ - NO permission needed)
var config = PHPickerConfiguration()
config.filter = .images
let picker = PHPickerViewController(configuration: config)

// SAVE TO CAMERA ROLL
let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
try await PHPhotoLibrary.shared().performChanges {
    PHAssetCreationRequest.creationRequestForAsset(from: image)
}

// MUSICKIT (Apple Music)
let player = ApplicationMusicPlayer.shared
player.queue = [song]
try await player.play()  // Now Playing updates automatically
```

## Decision Tree

```
Media task?
|
+-- Now Playing / Lock Screen controls?
|   +-- Using AVPlayer? --> MPNowPlayingSession (iOS 16+, automatic)
|   +-- Custom player? --> Manual MPNowPlayingInfoCenter + MPRemoteCommandCenter
|   +-- MusicKit content? --> ApplicationMusicPlayer handles automatically
|   +-- Info never appears?
|   |   +-- Category .ambient or .mixWithOthers? --> Use .playback without mixWithOthers
|   |   +-- No remote command handlers? --> Add target to at least one command
|   |   +-- Missing UIBackgroundModes audio? --> Add to Info.plist
|   |   +-- setActive(true) not called? --> Activate before playback
|   +-- Commands not responding?
|   |   +-- isEnabled = false? --> Set command.isEnabled = true
|   |   +-- Wrong command center? --> Use session.remoteCommandCenter with MPNowPlayingSession
|   |   +-- Handler not returning .success? --> Return .success
|   +-- State shows wrong play/pause?
|   |   --> Use playbackRate (1.0/0.0), NOT playbackState (macOS only)
|   +-- CarPlay?
|       +-- App not showing? --> Add com.apple.developer.carplay-audio entitlement
|       +-- Same MPNowPlayingInfoCenter as iOS, zero extra code needed
|
+-- Audio playback / recording?
|   +-- Simple playback? --> AVPlayer with .playback category
|   +-- Effects / processing? --> AVAudioEngine pipeline
|   +-- Input device selection (iOS 26+)? --> AVInputPickerInteraction
|   +-- Spatial audio capture (iOS 26+)? --> AVCaptureAudioDataOutput with FOA
|   +-- USB DAC / bit-perfect? --> iOS passthrough by default, no config needed
|
+-- Haptic feedback?
|   +-- Simple tap/toggle? --> UIImpactFeedbackGenerator
|   +-- Selection change (picker)? --> UISelectionFeedbackGenerator
|   +-- Success/warning/error? --> UINotificationFeedbackGenerator
|   +-- Custom pattern / audio sync? --> Core Haptics (CHHapticEngine)
|   +-- Pattern from file? --> AHAP files
|
+-- Photo library?
|   +-- User picks photos? --> PhotosPicker (SwiftUI) or PHPicker (UIKit), NO permission needed
|   +-- Save to camera roll? --> PHPhotoLibrary .addOnly authorization
|   +-- Browse full library? --> PHPhotoLibrary .readWrite authorization
|   +-- User granted limited access? --> presentLimitedLibraryPicker()
|
+-- Apple Music integration?
    +-- Play catalog content? --> ApplicationMusicPlayer (Now Playing automatic)
    +-- Mix own + Apple Music? --> Hybrid player switching between AVPlayer and MusicKit
    +-- Check subscription? --> MusicSubscription.current.canPlayCatalogContent
```

## Anti-Patterns

### Now Playing

```swift
// WRONG: mixWithOthers prevents Now Playing eligibility
try AVAudioSession.sharedInstance().setCategory(.playback, options: .mixWithOthers)

// CORRECT: no mixWithOthers for Now Playing
try AVAudioSession.sharedInstance().setCategory(.playback, options: [])
```

```swift
// WRONG: playbackState is macOS only, iOS ignores it
MPNowPlayingInfoCenter.default().playbackState = .playing

// CORRECT: use playbackRate in nowPlayingInfo dictionary
info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0  // playing
info[MPNowPlayingInfoPropertyPlaybackRate] = 0.0  // paused
```

```swift
// WRONG: updating elapsed time on a timer causes jitter
Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.currentTime().seconds
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
}

// CORRECT: update only at play/pause/seek, system infers from rate + timestamp
func playbackPaused(player: AVPlayer) {
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.currentTime().seconds
    info[MPNowPlayingInfoPropertyPlaybackRate] = 0.0
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
}
```

```swift
// WRONG: partial dictionary replaces all values
var info = [String: Any]()
info[MPMediaItemPropertyTitle] = "New Title"
MPNowPlayingInfoCenter.default().nowPlayingInfo = info  // lost artwork, duration, etc.

// CORRECT: read existing, modify, write back
var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
info[MPMediaItemPropertyTitle] = "New Title"
MPNowPlayingInfoCenter.default().nowPlayingInfo = info
```

```swift
// WRONG: using shared command center with MPNowPlayingSession
let cc = MPRemoteCommandCenter.shared()
cc.playCommand.addTarget { _ in ... }

// CORRECT: use the session's command center
session.remoteCommandCenter.playCommand.addTarget { _ in ... }
```

### AVFoundation

```swift
// WRONG: configure but don't activate
try AVAudioSession.sharedInstance().setCategory(.playback)
// Audio doesn't work!

// CORRECT: always activate
try AVAudioSession.sharedInstance().setCategory(.playback)
try AVAudioSession.sharedInstance().setActive(true)
```

```swift
// WRONG: tap installed, never removed (memory leak)
engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { ... }

// CORRECT: remove tap when done
deinit { engine.inputNode.removeTap(onBus: 0) }
```

```swift
// WRONG: connecting nodes with incompatible formats
engine.connect(playerNode, to: mixerNode, format: wrongFormat)  // crash

// CORRECT: use nil for automatic format negotiation
engine.connect(playerNode, to: mixerNode, format: nil)
```

### Photo Library

```swift
// WRONG: requesting full access when picker suffices
let status = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
if status == .authorized { showPhotoPicker() }

// CORRECT: picker needs no permission
PhotosPicker(selection: $item, matching: .images) { Text("Select") }
```

```swift
// WRONG: treating .limited as denied
if status == .authorized { showGallery() }
else { showPermissionDenied() }  // .limited users locked out!

// CORRECT: handle .limited
case .authorized, .limited: showGallery()
case .denied, .restricted: showPermissionDenied()
```

```swift
// WRONG: UIImagePickerController for photo selection (deprecated)
let picker = UIImagePickerController()
picker.sourceType = .photoLibrary

// CORRECT: PHPickerViewController
var config = PHPickerConfiguration()
config.filter = .images
let picker = PHPickerViewController(configuration: config)
```

### Haptics

```swift
// WRONG: delayed feedback loses causality
performAction()
DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) {
    UIImpactFeedbackGenerator(style: .medium).impactOccurred()  // too late
}

// CORRECT: immediate feedback at interaction moment
UIImpactFeedbackGenerator(style: .medium).impactOccurred()
performAction()
```

## Deep Patterns

### Now Playing: Full Implementation (MPNowPlayingSession, iOS 16+)

```swift
@MainActor
class ModernPlayerService {
    private var player: AVPlayer
    private var session: MPNowPlayingSession?

    init() {
        player = AVPlayer()
        setupSession()
    }

    func setupSession() {
        session = MPNowPlayingSession(players: [player])
        session?.automaticallyPublishNowPlayingInfo = true

        // Register on SESSION's command center, not shared
        session?.remoteCommandCenter.playCommand.addTarget { [weak self] _ in
            self?.player.play(); return .success
        }
        session?.remoteCommandCenter.playCommand.isEnabled = true
        session?.remoteCommandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.player.pause(); return .success
        }
        session?.remoteCommandCenter.pauseCommand.isEnabled = true
        session?.becomeActiveIfPossible { success in
            print("Now Playing active: \(success)")
        }
    }

    func play(track: Track) async {
        let item = AVPlayerItem(url: track.url)
        item.nowPlayingInfo = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artist,
            MPMediaItemPropertyArtwork: await createArtwork(for: track)
        ]
        player.replaceCurrentItem(with: item)
        player.play()
        // Elapsed time, rate, duration published automatically
    }
}
```

### Now Playing: Manual Implementation (iOS 14+)

```swift
@MainActor
class PlayerService {
    private var commandTargets: [Any] = []

    func setupAudioSession() throws {
        try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [])
    }

    func setupCommands() {
        let cc = MPRemoteCommandCenter.shared()

        let playTarget = cc.playCommand.addTarget { [weak self] _ in
            self?.player.play()
            self?.updateState(isPlaying: true)
            return .success
        }
        cc.playCommand.isEnabled = true
        commandTargets.append(playTarget)

        let pauseTarget = cc.pauseCommand.addTarget { [weak self] _ in
            self?.player.pause()
            self?.updateState(isPlaying: false)
            return .success
        }
        cc.pauseCommand.isEnabled = true
        commandTargets.append(pauseTarget)

        cc.skipForwardCommand.preferredIntervals = [15.0]
        let skipFwd = cc.skipForwardCommand.addTarget { [weak self] event in
            guard let e = event as? MPSkipIntervalCommandEvent else { return .commandFailed }
            self?.skip(by: e.interval)
            return .success
        }
        cc.skipForwardCommand.isEnabled = true
        commandTargets.append(skipFwd)
    }

    func playbackStarted(track: Track, player: AVPlayer) {
        try? AVAudioSession.sharedInstance().setActive(true)
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: track.title,
            MPMediaItemPropertyArtist: track.artist,
            MPMediaItemPropertyPlaybackDuration: player.currentItem?.duration.seconds ?? 0,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: player.currentTime().seconds,
            MPNowPlayingInfoPropertyPlaybackRate: 1.0
        ]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func playbackPaused(player: AVPlayer) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = player.currentTime().seconds
        info[MPNowPlayingInfoPropertyPlaybackRate] = 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    func teardownCommands() {
        let cc = MPRemoteCommandCenter.shared()
        cc.playCommand.removeTarget(nil)
        cc.pauseCommand.removeTarget(nil)
        cc.skipForwardCommand.removeTarget(nil)
        commandTargets.removeAll()
    }
}
```

### Now Playing: Artwork (Race-Free)

```swift
@MainActor
class NowPlayingArtworkService {
    private var currentArtworkURL: URL?
    private var artworkTask: Task<Void, Never>?

    func loadArtwork(for track: Track) {
        artworkTask?.cancel()
        currentArtworkURL = track.artworkURL
        artworkTask = Task {
            // Priority: embedded > cached > remote
            if let embedded = await extractEmbeddedArtwork(track.fileURL) {
                guard !Task.isCancelled else { return }
                apply(embedded, for: track.artworkURL); return
            }
            if let cached = await loadFromCache(track.artworkURL) {
                guard !Task.isCancelled else { return }
                apply(cached, for: track.artworkURL); return
            }
            if let remote = await downloadImage(track.artworkURL) {
                guard !Task.isCancelled else { return }
                apply(remote, for: track.artworkURL)
            }
        }
    }

    private func apply(_ image: UIImage, for url: URL) {
        guard url == currentArtworkURL else { return }
        // Swift 6 compliant: capture image value, not stored property
        let artwork = MPMediaItemArtwork(boundsSize: image.size) { [image] _ in image }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
```

### Now Playing: When to Update

| Event | Update |
|-------|--------|
| Playback starts | All metadata + elapsed=current + rate=1.0 |
| Playback pauses | elapsed=current + rate=0.0 |
| User seeks | elapsed=newPosition (keep rate) |
| Track changes | Full metadata refresh |
| Rate changes (2x) | rate=newRate |
| **Never** on timer | System infers from elapsed + rate + timestamp |

### Now Playing: Eligibility Requirements

Three things must work together (WWDC 2022/110338):
1. AVAudioSession with non-mixable category (`.playback` without `.mixWithOthers`)
2. At least one remote command handler registered with target + isEnabled
3. `setActive(true)` called before playback

Info.plist must include `UIBackgroundModes` with `audio`.

### CarPlay Integration

CarPlay reads the same `MPNowPlayingInfoCenter` and `MPRemoteCommandCenter` as iOS. If Now Playing works on iOS, it works in CarPlay with zero additional code.

**Entitlement required**: `com.apple.developer.carplay-audio` in entitlements file.

**Custom buttons** (CPNowPlayingTemplate):

```swift
func templateApplicationScene(
    _ scene: CPTemplateApplicationScene,
    didConnect controller: CPInterfaceController
) {
    let template = CPNowPlayingTemplate.shared
    template.isUpNextButtonEnabled = true
    template.updateNowPlayingButtons([
        CPNowPlayingPlaybackRateButton { _ in self.cycleRate() },
        CPNowPlayingShuffleButton { _ in self.toggleShuffle() },
        CPNowPlayingRepeatButton { _ in self.cycleRepeat() }
    ])
}
```

Configure at `templateApplicationScene(_:didConnect:)`, not when template is pushed.

### MusicKit: ApplicationMusicPlayer

MusicKit's `ApplicationMusicPlayer` automatically publishes to `MPNowPlayingInfoCenter`. Do not manually set `nowPlayingInfo` when playing Apple Music content.

```swift
// Check subscription
let sub = try await MusicSubscription.current
if sub.canPlayCatalogContent { /* full playback */ }
else if sub.canBecomeSubscriber { /* show offer */ }

// Queue management
player.queue = ApplicationMusicPlayer.Queue(album: album)
try await player.skipToNextEntry()
player.state.shuffleMode = .songs
player.state.repeatMode = .all

// Insert into queue
try await player.queue.insert(song, position: .afterCurrentEntry)
```

**Hybrid apps** (own content + Apple Music): switch between AVPlayer (manual Now Playing) and ApplicationMusicPlayer (automatic Now Playing). Pause one before starting the other.

### AVAudioSession Categories

| Category | Use Case | Silent Switch | Background |
|----------|----------|---------------|------------|
| `.ambient` | Game sounds | Silences | No |
| `.soloAmbient` | Default | Silences | No |
| `.playback` | Music, podcast | Ignores | Yes |
| `.record` | Voice recorder | -- | Yes |
| `.playAndRecord` | VoIP, voice chat | Ignores | Yes |
| `.multiRoute` | DJ apps | Ignores | Yes |

**Modes**: `.default`, `.voiceChat`, `.videoChat`, `.gameChat`, `.videoRecording`, `.measurement`, `.moviePlayback`, `.spokenAudio`

**Options**: `.mixWithOthers`, `.duckOthers`, `.allowBluetooth`, `.allowBluetoothA2DP`, `.defaultToSpeaker`, `.allowAirPlay`, `.bluetoothHighQualityRecording` (iOS 26+)

### AVAudioEngine Pipeline

```swift
let engine = AVAudioEngine()
let player = AVAudioPlayerNode()
let reverb = AVAudioUnitReverb()
reverb.loadFactoryPreset(.largeHall)
reverb.wetDryMix = 50

engine.attach(player)
engine.attach(reverb)
engine.connect(player, to: reverb, format: nil)
engine.connect(reverb, to: engine.mainMixerNode, format: nil)
engine.prepare()
try engine.start()

let file = try AVAudioFile(forReading: url)
player.scheduleFile(file, at: nil)
player.play()
```

**Node types**: `AVAudioPlayerNode`, `AVAudioInputNode`, `AVAudioOutputNode`, `AVAudioMixerNode`, `AVAudioUnitEQ`, `AVAudioUnitReverb`, `AVAudioUnitDelay`, `AVAudioUnitDistortion`, `AVAudioUnitTimePitch`

### Audio Taps (Analysis)

```swift
let format = engine.inputNode.outputFormat(forBus: 0)
engine.inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, time in
    guard let data = buffer.floatChannelData?[0] else { return }
    var sum: Float = 0
    for i in 0..<Int(buffer.frameLength) { sum += data[i] * data[i] }
    let dB = 20 * log10(sqrt(sum / Float(buffer.frameLength)))
}
// Always remove: engine.inputNode.removeTap(onBus: 0)
```

### Interruption & Route Change Handling

```swift
// Interruption (phone call, Siri)
NotificationCenter.default.addObserver(
    forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
) { notification in
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
    if type == .began { player.pause() }
    if type == .ended {
        let opts = AVAudioSession.InterruptionOptions(
            rawValue: (info[AVAudioSessionInterruptionOptionKey] as? UInt) ?? 0)
        if opts.contains(.shouldResume) { player.play() }
    }
}

// Route change (headphones unplugged)
NotificationCenter.default.addObserver(
    forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
) { notification in
    guard let info = notification.userInfo,
          let rv = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: rv) else { return }
    if reason == .oldDeviceUnavailable { player.pause() }
}
```

### Bit-Perfect DAC / USB Audio

iOS provides bit-perfect output by default to USB DACs -- no resampling. Passthrough at 44.1/48/96/192 kHz. DSD not supported (use DoP or convert).

```swift
let route = AVAudioSession.sharedInstance().currentRoute
for output in route.outputs {
    if output.portType == .usbAudio { /* USB DAC connected */ }
}
```

### iOS 26+ Spatial Audio Capture (FOA)

```swift
let foaOutput = AVCaptureAudioDataOutput()
foaOutput.spatialAudioChannelLayoutTag = kAudioChannelLayoutTag_HOA_ACN_SN3D  // 4ch

let stereoOutput = AVCaptureAudioDataOutput()
stereoOutput.spatialAudioChannelLayoutTag = kAudioChannelLayoutTag_Stereo     // 2ch

let metadataGenerator = AVCaptureSpatialAudioMetadataSampleGenerator()
// Feed FOA buffers to generator, write metadata track on stop
```

Output: stereo AAC (compatibility) + APAC (spatial) + metadata track. Formats: `.mov`, `.mp4`, `.qta`.

### iOS 26+ AirPods High Quality Recording

```swift
try AVAudioSession.sharedInstance().setCategory(.playAndRecord, options: [
    .bluetoothHighQualityRecording, .allowBluetoothA2DP
])
```

### Haptics: UIFeedbackGenerator

```swift
// Impact (physical tap)
let impact = UIImpactFeedbackGenerator(style: .medium)  // .light/.medium/.heavy/.rigid/.soft
impact.prepare()  // reduces latency, holds engine ~1s
impact.impactOccurred()
impact.impactOccurred(intensity: 0.5)  // iOS 13+

// Selection (picker detent)
let selection = UISelectionFeedbackGenerator()
selection.selectionChanged()

// Notification (success/warning/error)
let notification = UINotificationFeedbackGenerator()
notification.notificationOccurred(.success)  // .success/.warning/.error
```

### Haptics: Core Haptics (Custom Patterns)

```swift
import CoreHaptics

guard CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
let engine = try CHHapticEngine()
engine.stoppedHandler = { reason in try? engine.start() }
engine.resetHandler = { try? engine.start() }
try engine.start()

// Transient event (tap)
let event = CHHapticEvent(
    eventType: .hapticTransient,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 1.0),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.5)
    ],
    relativeTime: 0.0
)

// Continuous event (vibration)
let continuous = CHHapticEvent(
    eventType: .hapticContinuous,
    parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: 0.8),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.3)
    ],
    relativeTime: 0.0, duration: 2.0
)

let pattern = try CHHapticPattern(events: [event, continuous], parameters: [])
let player = try engine.makePlayer(with: pattern)
try player.start(atTime: CHHapticTimeImmediate)

// Looping with dynamic updates
let advPlayer = try engine.makeAdvancedPlayer(with: pattern)
advPlayer.loopEnabled = true
try advPlayer.start(atTime: CHHapticTimeImmediate)
try advPlayer.sendParameters([
    CHHapticDynamicParameter(parameterID: .hapticIntensityControl, value: 0.5, relativeTime: 0)
], atTime: CHHapticTimeImmediate)
```

### Haptics: AHAP Files

```json
{
  "Version": 1.0,
  "Pattern": [
    {
      "Event": {
        "Time": 0.0,
        "EventType": "HapticTransient",
        "EventParameters": [
          { "ParameterID": "HapticIntensity", "ParameterValue": 1.0 },
          { "ParameterID": "HapticSharpness", "ParameterValue": 0.5 }
        ]
      }
    },
    {
      "Event": {
        "Time": 0.0,
        "EventType": "AudioCustom",
        "EventParameters": [
          { "ParameterID": "AudioVolume", "ParameterValue": 0.8 }
        ],
        "EventWaveformPath": "feedback.wav"
      }
    }
  ]
}
```

```swift
let pattern = try CHHapticPattern(contentsOf: Bundle.main.url(forResource: "feedback", withExtension: "ahap")!)
let player = try engine.makePlayer(with: pattern)
try player.start(atTime: CHHapticTimeImmediate)
```

Audio files in AHAP must be under 4.2 MB / 23 seconds.

### Haptic Design Principles (WWDC 2021/10278)

- **Causality**: fire haptic at the exact moment of visual change, not before or after
- **Harmony**: visual + audio + haptic should feel unified (heavy object = heavy haptic + low sound)
- **Utility**: reserve for significant moments; do not haptic every tap or scroll

### Photo Picker: SwiftUI (iOS 16+)

```swift
import PhotosUI

struct ContentView: View {
    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedImage: Image?

    var body: some View {
        PhotosPicker(selection: $selectedItem, matching: .images) {
            Label("Select Photo", systemImage: "photo")
        }
        .onChange(of: selectedItem) { _, newItem in
            Task {
                if let data = try? await newItem?.loadTransferable(type: Data.self),
                   let uiImage = UIImage(data: data) {
                    selectedImage = Image(uiImage: uiImage)
                }
            }
        }
    }
}

// Multi-selection
PhotosPicker(selection: $items, maxSelectionCount: 5, matching: .images) { ... }

// Embedded picker (iOS 17+)
PhotosPicker(selection: $items, selectionBehavior: .continuous, matching: .images) { ... }
    .photosPickerStyle(.inline)
    .photosPickerDisabledCapabilities([.selectionActions])
    .photosPickerAccessoryVisibility(.hidden, edges: .all)

// Preserve HDR (iOS 17+)
PhotosPicker(selection: $items, matching: .images, preferredItemEncoding: .current) { ... }
```

**Filters**: `.images`, `.videos`, `.livePhotos`, `.screenshots`, `.cinematicVideos`, `.bursts`, `.depthEffectPhotos`, `.sloMoVideos`

Combine with `.any(of:)`, `.all(of:)`, `.not()`.

### Photo Picker: UIKit (iOS 14+)

```swift
var config = PHPickerConfiguration()
config.selectionLimit = 1
config.filter = .images
// config.preferredAssetRepresentationMode = .current  // preserve HDR

let picker = PHPickerViewController(configuration: config)
picker.delegate = self
present(picker, animated: true)

// Delegate
func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
    picker.dismiss(animated: true)
    guard let result = results.first else { return }
    result.itemProvider.loadObject(ofClass: UIImage.self) { [weak self] object, error in
        guard let image = object as? UIImage else { return }
        DispatchQueue.main.async { self?.displayImage(image) }
    }
}
```

### Custom Transferable (All Image Formats)

Default `Image` Transferable only supports PNG. Use custom for JPEG/HEIF:

```swift
struct TransferableImage: Transferable {
    let image: UIImage
    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(importedContentType: .image) { data in
            guard let image = UIImage(data: data) else {
                throw TransferError.importFailed
            }
            return TransferableImage(image: image)
        }
    }
    enum TransferError: Error { case importFailed }
}
```

### Limited Library Access

```swift
let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
switch status {
case .limited:
    // Show gallery with limited subset + offer to expand
    PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: viewController)
case .authorized:
    showFullGallery()
case .denied, .restricted:
    showPermissionDenied()
}
```

Suppress automatic prompt with `PHPhotoLibraryPreventAutomaticLimitedAccessAlert = true` in Info.plist.

### Saving Photos

```swift
let status = await PHPhotoLibrary.requestAuthorization(for: .addOnly)
guard status == .authorized || status == .limited else { throw PhotoError.denied }

try await PHPhotoLibrary.shared().performChanges {
    PHAssetCreationRequest.creationRequestForAsset(from: image)
}

// Save to custom album
try await PHPhotoLibrary.shared().performChanges {
    let asset = PHAssetCreationRequest.creationRequestForAsset(from: image)
    guard let placeholder = asset.placeholderForCreatedAsset,
          let albumReq = PHAssetCollectionChangeRequest(for: album) else { return }
    albumReq.addAssets([placeholder] as NSFastEnumeration)
}
```

### PHImageManager (Asset Image Loading)

```swift
let options = PHImageRequestOptions()
options.deliveryMode = .highQualityFormat
options.isNetworkAccessAllowed = true  // iCloud photos

PHImageManager.default().requestImage(
    for: asset, targetSize: CGSize(width: 300, height: 300),
    contentMode: .aspectFill, options: options
) { image, info in
    let isDegraded = (info?[PHImageResultIsDegradedKey] as? Bool) ?? false
    if !isDegraded { /* final image */ }
}
```

Delivery modes: `.opportunistic` (fast then quality), `.highQualityFormat`, `.fastFormat`.

### Observing Photo Library Changes

```swift
class PhotoObserver: NSObject, PHPhotoLibraryChangeObserver {
    var fetchResult: PHFetchResult<PHAsset>?
    init() { super.init(); PHPhotoLibrary.shared().register(self) }
    deinit { PHPhotoLibrary.shared().unregisterChangeObserver(self) }
    func photoLibraryDidChange(_ change: PHChange) {
        guard let fr = fetchResult, let details = change.changeDetails(for: fr) else { return }
        DispatchQueue.main.async { self.fetchResult = details.fetchResultAfterChanges }
    }
}
```

## Diagnostics

### Now Playing Not Appearing

```swift
let session = AVAudioSession.sharedInstance()
print("Category: \(session.category.rawValue)")           // must be .playback
print("Options: \(session.categoryOptions)")               // must NOT have .mixWithOthers
print("Active: \(try? session.setActive(true))")           // must succeed
print("BG mode: check Info.plist UIBackgroundModes=audio")

let cc = MPRemoteCommandCenter.shared()
print("Play enabled: \(cc.playCommand.isEnabled)")         // must be true
print("Pause enabled: \(cc.pauseCommand.isEnabled)")       // must be true

if let info = MPNowPlayingInfoCenter.default().nowPlayingInfo {
    print("Title: \(info[MPMediaItemPropertyTitle] ?? "nil")")
    print("Rate: \(info[MPNowPlayingInfoPropertyPlaybackRate] ?? "nil")")
} else { print("No nowPlayingInfo set!") }
```

| Observation | Likely Cause |
|-------------|-------------|
| Category .ambient or has .mixWithOthers | Not eligible for Now Playing |
| No commands have targets | System ignores app |
| Commands have targets but isEnabled=false | Buttons grayed out |
| playbackRate is 0.0 when playing | Shows paused |
| Background mode audio not in plist | Info disappears on lock |
| Artwork nil | MPMediaItemArtwork block returning nil |

### Haptics Not Working

1. Haptics DO NOT work in Simulator -- test on physical device (iPhone 8+)
2. Check Settings > Sounds & Haptics > System Haptics is ON
3. Check Low Power Mode is OFF
4. Check `CHHapticEngine.capabilitiesForHardware().supportsHaptics`
5. Verify intensity > 0.3 (lower may be imperceptible)
6. Check `stoppedHandler` and `resetHandler` are set for engine recovery

### Photo Library Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| User can't see photos | `.limited` treated as denied | Handle `.limited` status |
| No permission prompt | Using PHPicker/PhotosPicker | Expected -- picker needs no permission |
| Slow image loading | Synchronous load | Use async `loadTransferable` |
| Only PNG loads | Default Image Transferable | Use custom TransferableImage with `.image` content type |
| App Store rejection | Requesting unnecessary access | Use picker when only selecting photos |

## Related

- **ax-camera** -- Camera capture, AVCaptureSession, video recording
- **ax-privacy** -- Permission request UX patterns, deep links to Settings
- **ax-background-tasks** -- Background audio continuation, BGTaskScheduler
- **ax-design** -- HIG principles for media player interfaces
