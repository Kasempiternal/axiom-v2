---
name: ax-vision
description: Computer vision with Vision framework -- subject segmentation, hand/body pose, person detection, text recognition (OCR), barcode/QR detection, document scanning, DataScannerViewController, and diagnostics
license: MIT
---
# Vision Framework — Computer Vision

## Quick Patterns

### Subject Segmentation (iOS 17+)
```swift
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(cgImage: image)
try handler.perform([request])

guard let obs = request.results?.first as? VNInstanceMaskObservation else { return }
let mask = try obs.createScaledMask(for: obs.allInstances, croppedToInstancesContent: false)
```

### VisionKit Subject Lifting (iOS 16+)
```swift
let interaction = ImageAnalysisInteraction()
interaction.preferredInteractionTypes = .imageSubject
imageView.addInteraction(interaction)
```

### Hand Pose Detection (iOS 14+)
```swift
let request = VNDetectHumanHandPoseRequest()
request.maximumHandCount = 2
try handler.perform([request])
let thumbTip = try observation.recognizedPoint(.thumbTip) // 21 landmarks per hand
```

### Text Recognition (OCR)
```swift
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate // or .fast for real-time
request.recognitionLanguages = ["en-US"]
try handler.perform([request])
for obs in request.results as? [VNRecognizedTextObservation] ?? [] {
    let text = obs.topCandidates(1).first?.string
}
```

### Barcode/QR Detection
```swift
let request = VNDetectBarcodesRequest()
request.symbologies = [.qr, .ean13] // specify only what you need
try handler.perform([request])
for barcode in request.results as? [VNBarcodeObservation] ?? [] {
    let payload = barcode.payloadStringValue
}
```

### DataScannerViewController (iOS 16+ live camera)
```swift
let scanner = DataScannerViewController(
    recognizedDataTypes: [.barcode(symbologies: [.qr]), .text(textContentType: .URL)],
    qualityLevel: .balanced, recognizesMultipleItems: false,
    isHighFrameRateTrackingEnabled: true, isGuidanceEnabled: true
)
scanner.delegate = self
present(scanner, animated: true) { try? scanner.startScanning() }
```

### Document Scanning
```swift
// Built-in UI: VNDocumentCameraViewController (iOS 13+)
// Programmatic: VNDetectDocumentSegmentationRequest (iOS 15+)
// Structured extraction: RecognizeDocumentsRequest (iOS 26+)
```

---

## Decision Tree

```
What do you need?
|
+-- Isolate subject from background?
|   +-- System UI (long-press to lift) -> VisionKit ImageAnalysisInteraction
|   +-- Custom pipeline / HDR / large images -> VNGenerateForegroundInstanceMaskRequest
|   +-- Exclude hands from object -> Combine subject mask + hand pose
|
+-- Segment people?
|   +-- All people, one mask -> VNGeneratePersonSegmentationRequest (iOS 15+)
|   +-- Separate mask per person (up to 4) -> VNGeneratePersonInstanceMaskRequest (iOS 17+)
|
+-- Detect hand pose / gestures?
|   +-- Just hand location -> VNDetectHumanRectanglesRequest
|   +-- 21 landmarks -> VNDetectHumanHandPoseRequest (pinch = thumb-index distance)
|
+-- Detect body pose?
|   +-- 2D normalized -> VNDetectHumanBodyPoseRequest (18 joints, iOS 14+)
|   +-- 3D real-world -> VNDetectHumanBodyPose3DRequest (17 joints, iOS 17+)
|   +-- Action classification -> Body pose + CreateML model
|
+-- Recognize text?
|   +-- Real-time camera + need UI -> DataScannerViewController (iOS 16+)
|   +-- Processing image -> VNRecognizeTextRequest (.fast or .accurate)
|   +-- Structured docs (tables) -> RecognizeDocumentsRequest (iOS 26+)
|
+-- Detect barcodes/QR?
|   +-- Real-time camera + UI -> DataScannerViewController
|   +-- Processing image -> VNDetectBarcodesRequest
|
+-- Scan documents?
|   +-- Built-in UI -> VNDocumentCameraViewController (iOS 13+)
|   +-- Custom pipeline -> VNDetectDocumentSegmentationRequest
|   +-- Structured data -> RecognizeDocumentsRequest (iOS 26+)
|
+-- Issue / not working?
    -> See Diagnostics section below
```

---

## Anti-Patterns

### Processing on main thread
Vision is resource-intensive. Always run on background queue. Blocking main thread freezes UI.

### Ignoring confidence scores
Low confidence landmarks are unreliable (occlusion, blur, edge of frame). Always check `point.confidence > 0.5`.

### Forgetting coordinate conversion
Vision uses lower-left origin, normalized 0-1. UIKit uses top-left. Flip Y: `uiY = (1 - visionY) * height`.

### Setting maximumHandCount too high
Performance scales with count. Set to minimum needed (typically 2).

### Using ARKit when Vision suffices
Vision body pose works offline on still images. ARKit requires rear camera, AR session, supported devices.

### Enabling all barcode symbologies
Fewer symbologies = faster scanning. Specify only what you need.

### Processing every camera frame for scanning
Skip frames (every 3rd), use region of interest, use `.fast` recognition level.

### Using VNImageRequestHandler for video
Use `VNSequenceRequestHandler` for video/camera -- maintains inter-frame state for temporal smoothing. Creating a new `VNImageRequestHandler` per frame discards temporal context, causing jittery results.

---

## Deep Patterns

### Request Handlers

**VNImageRequestHandler**: Single image analysis. Initialize with CGImage/CIImage/CVPixelBuffer/URL. One handler per image.

**VNSequenceRequestHandler**: Video/camera sequences. Create once, reuse across frames. Maintains inter-frame state for smoother results with pose, segmentation, and document detection.

### Subject Instance Masks

`VNInstanceMaskObservation` provides:
- `allInstances` (IndexSet of foreground instances)
- `instanceMask` (CVPixelBuffer with UInt8 labels, 0=background)
- `instanceAtPoint(_:)` for tap-to-select
- `createScaledMask(for:croppedToInstancesContent:)` -- soft segmentation mask

Use `croppedToInstancesContent: false` for compositing (matches input resolution). Use `true` for tight crop around selection.

### Composite with CoreImage
```swift
let filter = CIFilter(name: "CIBlendWithMask")!
filter.setValue(CIImage(cgImage: sourceImage), forKey: kCIInputImageKey)
filter.setValue(CIImage(cvPixelBuffer: mask), forKey: kCIInputMaskImageKey)
filter.setValue(newBackground, forKey: kCIInputBackgroundImageKey)
let composited = filter.outputImage
```

### Hand Landmarks (21 points)
Wrist (1) + Thumb (4: CMC, MP, IP, Tip) + 4 Fingers (4 each: MCP, PIP, DIP, Tip).
Groups: `.all`, `.thumb`, `.indexFinger`, `.middleFinger`, `.ringFinger`, `.littleFinger`.
Chirality: `observation.chirality` (.left/.right/.unknown).

### Gesture Recognition (Pinch example)
```swift
let thumbTip = try observation.recognizedPoint(.thumbTip)
let indexTip = try observation.recognizedPoint(.indexTip)
guard thumbTip.confidence > 0.5, indexTip.confidence > 0.5 else { return }
let distance = hypot(thumbTip.location.x - indexTip.location.x, thumbTip.location.y - indexTip.location.y)
let isPinching = distance < 0.05
```
Use evidence accumulation over multiple frames (3+ frames of pinch before triggering).

### Body Landmarks (18 2D / 17 3D)
Face (5): nose, eyes, ears. Arms (6): shoulders, elbows, wrists. Torso (7): neck, shoulders, hips, root. Legs (6): hips, knees, ankles.
Groups: `.all`, `.face`, `.leftArm`, `.rightArm`, `.torso`, `.leftLeg`, `.rightLeg`.

3D body pose (iOS 17+): returns `simd_float4x4` positions in meters, estimated `bodyHeight`, `cameraOriginMatrix`.

### Text Recognition Details

| Level | Speed | Accuracy | Best For |
|-------|-------|----------|----------|
| `.fast` | Real-time | Good | Camera, signs, large text |
| `.accurate` | Slower | Excellent | Documents, receipts, handwriting |

Key properties: `recognitionLanguages` (order matters -- first determines ML model), `usesLanguageCorrection` (disable for codes/serials), `customWords` (domain vocabulary), `minimumTextHeight`, `regionOfInterest`.

For real-time scanning, build evidence over frames with a string tracker (accumulate same result N times before accepting).

### Barcode Revisions
- Rev 1 (iOS 11+): One code at a time, 1D codes return lines
- Rev 2 (iOS 15+): Codabar, GS1, MicroQR, better ROI
- Rev 3 (iOS 16+): ML-based, multiple codes, better bounding boxes

### Document Extraction (iOS 26+)
```swift
let request = RecognizeDocumentsRequest()
let observations = try await request.perform(on: imageData)
guard let doc = observations.first?.document else { return }

for table in doc.tables {
    for row in table.rows { for cell in row { print(cell.content.text.transcript) } }
}

for data in doc.text.detectedData {
    switch data.match.details {
    case .emailAddress(let e): print(e.emailAddress)
    case .phoneNumber(let p): print(p.phoneNumber)
    case .link(let url): print(url)
    default: break
    }
}
```

### Person Instance Segmentation
Up to 4 people separately. >4 people: may miss or combine. Use `VNDetectFaceRectanglesRequest` to count, fallback to single mask if crowded.

### Isolate Object Excluding Hand
Combine `VNGenerateForegroundInstanceMaskRequest` (class-agnostic) + `VNDetectHumanHandPoseRequest` (hand landmarks) -> calculate convex hull of hand points -> subtract hand region from subject mask using CoreImage -> get bounding box of remaining mask.

---

## Diagnostics

### Root Causes (by frequency)
1. Environment (lighting, occlusion, edge of frame) -- 40%
2. Confidence threshold (ignoring low confidence) -- 30%
3. Threading (blocking main thread) -- 15%
4. Coordinates (lower-left vs top-left) -- 10%
5. API availability (iOS version) -- 5%

### Symptom Table

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Subject not detected | Small/blurry/low contrast | Crop closer, improve lighting |
| Hand landmarks nil/low confidence | Edge of frame, parallel to camera, gloves | Adjust framing, prompt user |
| Body pose skipped frames | Person bent over, flowing clothing | Prompt upright, increase contrast |
| UI freezes | Main thread processing | Move to background queue |
| Overlays in wrong position | Coordinate conversion | Flip Y: `(1 - visionY) * height` |
| >4 people missing | Instance mask limit | Fallback to single person mask |
| Text not detected | Blurry, small, stylized font | Lower `minimumTextHeight`, use `.accurate` |
| Wrong characters (OCR) | Language correction fixing codes | Disable `usesLanguageCorrection` for codes |
| Text recognition slow | `.accurate` for real-time | Switch to `.fast`, use `regionOfInterest` |
| Barcode not detected | Wrong symbology, code too small | Don't filter symbologies, crop closer |
| DataScanner blank | Camera denied, not supported | Check `isSupported` + `isAvailable` first |
| Document edges not detected | Low contrast, non-rectangular | Use contrasting background |
| Perspective correction wrong | Corner order / coordinate system | Normalize corners, convert coordinates |

### Quick Diagnostic Code
```swift
// 1. Check detection
try handler.perform([request])
print("Results: \(request.results?.count ?? 0)")

// 2. Check confidence (for pose)
for (key, point) in try observation.recognizedPoints(.all) {
    if point.confidence < 0.3 { print("LOW: \(key)") }
}

// 3. Check threading
assert(!Thread.isMainThread, "Vision must run on background queue")
```

---

## Related

- `ax-camera` -- Camera capture pipeline (feeds into Vision)
- `ax-coreml` -- Custom ML models (when Vision APIs don't cover your use case)
- `ax-foundation-models` -- Apple on-device LLM (text generation, not computer vision)
- WWDC: 2019-234, 2021-10041, 2022-10024, 2022-10025, 2025-272, 2023-10176

### API Availability Reference

| API | iOS |
|-----|-----|
| VNDetectBarcodesRequest | 11+ |
| VNDetectFaceRectanglesRequest/Landmarks | 11+ |
| VNDocumentCameraViewController | 13+ |
| VNRecognizeTextRequest | 13+ |
| VNDetectHumanHandPoseRequest | 14+ |
| VNDetectHumanBodyPoseRequest | 14+ |
| VNGeneratePersonSegmentationRequest | 15+ |
| VNDetectDocumentSegmentationRequest | 15+ |
| DataScannerViewController | 16+ |
| VisionKit ImageAnalysisInteraction | 16+ |
| VNGenerateForegroundInstanceMaskRequest | 17+ |
| VNGeneratePersonInstanceMaskRequest | 17+ |
| VNDetectHumanBodyPose3DRequest | 17+ |
| RecognizeDocumentsRequest | 26+ |
