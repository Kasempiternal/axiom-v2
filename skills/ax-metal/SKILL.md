---
name: ax-metal
description: Metal GPU programming and migration -- OpenGL/DirectX to Metal porting, GLSL/HLSL to MSL shader conversion, MTKView setup, render pipelines, compute shaders, triple buffering, Metal Shader Converter, and diagnostics
license: MIT
---
# Metal — GPU Programming & Migration

## Quick Patterns

### MTKView Setup
```swift
import MetalKit

guard let device = MTLCreateSystemDefaultDevice(),
      let queue = device.makeCommandQueue() else { fatalError("Metal not supported") }

let metalView = MTKView(frame: bounds, device: device)
metalView.colorPixelFormat = .bgra8Unorm
metalView.depthStencilPixelFormat = .depth32Float
metalView.clearColor = MTLClearColor(red: 0, green: 0, blue: 0, alpha: 1)
metalView.delegate = renderer
```

### Render Pipeline
```swift
let library = device.makeDefaultLibrary()!
let descriptor = MTLRenderPipelineDescriptor()
descriptor.vertexFunction = library.makeFunction(name: "vertexShader")
descriptor.fragmentFunction = library.makeFunction(name: "fragmentShader")
descriptor.colorAttachments[0].pixelFormat = metalView.colorPixelFormat
descriptor.depthAttachmentPixelFormat = metalView.depthStencilPixelFormat
let pipelineState = try device.makeRenderPipelineState(descriptor: descriptor)
```

### Draw Call
```swift
func draw(in view: MTKView) {
    guard let drawable = view.currentDrawable,
          let rpd = view.currentRenderPassDescriptor,
          let commandBuffer = commandQueue.makeCommandBuffer(),
          let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: rpd) else { return }

    encoder.setRenderPipelineState(pipelineState)
    encoder.setVertexBuffer(vertexBuffer, offset: 0, index: 0)
    encoder.setFragmentTexture(texture, index: 0)
    encoder.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: vertexCount)
    encoder.endEncoding()

    commandBuffer.present(drawable)
    commandBuffer.commit()
}
```

### Basic MSL Shader
```metal
#include <metal_stdlib>
using namespace metal;

struct VertexIn {
    float3 position [[attribute(0)]];
    float2 texCoord [[attribute(1)]];
};

struct VertexOut {
    float4 position [[position]];
    float2 texCoord;
};

struct Uniforms { float4x4 mvp; };

vertex VertexOut vertexShader(VertexIn in [[stage_in]],
                              constant Uniforms &uniforms [[buffer(1)]]) {
    VertexOut out;
    out.position = uniforms.mvp * float4(in.position, 1.0);
    out.texCoord = in.texCoord;
    return out;
}

fragment float4 fragmentShader(VertexOut in [[stage_in]],
                                texture2d<float> tex [[texture(0)]],
                                sampler samp [[sampler(0)]]) {
    return tex.sample(samp, in.texCoord);
}
```

---

## Decision Tree

```
What do you need?
|
+-- Starting a port to Metal?
|   +-- Need working demo in <1 week?
|   |   +-- OpenGL ES source? -> MetalANGLE (translation layer, 10-30% overhead)
|   |   +-- Vulkan available? -> MoltenVK
|   +-- Production app with perf requirements?
|   |   -> Native Metal rewrite (phased migration recommended)
|   +-- DirectX/HLSL source?
|   |   -> Metal Shader Converter (Apple tool, DXIL to Metal library)
|   +-- Hybrid approach?
|       -> MetalANGLE for demo, native Metal incrementally
|
+-- Converting shaders?
|   +-- GLSL to MSL -> See GLSL-MSL mappings below
|   +-- HLSL to MSL -> See HLSL-MSL mappings below
|   +-- DXIL bytecode -> Metal Shader Converter CLI
|
+-- Setting up rendering?
|   +-- Standard rendering -> MTKView + MTKViewDelegate
|   +-- Custom control -> CAMetalLayer + CADisplayLink
|   +-- Compute only -> MTLComputePipelineState
|
+-- Issue / not working?
    -> See Diagnostics section below
```

---

## Anti-Patterns

### Keeping GL state machine mentality
Metal is explicit -- nothing persists between draw calls. Every encoder must set pipeline state and bind all resources. Assuming state carries over (like OpenGL) causes missing textures and silent failures.

### Ignoring coordinate system differences
OpenGL: origin bottom-left, Y up, NDC Z [-1,1], texture origin bottom-left. Metal: origin top-left, Y down, NDC Z [0,1], texture origin top-left. Fix with Y-flip in vertex shader, projection matrix adjustment, or `MTKTextureLoader.Origin.bottomLeft`.

### No validation layer during development
Metal validation catches 80% of porting bugs with clear messages. Enable in Xcode: Edit Scheme > Run > Diagnostics: Metal API Validation, Metal Shader Validation, GPU Frame Capture.

### Single buffer without synchronization
CPU and GPU fight over the same buffer causing race conditions and visual glitches. Use triple buffering with a `DispatchSemaphore(value: 3)`.

### Creating resources every frame
`device.makeBuffer()` and `makeRenderPipelineState()` are expensive. Create once at init, reuse across frames.

### Porting all shaders at once
GLSL to MSL is not 1:1. Each shader needs visual validation, not just compilation. Port 10-15/week with side-by-side GL/Metal comparison.

### Skipping GPU Frame Capture
Print statements do not work in shaders. GPU Frame Capture is the only way to inspect shader variables, intermediate textures, and GPU timing.

---

## Deep Patterns

### Core Architecture Differences (GL vs Metal)

| Concept | OpenGL | Metal |
|---------|--------|-------|
| State model | Implicit, mutable | Explicit, immutable PSO |
| Validation | At draw time | At PSO creation |
| Shader compilation | Runtime (JIT) | Build time (AOT) |
| Command submission | Implicit | Explicit command buffers |
| Resource binding | Global state | Per-encoder binding |
| Synchronization | Driver-managed | App-managed |

### GLSL to MSL Type Mappings

| GLSL | MSL |
|------|-----|
| `vec2/3/4` | `float2/3/4` |
| `ivec2/3/4` | `int2/3/4` |
| `mat2/3/4` | `float2x2/3x3/4x4` |
| `sampler2D` | `texture2d<float>` + `sampler` (separate) |
| `samplerCube` | `texturecube<float>` + `sampler` |
| `sampler2DShadow` | `depth2d<float>` + `sampler` |
| `double` | N/A (use `float`, no 64-bit in MSL) |

### GLSL to MSL Built-in Mappings

| GLSL | MSL | Stage |
|------|-----|-------|
| `gl_Position` | Return `[[position]]` | Vertex |
| `gl_VertexID` | `[[vertex_id]]` parameter | Vertex |
| `gl_InstanceID` | `[[instance_id]]` parameter | Vertex |
| `gl_FragCoord` | `[[position]]` parameter | Fragment |
| `gl_FrontFacing` | `[[front_facing]]` parameter | Fragment |
| `gl_FragDepth` | Return `[[depth(any)]]` | Fragment |
| `attribute`/`varying` | `[[stage_in]]` struct | Vertex |
| `uniform` | `[[buffer(N)]]` parameter | Any |

### GLSL to MSL Function Mappings

| GLSL | MSL | Notes |
|------|-----|-------|
| `texture(sampler, uv)` | `tex.sample(sampler, uv)` | Method on texture |
| `textureLod(s, uv, lod)` | `tex.sample(s, uv, level(lod))` | |
| `texelFetch(s, coord, lod)` | `tex.read(coord, lod)` | Integer coords |
| `mod(x, y)` | `fmod(x, y)` | Different name |
| `inversesqrt(x)` | `rsqrt(x)` | Different name |
| `atan(y, x)` | `atan2(y, x)` | Different name |
| `dFdx(v)` / `dFdy(v)` | `dfdx(v)` / `dfdy(v)` | |
| `mix`, `clamp`, `smoothstep`, `step`, `fract` | Same names | Identical |

### GLSL Precision to MSL Types

| GLSL | MSL |
|------|-----|
| `lowp float` / `mediump float` | `half` (16-bit) |
| `highp float` | `float` (32-bit) |
| `precision mediump float` | (not needed in MSL) |

### HLSL to MSL Mappings

| HLSL | MSL |
|------|-----|
| `Texture2D` | `texture2d<float>` |
| `SamplerState` | `sampler` |
| `RWTexture2D` | `texture2d<float, access::read_write>` |
| `StructuredBuffer<T>` | `constant T* [[buffer(n)]]` |
| `RWStructuredBuffer<T>` | `device T* [[buffer(n)]]` |
| `SV_Position` | `[[position]]` |
| `SV_Target0` | `[[color(0)]]` |
| `SV_VertexID` | `[[vertex_id]]` |
| `SV_DispatchThreadID` | `[[thread_position_in_grid]]` |
| `SV_GroupThreadID` | `[[thread_position_in_threadgroup]]` |
| `lerp(a,b,t)` | `mix(a,b,t)` |
| `frac(x)` | `fract(x)` |
| `ddx/ddy` | `dfdx/dfdy` |
| `clip(x)` | `if (x < 0) discard_fragment()` |
| `mul(a,b)` | `a * b` |

### Metal Shader Converter (DirectX to Metal)

```bash
# Compile HLSL to DXIL
dxc -T vs_6_0 -E MainVS -Fo vertex.dxil shader.hlsl
dxc -T ps_6_0 -E MainPS -Fo fragment.dxil shader.hlsl

# Convert DXIL to Metal library
metal-shaderconverter vertex.dxil -o vertex.metallib
metal-shaderconverter fragment.dxil -o fragment.metallib
```

Requires macOS 13+/Xcode 15+ or Windows 10+/VS 2019+. Supports SM 6.0-6.6. Target devices: Argument Buffers Tier 2 (macOS 14+, iOS 17+).

### OpenGL API to Metal Equivalents

| OpenGL | Metal |
|--------|-------|
| `GLKView` / `NSOpenGLView` | `MTKView` |
| `EAGLContext` | `MTLDevice` + `MTLCommandQueue` |
| `glGenBuffers` + `glBufferData` | `device.makeBuffer(bytes:length:options:)` |
| `glGenTextures` + `glTexImage2D` | `device.makeTexture(descriptor:)` + `replace(region:)` |
| `glGenFramebuffers` | `MTLRenderPassDescriptor` |
| `glCreateProgram` + `glLinkProgram` | `MTLRenderPipelineDescriptor` -> `MTLRenderPipelineState` |
| `glEnable(GL_DEPTH_TEST)` | `MTLDepthStencilDescriptor` -> `MTLDepthStencilState` |
| `glEnable(GL_BLEND)` | `pipelineDescriptor.colorAttachments[0].isBlendingEnabled` |
| `glCullFace` / `glFrontFace` | `encoder.setCullMode()` / `encoder.setFrontFacing()` |
| `glDrawArrays` | `encoder.drawPrimitives(type:vertexStart:vertexCount:)` |
| `glDrawElements` | `encoder.drawIndexedPrimitives(...)` |

### Buffer Alignment (Critical)

MSL requires `float3` to be 16-byte aligned (not 12). Use `simd` types in Swift for CPU-GPU shared structs:
```swift
struct Uniforms {
    var mvp: simd_float4x4       // Correct alignment
    var position: simd_float3    // 16-byte aligned
    var padding: Float = 0       // Explicit padding if needed
}
```

Or use `packed_float3` in MSL (slower, no padding).

### Triple Buffering

```swift
class TripleBufferedRenderer {
    let inflightSemaphore = DispatchSemaphore(value: 3)
    var buffers: [MTLBuffer] = [] // 3 uniform buffers
    var bufferIndex = 0

    func draw(in view: MTKView) {
        inflightSemaphore.wait()
        let buffer = buffers[bufferIndex]
        buffer.contents().copyMemory(from: &uniforms, byteCount: size)

        let commandBuffer = commandQueue.makeCommandBuffer()!
        commandBuffer.addCompletedHandler { [weak self] _ in
            self?.inflightSemaphore.signal()
        }
        // ... encode and commit
        bufferIndex = (bufferIndex + 1) % 3
    }
}
```

### Storage Modes

| Mode | CPU | GPU | Use Case |
|------|-----|-----|----------|
| `.shared` | R/W | R/W | Small dynamic data, uniforms |
| `.private` | None | R/W | Static assets, render targets |
| `.managed` (macOS) | R/W | R/W | Large buffers with partial updates |

### Compute Shader Setup

```swift
let function = library.makeFunction(name: "computeKernel")!
let pipeline = try device.makeComputePipelineState(function: function)

let encoder = commandBuffer.makeComputeCommandEncoder()!
encoder.setComputePipelineState(pipeline)
encoder.setBuffer(input, offset: 0, index: 0)
encoder.setBuffer(output, offset: 0, index: 1)

let threadGroupSize = MTLSize(width: 256, height: 1, depth: 1)
let threadGroups = MTLSize(width: (count + 255) / 256, height: 1, depth: 1)
encoder.dispatchThreadgroups(threadGroups, threadsPerThreadgroup: threadGroupSize)
encoder.endEncoding()
```

```metal
kernel void computeKernel(device float* input [[buffer(0)]],
                          device float* output [[buffer(1)]],
                          uint id [[thread_position_in_grid]]) {
    output[id] = input[id] * 2.0;
}
```

### CAMetalLayer Setup (Custom Control)

```swift
class MetalLayerView: UIView {
    override class var layerClass: AnyClass { CAMetalLayer.self }

    func setup() {
        let metalLayer = layer as! CAMetalLayer
        metalLayer.device = MTLCreateSystemDefaultDevice()!
        metalLayer.pixelFormat = .bgra8Unorm
        metalLayer.framebufferOnly = true
    }

    func render() {
        guard let drawable = (layer as! CAMetalLayer).nextDrawable(),
              let commandBuffer = commandQueue.makeCommandBuffer() else { return }

        let rpd = MTLRenderPassDescriptor()
        rpd.colorAttachments[0].texture = drawable.texture
        rpd.colorAttachments[0].loadAction = .clear
        rpd.colorAttachments[0].storeAction = .store
        // ... encode, present, commit
    }
}
```

### Phased Migration Strategy

```
Phase 1: Abstraction Layer (1-2 weeks)
+-- Create renderer interface hiding GL/Metal specifics
+-- Keep GL implementation as reference
+-- Validate abstraction with existing tests

Phase 2: Metal Backend (2-4 weeks)
+-- Implement Metal renderer behind same interface
+-- Convert shaders GLSL -> MSL
+-- Run GL and Metal side-by-side for visual diff
+-- GPU Frame Capture for debugging

Phase 3: Optimization (1-2 weeks)
+-- Remove abstraction overhead where it hurts
+-- Use Metal-specific features (argument buffers, indirect draws)
+-- Profile with Metal System Trace
+-- Remove GL backend entirely
```

### MetalANGLE Translation Layer (Quick Demo)

```swift
import MetalANGLE

let context = MGLContext(api: kMGLRenderingAPIOpenGLES3)
MGLContext.setCurrent(context)
let glView = MGLKView(frame: bounds, context: context)
// Existing GL code works unchanged
```

Limitations: 10-30% overhead, ES 2/3 only, no compute shaders, no visionOS, no precise GL state semantics.

---

## Diagnostics

### Mandatory First Step

Enable Metal validation before any debugging:
```
Xcode > Edit Scheme > Run > Diagnostics
  Metal API Validation
  Metal Shader Validation
  GPU Frame Capture (Metal)
```

Most Metal bugs produce clear validation errors. Debugging without validation wastes hours.

### Symptom Table

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Black screen | Missing drawable, unbound resources, wrong function names | Check `view.currentDrawable`, verify `setVertexBuffer`/`setFragmentTexture` calls |
| Shader compilation error "undeclared identifier" | Missing `#include <metal_stdlib>` or `using namespace metal` | Add standard preamble |
| "No matching function for call to 'texture'" | GLSL `texture()` -> MSL `tex.sample(sampler, uv)` | Use method syntax with separate sampler |
| "Invalid type 'vec4'" | GLSL types -> MSL types | `vec4` -> `float4`, `mat4` -> `float4x4` |
| Image upside down | Metal Y-axis opposite OpenGL | Flip Y in vertex shader, or `MTKTextureLoader .origin: .bottomLeft` |
| Image mirrored | Wrong winding order or cull mode | `encoder.setFrontFacing(.counterClockwise)`, check cull mode |
| Colors swapped (red/blue) | Pixel format mismatch | `.bgra8Unorm` vs `.rgba8Unorm` -- match format to data |
| Colors washed out | sRGB vs linear mismatch | Use `_srgb` format variants for gamma-correct rendering |
| Depth fighting | NDC Z range difference | OpenGL Z [-1,1] vs Metal Z [0,1] -- adjust projection matrix |
| Performance worse than GL | Resources created per frame, no triple buffering, validation enabled | Create once/reuse, triple buffer, disable validation for release |
| EXC_BAD_ACCESS in Metal | Resource released while GPU still using it | Keep strong references until command buffer completes |
| "Command buffer execution aborted" | GPU timeout (>10s on iOS), infinite shader loop | Add early exit conditions, reduce work |
| Crash on buffer access | Out-of-bounds in shader | Enable shader validation, check array bounds |

### Debugging Tools

**GPU Frame Capture** (Cmd+Opt+Shift+G): Inspect buffer contents, view intermediate textures, check draw call sequence, debug shader variables.

**Metal System Trace** (Instruments): GPU/CPU timeline analysis, synchronization stalls, encoder overhead, bottleneck identification.

**Shader Debugger** (GPU Frame Capture > Select draw > Debug): Step through shader execution, inspect per-pixel/vertex variable values.

### Coordinate System Fix

```swift
// Metal perspective projection with Z range [0, 1]
func metalPerspective(fovY: Float, aspect: Float, near: Float, far: Float) -> simd_float4x4 {
    let yScale = 1.0 / tan(fovY * 0.5)
    let xScale = yScale / aspect
    let zRange = far - near
    return simd_float4x4(rows: [
        SIMD4(xScale, 0, 0, 0),
        SIMD4(0, yScale, 0, 0),
        SIMD4(0, 0, far / zRange, 1),
        SIMD4(0, 0, -near * far / zRange, 0)
    ])
}
```

---

## Related

- `ax-3d-games` -- SpriteKit, SceneKit, RealityKit (higher-level 3D)
- `ax-vision` -- Vision framework (computer vision, not GPU rendering)
- WWDC: 2016-00602, 2018-00604, 2019-00611, 2020-10602, 2020-10603

### Pre-Migration Checklist

- Inventory shaders (count, complexity, extensions used)
- Profile GL baseline (FPS, frame time, memory, thermal)
- Define success criteria (target FPS, memory budget)
- Enable Metal validation (API + Shader + Frame Capture)
- Set up A/B visual comparison (GL vs Metal side-by-side)

### Post-Migration Checklist

- Visual parity with reference (side-by-side screenshots)
- Performance parity or better (frame time <= GL baseline)
- No validation errors (clean run with validation enabled)
- Thermal acceptable (no throttling during normal use)
- Memory stable (no leaks over extended use)
- All code paths tested (edge cases, resize, rotate)
