---
name: ax-coreml
description: On-device ML with CoreML -- model conversion (PyTorch to CoreML), compression (palettization/quantization/pruning), stateful KV-cache for LLMs, multi-function models, MLTensor, async prediction, and diagnostics
license: MIT
---
# CoreML — On-Device Machine Learning

## Quick Patterns

### Basic Conversion (PyTorch to CoreML)
```python
import coremltools as ct
import torch

model.eval()
traced = torch.jit.trace(model, example_input)
mlmodel = ct.convert(
    traced,
    inputs=[ct.TensorType(shape=example_input.shape)],
    minimum_deployment_target=ct.target.iOS18
)
mlmodel.save("MyModel.mlpackage")
```

### Load and Predict (Swift)
```swift
// Async load (preferred)
let config = MLModelConfiguration()
config.computeUnits = .all  // .cpuOnly, .cpuAndGPU, .cpuAndNeuralEngine
let model = try await MLModel.load(contentsOf: url, configuration: config)

// Async prediction (thread-safe)
let output = try await model.prediction(from: input)
```

### Post-Training Compression
```python
from coremltools.optimize.coreml import OpPalettizerConfig, OptimizationConfig, palettize_weights

config = OpPalettizerConfig(mode="kmeans", nbits=4, granularity="per_grouped_channel", group_size=16)
compressed = palettize_weights(model, OptimizationConfig(global_config=config))
```

### Stateful Model (KV-Cache)
```swift
let state = model.makeState()
let output = try model.prediction(from: input, using: state) // state updated in-place
```

### MLTensor (iOS 18+)
```swift
let scores = MLTensor(shape: [1, vocab_size], scalars: logits)
let topK = scores.topK(k: 10)
let probs = (topK.values / temperature).softmax()
let sampled = probs.multinomial(numSamples: 1)
let result = await sampled.shapedArray(of: Int32.self) // materialize
```

---

## Decision Tree

```
Need on-device ML?
|
+-- Text generation (simple prompts, structured output)?
|   -> Foundation Models (ax-foundation-models), not CoreML
|
+-- Custom trained model / fine-tuned LLM?
|   -> CoreML
|   |
|   +-- PyTorch model to convert?
|   |   -> Pattern: Basic Conversion
|   +-- Model too large for device?
|   |   -> Pattern: Compression (palettization > quantization > pruning)
|   +-- Transformer with KV-cache?
|   |   -> Pattern: Stateful Models
|   +-- Multiple LoRA adapters?
|   |   -> Pattern: Multi-Function Models
|   +-- Pipeline stitching between models?
|   |   -> Pattern: MLTensor
|   +-- Concurrent predictions needed?
|       -> Pattern: Async Prediction
|
+-- Issue / not working?
    +-- Model won't load?          -> Diagnostics: Load Failures
    +-- Slow inference?            -> Diagnostics: Performance
    +-- High memory?               -> Diagnostics: Memory
    +-- Accuracy lost after compress? -> Diagnostics: Compression
    +-- Conversion fails?          -> Diagnostics: Conversion
```

---

## Anti-Patterns

### Loading models on main thread at launch
`MLModel(contentsOf:)` blocks. Use async loading in background task.

### Reloading model for each prediction
Model loading is expensive. Load once, keep reference, reuse.

### Compressing without profiling
Don't jump to 2-bit. Start with Float16 baseline, then 8-bit, 6-bit, 4-bit with grouped channels, testing accuracy at each step.

### Missing deployment target
Always set `minimum_deployment_target=ct.target.iOS18` to enable SDPA fusion, per-block quantization, MLTensor, and state support.

### Unlimited concurrent predictions
Each prediction allocates input/output buffers. Limit concurrency to 2-3 to avoid memory pressure.

---

## Deep Patterns

### Model Compression

Three techniques with different tradeoffs:

**Palettization** (best for Neural Engine): Clusters weights into lookup tables.
```python
from coremltools.optimize.coreml import OpPalettizerConfig, OptimizationConfig, palettize_weights

# 4-bit with grouped channels (iOS 18+)
config = OpPalettizerConfig(mode="kmeans", nbits=4, granularity="per_grouped_channel", group_size=16)
compressed = palettize_weights(model, OptimizationConfig(global_config=config))
```

| Bits | Compression | Accuracy Impact |
|------|-------------|-----------------|
| 8-bit | 2x | Minimal |
| 6-bit | 2.7x | Low |
| 4-bit | 4x | Moderate (use grouped channels) |
| 2-bit | 8x | High (requires training-time) |

**Quantization** (best for GPU on Mac): Linear mapping to INT8/INT4.
```python
from coremltools.optimize.coreml import OpLinearQuantizerConfig, OptimizationConfig, linear_quantize_weights

config = OpLinearQuantizerConfig(mode="linear", dtype="int4", granularity="per_block", block_size=32)
compressed = linear_quantize_weights(model, OptimizationConfig(global_config=config))
```

**Pruning**: Sets weights to zero for sparse representation.
```python
from coremltools.optimize.coreml import OpMagnitudePrunerConfig, OptimizationConfig, prune_weights

config = OpMagnitudePrunerConfig(target_sparsity=0.4)
sparse = prune_weights(model, OptimizationConfig(global_config=config))
```

### Training-Time Compression

When post-training loses too much accuracy, fine-tune with compression:
```python
from coremltools.optimize.torch.palettization import DKMPalettizerConfig, DKMPalettizer

config = DKMPalettizerConfig(global_config={"n_bits": 4})
palettizer = DKMPalettizer(model, config)
prepared = palettizer.prepare()

for epoch in range(epochs):
    train_epoch(prepared, data_loader)
    palettizer.step()

final = palettizer.finalize()
```

### Calibration-Based Compression (iOS 18+)

Middle ground between post-training and full training:
```python
from coremltools.optimize.torch.pruning import MagnitudePrunerConfig, LayerwiseCompressor

config = MagnitudePrunerConfig(target_sparsity=0.4, n_samples=128)
compressor = LayerwiseCompressor(model, config)
compressed = compressor.compress(calibration_loader)
```

### Stateful Models (KV-Cache for LLMs)

PyTorch model registers state buffers, converted with `ct.StateType`:
```python
mlmodel = ct.convert(
    traced,
    inputs=[
        ct.TensorType(name="input_ids", shape=(1, ct.RangeDim(1, 2048))),
        ct.TensorType(name="causal_mask", shape=(1, 1, ct.RangeDim(1, 2048), ct.RangeDim(1, 2048)))
    ],
    states=[
        ct.StateType(name="keyCache", wrapped_type=ct.TensorType(shape=(1, 32, 2048, 128))),
        ct.StateType(name="valueCache", wrapped_type=ct.TensorType(shape=(1, 32, 2048, 128)))
    ],
    minimum_deployment_target=ct.target.iOS18
)
```

Runtime: `let state = model.makeState()` then `model.prediction(from: input, using: state)`. State updated in-place. 1.6x speedup on Mistral-7B (M3 Max) vs manual KV-cache I/O.

### Multi-Function Models (Adapters/LoRA)

Deploy multiple adapters sharing base weights in one model:
```python
from coremltools.models import MultiFunctionDescriptor
from coremltools.models.utils import save_multifunction

desc = MultiFunctionDescriptor()
desc.add_function("sticker", "sticker.mlpackage")
desc.add_function("storybook", "storybook.mlpackage")
save_multifunction(desc, "MultiAdapter.mlpackage")
```

Load specific function:
```swift
let config = MLModelConfiguration()
config.functionName = "sticker"
let model = try MLModel(contentsOf: url, configuration: config)
```

### MLTensor Operations (iOS 18+)

```swift
// Create
let tensor = MLTensor([[1.0, 2.0], [3.0, 4.0]])
let zeros = MLTensor(zeros: [3, 3], scalarType: Float.self)

// Math: +, *, mean(), sum(), max(), softmax()
// Comparison: .> for boolean masks
// Indexing: tensor[0], tensor[.all, 0], tensor[0..<2, 1..<3]
// Reshaping: reshaped(to:), expandingShape(at:)
// Materialize: await tensor.shapedArray(of: Float.self)
```

Operations are async. Call `shapedArray()` to materialize results (blocks until complete).

### Async Prediction

Thread-safe concurrent predictions:
```swift
try await withThrowingTaskGroup(of: Output.self) { group in
    for image in images {
        group.addTask {
            try Task.checkCancellation()
            return try await model.prediction(from: self.prepareInput(image))
        }
    }
    return try await group.reduce(into: []) { $0.append($1) }
}
```

Limit concurrency to avoid memory pressure from multiple input/output buffers.

### Caching Behavior

First load triggers device specialization (slow). Subsequent loads use cache. Cache keyed by (model path + configuration + device). Invalidated by: system updates, low disk space, model modification.

Prewarm at launch:
```swift
Task.detached(priority: .background) { _ = try? await MLModel.load(contentsOf: modelURL) }
```

### Compute Availability
```swift
let devices = MLModel.availableComputeDevices  // CPU, GPU, Neural Engine
```

| ComputeUnits | Behavior |
|--------------|----------|
| `.all` | Best performance (default) |
| `.cpuOnly` | CPU only |
| `.cpuAndGPU` | Exclude Neural Engine |
| `.cpuAndNeuralEngine` | Exclude GPU |

### Conversion Shape Types
```python
ct.TensorType(shape=(1, 3, 224, 224))                    # Fixed
ct.TensorType(shape=(1, ct.RangeDim(1, 2048)))           # Range
ct.TensorType(shape=ct.EnumeratedShapes(shapes=[...]))   # Enumerated
```

### Deployment Target Features

| Target | Key Features |
|--------|-------------|
| iOS 16 | Weight compression (palettization, quantization, pruning) |
| iOS 17 | Async prediction, MLComputeDevice, activation quantization |
| iOS 18 | MLTensor, State, SDPA fusion, per-block quantization, multi-function |

---

## Diagnostics

### Load Failures

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Unsupported model version" | Spec version > device iOS | Re-convert with lower `minimum_deployment_target` |
| "Failed to create compute plan" | Unsupported ops for compute unit | Use `.cpuOnly` or convert with `FLOAT16` precision |
| General load error | File missing, not compiled, corrupt | Check `.mlmodelc` exists, disk space, re-convert |

Spec version mapping: 4=iOS13, 5=iOS14, 6=iOS15, 7=iOS16, 8=iOS17, 9=iOS18.

### Performance

| Symptom | Cause | Fix |
|---------|-------|-----|
| First load slow, subsequent fast | Cache miss | Prewarm in background at launch |
| All predictions slow | Wrong compute units | Profile with Instruments, check `computeUnits` config |
| Slow on specific device | Hardware mismatch | Palettization for NE, quantization for GPU, profile on target |
| Dynamic shapes recompiling | Variable input sizes | Use fixed or enumerated shapes |

**Profile compute unit usage**:
```swift
let plan = try await MLComputePlan.load(contentsOf: modelURL)
for op in plan.modelStructure.operations {
    let info = plan.computeDeviceInfo(for: op)
    print("\(op.name): \(info.preferredDevice)")
}
```

### Memory

| Symptom | Cause | Fix |
|---------|-------|-----|
| Memory grows during predictions | Concurrent prediction buffers | Limit concurrent predictions (2-3 max) |
| Out of memory on load | Model too large | Compress (8-bit = 2x, 4-bit = 4x smaller) |

### Compression Accuracy Loss

| Technique | Fix Progression |
|-----------|----------------|
| Palettization | per_grouped_channel (iOS 18+) -> more bits -> calibration -> training-time |
| Quantization | per_block (iOS 18+) -> calibration data -> higher dtype |
| Pruning | Lower sparsity -> calibration-based -> training-time (>50% needs training) |

Key insight: 4-bit per-tensor = only 16 clusters for entire weight matrix. Grouped channels = 16 clusters per group = much better.

### Conversion Issues

| Symptom | Fix |
|---------|-----|
| Unsupported operation | Upgrade coremltools, decompose into supported ops, or register custom op |
| Correct conversion but wrong output | Check input normalization, shape ordering (NCHW vs NHWC), precision (Float16 vs 32), mode |

Debug output differences:
```python
torch_out = model(input).detach().numpy()
coreml_out = mlmodel.predict({"input": input.numpy()})["output"]
print(f"Max diff: {np.max(np.abs(torch_out - coreml_out))}")
```

### Profiling Tools

- **Xcode Performance Reports**: Open model in Xcode > Performance tab > Create report
- **Core ML Instrument**: Load events ("cached" vs "prepare and cache"), prediction intervals, compute unit usage
- **MLComputePlan** (iOS 18+): Programmatic per-operation compute device and cost inspection

---

## Related

- `ax-foundation-models` -- Apple's on-device LLM (for text generation, not custom models)
- `ax-metal` -- GPU programming and Metal migration
- WWDC: 2023-10047, 2023-10049, 2024-10159, 2024-10161

### Checklist Before Deploying

- Set `minimum_deployment_target` to latest supported iOS
- Profile Float16 baseline performance on target devices
- Compress incrementally with accuracy testing at each step
- Use async prediction for concurrent workloads
- Limit concurrent predictions to manage memory
- Use state for transformer KV-cache
- Use multi-function for adapter variants
- Test on actual devices (not just simulator -- simulator uses host Mac hardware)
