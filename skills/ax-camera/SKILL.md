---
name: ax-camera
description: Camera capture with AVFoundation -- AVCaptureSession, SwiftUI preview, RotationCoordinator (iOS 17+), responsive capture (zero-shutter-lag, deferred processing), session interruptions, camera switching, video recording, and diagnostics
license: MIT
---
# Camera Capture with AVFoundation

## Quick Patterns

### Basic Session Setup
```swift
import AVFoundation

let session = AVCaptureSession()
let photoOutput = AVCapturePhotoOutput()
let sessionQueue = DispatchQueue(label: "camera.session")

sessionQueue.async {
    session.beginConfiguration()
    defer { session.commitConfiguration() }

    session.sessionPreset = .photo

    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
          let input = try? AVCaptureDeviceInput(device: camera),
          session.canAddInput(input) else { return }
    session.addInput(input)

    guard session.canAddOutput(photoOutput) else { return }
    session.addOutput(photoOutput)
    photoOutput.maxPhotoQualityPrioritization = .quality

    session.startRunning() // Blocking -- never on main thread
}
```

### SwiftUI Camera Preview
```swift
struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> PreviewView {
        let view = PreviewView()
        view.previewLayer.session = session
        view.previewLayer.videoGravity = .resizeAspectFill
        return view
    }
    func updateUIView(_ uiView: PreviewView, context: Context) {}

    class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}
```

### Rotation Handling (iOS 17+)
```swift
let coordinator = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: previewLayer)
previewLayer.connection?.videoRotationAngle = coordinator.videoRotationAngleForHorizonLevelPreview

let observation = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.new]) { [weak previewLayer] coord, _ in
    DispatchQueue.main.async {
        previewLayer?.connection?.videoRotationAngle = coord.videoRotationAngleForHorizonLevelPreview
    }
}
```

### Capture Photo with Rotation
```swift
func capturePhoto() {
    var settings = AVCapturePhotoSettings()
    settings.photoQualityPrioritization = .balanced
    if let connection = photoOutput.connection(with: .video) {
        connection.videoRotationAngle = coordinator.videoRotationAngleForHorizonLevelCapture
    }
    photoOutput.capturePhoto(with: settings, delegate: self)
}
```

### Permission Request
```swift
func requestCameraAccess() async -> Bool {
    let status = AVCaptureDevice.authorizationStatus(for: .video)
    switch status {
    case .authorized: return true
    case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
    case .denied, .restricted: return false
    @unknown default: return false
    }
}
// Info.plist: NSCameraUsageDescription, NSMicrophoneUsageDescription (for video)
```

---

## Decision Tree

```
What do you need?
|
+-- Just let user pick a photo?
|   -> PHPicker or PhotosPicker, not AVFoundation
|
+-- Simple photo/video with system UI?
|   -> UIImagePickerController (limited customization)
|
+-- Custom camera UI?
|   +-- Photo capture -> AVCaptureSession + AVCapturePhotoOutput
|   +-- Video recording -> AVCaptureSession + AVCaptureMovieFileOutput
|   +-- Both -> AVCaptureSession + both outputs
|
+-- Rotation handling?
|   +-- iOS 17+ -> RotationCoordinator (automatic gravity tracking)
|   +-- Pre-iOS 17 -> Deprecated videoOrientation (manual observation)
|
+-- Capture feels slow?
|   +-- 2+ second delay -> Set photoQualityPrioritization = .speed or .balanced
|   +-- Want zero-shutter-lag -> Enable responsive capture (iOS 17+)
|   +-- Maximum responsiveness -> Enable deferred processing (iOS 17+)
|
+-- Camera freezes/stops?
|   +-- On phone call -> Add interruption observers
|   +-- In Split View -> Camera unavailable with multiple foreground apps
|   +-- After prolonged use -> Thermal pressure
|
+-- Issue / not working?
    -> See Diagnostics section below
```

---

## Anti-Patterns

### Calling startRunning() on main thread
`startRunning()` is blocking (1-3 seconds). Always call on a dedicated serial queue. Blocking main thread freezes UI.

### Using deprecated videoOrientation (iOS 17+)
Manual device orientation observation misses edge cases (face-up, face-down). Use `AVCaptureDevice.RotationCoordinator` which automatically tracks gravity.

### Ignoring session interruptions
Without handling `.AVCaptureSessionWasInterrupted`, camera appears frozen when phone calls arrive, Split View activates, or thermal pressure occurs. Session auto-resumes after interruption ends -- just update UI.

### Modifying session without configuration block
Calling `addInput`/`removeInput` without `beginConfiguration()`/`commitConfiguration()` may leave session in invalid state between calls. Always batch changes atomically.

### Creating new AVCaptureSession per capture
Session creation is expensive. Create once, keep reference, reuse across captures and view lifecycle.

### Using .photo preset for video
Wrong format for video recording. Use `.high`, `.hd1920x1080`, or `.hd4K3840x2160` for video.

### Ignoring photoQualityPrioritization
Default `.quality` causes 2+ second capture delay. Use `.speed` for social/sharing, `.balanced` for general use.

### Not checking canAddInput/canAddOutput
Adding incompatible inputs/outputs fails silently. Always check `session.canAddInput()` / `session.canAddOutput()` before adding.

---

## Deep Patterns

### Session Architecture

```
AVCaptureSession
    +-- Inputs
    |   +-- AVCaptureDeviceInput (camera)
    |   +-- AVCaptureDeviceInput (microphone, for video)
    +-- Outputs
    |   +-- AVCapturePhotoOutput (photos)
    |   +-- AVCaptureMovieFileOutput (video files)
    |   +-- AVCaptureVideoDataOutput (raw frames)
    +-- Connections (automatic between compatible input/output)
```

All session configuration happens on a dedicated serial queue, never main thread. Configuration changes wrapped in `beginConfiguration()`/`commitConfiguration()` for atomic updates.

### Session Presets

| Preset | Resolution | Use Case |
|--------|------------|----------|
| `.photo` | Optimal for photos | Photo capture |
| `.high` | Highest device quality | Video recording |
| `.medium` | VGA quality | Preview, lower storage |
| `.hd1280x720` | 720p | HD video |
| `.hd1920x1080` | 1080p | Full HD video |
| `.hd4K3840x2160` | 4K | Ultra HD video |
| `.inputPriority` | Use device format | Custom configuration |

### Session Notifications

```swift
// Interrupted (phone call, Split View, thermal)
NotificationCenter.default.addObserver(forName: .AVCaptureSessionWasInterrupted, object: session, queue: .main) { notification in
    let reason = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int
}

// Interruption ended (auto-resumes, just update UI)
NotificationCenter.default.addObserver(forName: .AVCaptureSessionInterruptionEnded, object: session, queue: .main) { _ in }

// Runtime error
NotificationCenter.default.addObserver(forName: .AVCaptureSessionRuntimeError, object: session, queue: .main) { notification in
    let error = notification.userInfo?[AVCaptureSessionErrorKey] as? Error
}
```

### Interruption Reasons

| Reason | Cause |
|--------|-------|
| `.videoDeviceNotAvailableInBackground` | App went to background |
| `.audioDeviceInUseByAnotherClient` | Another app using audio |
| `.videoDeviceInUseByAnotherClient` | Another app using camera |
| `.videoDeviceNotAvailableWithMultipleForegroundApps` | Split View (iPad) |
| `.videoDeviceNotAvailableDueToSystemPressure` | Thermal throttling |

### Responsive Capture Pipeline (iOS 17+)

Four complementary APIs for maximum capture responsiveness:

**Zero Shutter Lag**: Ring buffer of recent frames captures the exact moment of tap. Enabled by default for iOS 17+ apps. iPhone XS+ required. Does not apply to flash, manual exposure, or bracketed captures.
```swift
photoOutput.isZeroShutterLagSupported // check first
photoOutput.isZeroShutterLagEnabled   // true by default for iOS 17+
```

**Responsive Capture (Overlapping)**: New capture starts while previous still processing. Increases peak memory.
```swift
if photoOutput.isResponsiveCaptureSupported {
    photoOutput.isResponsiveCaptureEnabled = true
}
```

**Fast Capture Prioritization**: Adapts quality for rapid sequential captures. Off by default -- reduces quality.
```swift
if photoOutput.isFastCapturePrioritizationSupported {
    photoOutput.isFastCapturePrioritizationEnabled = true
}
```

**Readiness Coordinator**: Synchronous shutter button state updates without async lag.
```swift
let readinessCoordinator = AVCapturePhotoOutputReadinessCoordinator(photoOutput: photoOutput)
readinessCoordinator.delegate = self

// Call BEFORE capturePhoto()
readinessCoordinator.startTrackingCaptureRequest(using: settings)
photoOutput.capturePhoto(with: settings, delegate: self)
```

Delegate provides `.ready`, `.notReadyMomentarily`, `.notReadyWaitingForCapture`, `.notReadyWaitingForProcessing`, `.sessionNotRunning`.

### Deferred Photo Processing (iOS 17+)

Returns immediately with proxy image; full Deep Fusion processing happens in background. iPhone 11 Pro+ required.

```swift
if photoOutput.isAutoDeferredPhotoDeliverySupported {
    photoOutput.isAutoDeferredPhotoDeliveryEnabled = true
}
```

Delegate callbacks:
```swift
// Standard photo (non-deferred)
func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
    guard error == nil, let data = photo.fileDataRepresentation() else { return }
    savePhotoToLibrary(data)
}

// Deferred proxy -- save to PhotoKit ASAP before app is backgrounded
func photoOutput(_ output: AVCapturePhotoOutput,
                 didFinishCapturingDeferredPhotoProxy deferredPhotoProxy: AVCaptureDeferredPhotoProxy,
                 error: Error?) {
    guard error == nil, let proxyData = deferredPhotoProxy.fileDataRepresentation() else { return }
    Task {
        try await PHPhotoLibrary.shared().performChanges {
            let request = PHAssetCreationRequest.forAsset()
            request.addResource(with: .photoProxy, data: proxyData, options: nil)
        }
    }
}
```

Limitations: cannot apply pixel buffer customizations to deferred photos. Use PhotoKit adjustments after processing. Final processing happens on-demand or when device is idle.

### Photo Quality Prioritization

| Value | Speed | Quality | Use Case |
|-------|-------|---------|----------|
| `.speed` | Fastest | Lower | Social sharing, rapid capture |
| `.balanced` | Medium | Good | General photography |
| `.quality` | Slowest | Best | Documents, professional |

### Photo Settings

```swift
// Standard JPEG
var settings = AVCapturePhotoSettings()

// HEIF format
settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.hevc])

// Flash
settings.flashMode = .auto // .off, .on, .auto

// High resolution
settings.isHighResolutionPhotoEnabled = true

// Thumbnail for immediate display
settings.embeddedThumbnailPhotoFormat = [AVVideoCodecKey: AVVideoCodecType.jpeg]
```

Settings cannot be reused -- create a new instance per capture. Use `AVCapturePhotoSettings(from:)` to copy.

### Camera Switching

```swift
func switchCamera() {
    sessionQueue.async { [self] in
        guard let currentInput = session.inputs.first as? AVCaptureDeviceInput else { return }
        let newPosition: AVCaptureDevice.Position = currentInput.device.position == .back ? .front : .back

        guard let newDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: newPosition),
              let newInput = try? AVCaptureDeviceInput(device: newDevice) else { return }

        session.beginConfiguration()
        defer { session.commitConfiguration() }

        session.removeInput(currentInput)
        if session.canAddInput(newInput) {
            session.addInput(newInput)
            // Update RotationCoordinator for new device
            setupRotationCoordinator(device: newDevice, previewLayer: previewLayer)
        } else {
            session.addInput(currentInput) // Fallback: restore old
        }
    }
}
```

Front camera mirroring: preview is mirrored (user expectation, like a mirror). Captured photo is NOT mirrored (text reads correctly when shared). This is intentional Apple behavior.

### Video Recording

```swift
let movieOutput = AVCaptureMovieFileOutput()

// Setup: session preset .high, add microphone input + movie output
sessionQueue.async {
    session.beginConfiguration()
    defer { session.commitConfiguration() }

    session.sessionPreset = .high
    if let mic = AVCaptureDevice.default(for: .audio),
       let audioInput = try? AVCaptureDeviceInput(device: mic),
       session.canAddInput(audioInput) { session.addInput(audioInput) }
    if session.canAddOutput(movieOutput) { session.addOutput(movieOutput) }
}

// Start recording
let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".mov")
if let connection = movieOutput.connection(with: .video) {
    connection.videoRotationAngle = coordinator.videoRotationAngleForHorizonLevelCapture
}
movieOutput.startRecording(to: url, recordingDelegate: self)

// Stop recording
movieOutput.stopRecording()
```

Delegate: `AVCaptureFileOutputRecordingDelegate` provides `didFinishRecordingTo` with output URL and optional error.

### Device Types

| Type | Description |
|------|-------------|
| `.builtInWideAngleCamera` | Standard (1x) |
| `.builtInUltraWideCamera` | Ultra-wide (0.5x) |
| `.builtInTelephotoCamera` | Telephoto (2x, 3x) |
| `.builtInDualCamera` | Wide + telephoto |
| `.builtInTripleCamera` | Wide + ultra-wide + telephoto |
| `.builtInTrueDepthCamera` | Front TrueDepth (Face ID) |
| `.builtInLiDARDepthCamera` | LiDAR depth |

### Device Configuration

```swift
try device.lockForConfiguration()
defer { device.unlockForConfiguration() }

device.focusMode = .continuousAutoFocus       // if supported
device.exposureMode = .continuousAutoExposure // if supported
device.torchMode = .on                        // if hasTorch
device.videoZoomFactor = 2.0                  // zoom
```

### Preview Layer Video Gravity

| Value | Behavior |
|-------|----------|
| `.resizeAspect` | Fit entire image, may letterbox |
| `.resizeAspectFill` | Fill layer, may crop edges |
| `.resize` | Stretch to fill (distorts) |

### Complete CameraManager (Reference)

```swift
@MainActor
class CameraManager: NSObject, ObservableObject {
    let session = AVCaptureSession()
    let photoOutput = AVCapturePhotoOutput()
    private let sessionQueue = DispatchQueue(label: "camera.session")
    private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
    private var rotationObservation: NSKeyValueObservation?
    @Published var isSessionRunning = false

    func setup() async -> Bool {
        guard await AVCaptureDevice.requestAccess(for: .video) else { return false }
        return await withCheckedContinuation { continuation in
            sessionQueue.async { [self] in
                session.beginConfiguration()
                defer { session.commitConfiguration() }
                session.sessionPreset = .photo

                guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                      let input = try? AVCaptureDeviceInput(device: camera),
                      session.canAddInput(input) else { continuation.resume(returning: false); return }
                session.addInput(input)

                guard session.canAddOutput(photoOutput) else { continuation.resume(returning: false); return }
                session.addOutput(photoOutput)
                photoOutput.maxPhotoQualityPrioritization = .quality
                continuation.resume(returning: true)
            }
        }
    }

    func start() {
        sessionQueue.async { [self] in
            session.startRunning()
            DispatchQueue.main.async { self.isSessionRunning = self.session.isRunning }
        }
    }

    func stop() {
        sessionQueue.async { [self] in
            session.stopRunning()
            DispatchQueue.main.async { self.isSessionRunning = false }
        }
    }

    func capturePhoto() {
        var settings = AVCapturePhotoSettings()
        settings.photoQualityPrioritization = .balanced
        if let connection = photoOutput.connection(with: .video),
           let angle = rotationCoordinator?.videoRotationAngleForHorizonLevelCapture {
            connection.videoRotationAngle = angle
        }
        photoOutput.capturePhoto(with: settings, delegate: self)
    }
}

extension CameraManager: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput,
                                  didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        guard let data = photo.fileDataRepresentation() else { return }
        // Handle photo data
    }
}
```

---

## Diagnostics

### Root Causes (by frequency)
1. Threading (session work on main thread) -- 35%
2. Session lifecycle (not started, interrupted, not configured) -- 25%
3. Rotation (deprecated APIs, missing coordinator) -- 20%
4. Permissions (denied, not requested) -- 15%
5. Configuration (wrong preset, missing input/output) -- 5%

### Quick Diagnostic Code
```swift
// 1. Session state
print("isRunning: \(session.isRunning)")
print("inputs: \(session.inputs.count), outputs: \(session.outputs.count)")

// 2. Threading
sessionQueue.async {
    print("Setup thread: \(Thread.isMainThread ? "MAIN (bad)" : "Background (good)")")
}

// 3. Permissions
let status = AVCaptureDevice.authorizationStatus(for: .video)
print("Camera permission: \(status.rawValue)") // 0=notDetermined, 1=restricted, 2=denied, 3=authorized

// 4. Interruptions
NotificationCenter.default.addObserver(forName: .AVCaptureSessionWasInterrupted, object: session, queue: .main) { notification in
    if let reason = notification.userInfo?[AVCaptureSessionInterruptionReasonKey] as? Int {
        print("Interrupted: reason \(reason)")
    }
}
```

### Symptom Table

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Black preview | Session not started, permission denied, no input | Check session state + permissions |
| Preview layer shows nothing | Layer not in hierarchy or frame is zero | Set `previewLayer.session`, verify frame |
| UI freezes when opening camera | `startRunning()` on main thread | Move to dedicated serial queue |
| Camera freezes on phone call | No interruption handling | Add `.AVCaptureSessionWasInterrupted` observer |
| Camera stops in Split View | Multiple foreground apps | Show "Camera unavailable in Split View" message |
| Camera stops after prolonged use | Thermal pressure | Reduce session preset to `.medium`, show message |
| Preview rotated 90 degrees wrong | Not using RotationCoordinator | Create RotationCoordinator, observe preview angle |
| Captured photo rotated wrong | Rotation angle not applied to output connection | Set `connection.videoRotationAngle` before capture |
| Front camera photo not mirrored | Correct behavior | Preview mirrors, photo does not (Apple standard) |
| Capture takes 2+ seconds | `.quality` prioritization | Use `.speed` or `.balanced` |
| Shutter button allows double-tap | No readiness tracking | Use ReadinessCoordinator (iOS 17+) |
| Permission denied with no prompt | Already denied, cannot re-prompt | Show Settings prompt with `openSettingsURLString` |
| Crash on older iOS | iOS 17+ APIs without availability check | Guard with `if #available(iOS 17.0, *)` |

---

## Related

- `ax-vision` -- Vision framework (feeds from camera capture for CV tasks)
- `ax-foundation-models` -- On-device AI (not camera)
- WWDC: 2021-10247, 2023-10105

### Checklist Before Shipping

**Session**:
- All session work on dedicated serial queue
- `startRunning()` never on main thread
- Configuration changes in `beginConfiguration()`/`commitConfiguration()`
- Session preset matches use case

**Permissions**:
- Camera permission requested before session setup
- `NSCameraUsageDescription` in Info.plist
- `NSMicrophoneUsageDescription` if recording audio
- Graceful handling of denied state

**Rotation**:
- RotationCoordinator used (not deprecated videoOrientation)
- Preview layer rotation observed
- Capture rotation angle applied when taking photos
- Tested in all orientations

**Responsiveness**:
- photoQualityPrioritization set for use case
- Capture button shows immediate feedback
- Deferred processing considered for maximum speed

**Interruptions**:
- Session interruption observer registered
- UI feedback shown when interrupted
- Tested with incoming phone call
- Tested in Split View (iPad)

**Camera Switching**:
- Front/back switch updates rotation coordinator
- Switch happens on session queue with configuration block
- Fallback if new camera unavailable
