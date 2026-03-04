---
name: ax-3d-games
description: 2D/3D game and spatial content development -- SpriteKit (2D games), SceneKit (3D legacy, deprecated iOS 26), RealityKit (modern 3D/AR/ECS), physics, ECS architecture, SpriteView/RealityView SwiftUI integration, and diagnostics
license: MIT
---
# 2D/3D Games & Spatial Content

## Quick Patterns

### SpriteKit 2D Scene (SwiftUI)
```swift
import SpriteKit
import SwiftUI

class GameScene: SKScene {
    override func didMove(to view: SKView) {
        physicsWorld.contactDelegate = self
        physicsWorld.gravity = CGVector(dx: 0, dy: -9.8)
        let player = SKSpriteNode(imageNamed: "player")
        player.position = CGPoint(x: size.width / 2, y: size.height / 2)
        player.physicsBody = SKPhysicsBody(circleOfRadius: player.size.width / 2)
        addChild(player)
    }
}

struct GameView: View {
    var body: some View {
        SpriteView(scene: GameScene(size: CGSize(width: 390, height: 844)))
            .ignoresSafeArea()
    }
}
```

### RealityKit 3D Content (SwiftUI, iOS 18+)
```swift
import RealityKit
import SwiftUI

struct ContentView: View {
    var body: some View {
        RealityView { content in
            let box = ModelEntity(
                mesh: .generateBox(size: 0.1),
                materials: [SimpleMaterial(color: .blue, isMetallic: true)]
            )
            box.position = [0, 0.5, -1]
            box.components.set(InputTargetComponent())
            box.components.set(CollisionComponent(shapes: [.generateBox(size: [0.1, 0.1, 0.1])]))
            content.add(box)
        }
        .gesture(TapGesture().targetedToAnyEntity().onEnded { value in
            value.entity.position.y += 0.1
        })
    }
}
```

### RealityKit Custom ECS Component + System
```swift
struct HealthComponent: Component {
    var current: Int = 100
    var max: Int = 100
}

struct DamageSystem: System {
    static let query = EntityQuery(where: .has(HealthComponent.self))

    init(scene: Scene) {}

    func update(context: SceneUpdateContext) {
        for entity in context.entities(matching: Self.query, updatingSystemWhen: .rendering) {
            var health = entity.components[HealthComponent.self]!
            if health.current <= 0 { entity.removeFromParent() }
        }
    }
}

// Register: HealthComponent.registerComponent(); DamageSystem.registerSystem()
```

### SceneKit 3D (Legacy -- deprecated iOS 26)
```swift
import SceneKit

let scene = SCNScene()
let box = SCNNode(geometry: SCNBox(width: 1, height: 1, length: 1, chamferRadius: 0))
box.geometry?.firstMaterial?.diffuse.contents = UIColor.blue
box.physicsBody = SCNPhysicsBody(type: .dynamic, shape: nil)
scene.rootNode.addChildNode(box)
```

---

## Decision Tree

```
What are you building?
|
+-- 2D game / sprite-based?
|   -> SpriteKit
|   |
|   +-- SwiftUI host?       -> SpriteView(scene:)
|   +-- Physics?             -> SKPhysicsBody + bitmask discipline
|   +-- Particles?           -> SKEmitterNode (Xcode particle editor)
|   +-- Tile maps?           -> SKTileMapNode
|   +-- Metal hybrid?        -> SKRenderer (manual render loop)
|
+-- 3D content / AR / spatial?
|   -> RealityKit (modern, ECS)
|   |
|   +-- SwiftUI host?       -> RealityView { content in }
|   +-- Simple model display?-> Model3D(named:) (async load)
|   +-- AR plane anchoring?  -> AnchorEntity(.plane(.horizontal))
|   +-- Image anchoring?     -> AnchorEntity(.image(group:name:))
|   +-- Tap/drag interaction?-> InputTargetComponent + CollisionComponent + gesture
|   +-- Custom logic per frame? -> System protocol + EntityQuery
|   +-- Physics simulation?  -> PhysicsBodyComponent + CollisionComponent
|   +-- Multiplayer sync?    -> SynchronizationComponent + MultipeerConnectivityService
|   +-- Metal integration?   -> RealityRenderer (custom Metal pipeline)
|
+-- Existing SceneKit project?
|   -> Maintain or migrate to RealityKit
|   |
|   +-- Minor update?        -> Keep SceneKit, plan migration
|   +-- Major rewrite?       -> Migrate to RealityKit now
|   +-- AR features needed?  -> RealityKit (SceneKit+ARKit is legacy)
|   +-- Need concept mapping?-> See SceneKit-to-RealityKit table below
|
+-- Issue / not working?
    +-- SpriteKit?  -> SpriteKit Diagnostics
    +-- RealityKit? -> RealityKit Diagnostics
    +-- SceneKit?   -> SceneKit section (deprecated)
```

---

## Anti-Patterns

### SpriteKit

#### SKShapeNode in production
Each SKShapeNode creates its own draw call. 50 shapes = 50 draw calls. Pre-render to SKTexture or use sprite sheets instead.
```swift
// BAD: 50 draw calls
for _ in 0..<50 { addChild(SKShapeNode(circleOfRadius: 10)) }

// GOOD: 1 draw call per atlas page
for _ in 0..<50 { addChild(SKSpriteNode(imageNamed: "circle")) }
```

#### Forgetting bitmask discipline
Physics contacts silently fail without proper bitmask setup. Define ALL categories as powers of 2 and set categoryBitMask, contactTestBitMask, AND collisionBitMask explicitly.
```swift
struct PhysicsCategory {
    static let none:    UInt32 = 0
    static let player:  UInt32 = 0b0001
    static let enemy:   UInt32 = 0b0010
    static let bullet:  UInt32 = 0b0100
    static let wall:    UInt32 = 0b1000
}
```

#### Not removing completed actions and nodes
Offscreen nodes with running actions waste CPU. Remove nodes when they leave the screen.

#### Coordinate confusion (bottom-left origin)
SpriteKit uses bottom-left origin. UIKit uses top-left. `anchorPoint` defaults to (0.5, 0.5) for sprites, (0, 0) for scenes.

#### Processing touches on wrong node
Use `nodes(at:)` or `atPoint()` with node names, not just position checks.

### RealityKit

#### Treating ECS like OOP inheritance
Components are value types. Don't subclass Entity for behavior -- add/remove components instead.

#### Forgetting read-modify-write for components
Components are value types. `entity.components[T.self]?.property = x` silently discards the change. Must copy, modify, write back.
```swift
// BAD: silently does nothing
entity.components[HealthComponent.self]?.current -= 10

// GOOD: read-modify-write
var health = entity.components[HealthComponent.self]!
health.current -= 10
entity.components.set(health)
```

#### Missing CollisionComponent for gestures
Gestures require BOTH `InputTargetComponent` AND `CollisionComponent`. Without collision shape, taps pass through.

#### Component churn in Systems
Creating/removing components every frame causes memory allocation. Use boolean flags or state enums inside existing components instead.

#### Using reference types as Components
Components must be value types (struct). Classes cause memory issues and break ECS guarantees.

### SceneKit (Legacy)

#### Starting new SceneKit projects (deprecated iOS 26)
SceneKit is soft-deprecated. Use RealityKit for all new 3D work. SceneKit won't receive new features.

#### Modifying materials in tight loops
SCNMaterial changes trigger shader recompilation. Cache material variants, swap references instead.

---

## Deep Patterns

### SpriteKit

#### Coordinate System
Bottom-left origin `(0,0)`. Y increases upward. Scene `anchorPoint` defaults to `(0,0)` (bottom-left corner). Sprite `anchorPoint` defaults to `(0.5, 0.5)` (center).

#### Scene Architecture
```swift
let scene = GameScene(size: CGSize(width: 390, height: 844))
scene.scaleMode = .aspectFill // .fill, .aspectFit, .resizeFill
```
Scale modes: `.aspectFill` (crops, no letterbox), `.aspectFit` (letterbox, no crop), `.resizeFill` (stretches to fill), `.fill` (scene resizes to view).

Camera node for scrolling worlds:
```swift
let camera = SKCameraNode()
scene.camera = camera
scene.addChild(camera)
// HUD nodes: add as children of camera (stay fixed on screen)
```

Layer organization with z-ordering:
```swift
enum Layer: CGFloat {
    case background = -1, gameplay = 0, player = 1, effects = 2, hud = 3
}
node.zPosition = Layer.player.rawValue
```

#### Physics Bitmask System
Three masks control physics behavior:
- `categoryBitMask`: What this body IS
- `collisionBitMask`: What this body BOUNCES off (default: all)
- `contactTestBitMask`: What generates delegate callbacks (default: none)

```swift
// Player bounces off walls, generates contact events with enemies
player.physicsBody!.categoryBitMask = PhysicsCategory.player
player.physicsBody!.collisionBitMask = PhysicsCategory.wall
player.physicsBody!.contactTestBitMask = PhysicsCategory.enemy

// Contacts not firing checklist:
// 1. contactDelegate set on physicsWorld?
// 2. contactTestBitMask set (not just collisionBitMask)?
// 3. At least one body is dynamic?
// 4. Both nodes in scene tree?
// 5. Bitmask math correct (AND operation)?
```

Contact detection:
```swift
func didBegin(_ contact: SKPhysicsContact) {
    let sorted = [contact.bodyA, contact.bodyB].sorted { $0.categoryBitMask < $1.categoryBitMask }
    let (first, second) = (sorted[0], sorted[1])
    // Now first always has the lower category -- deterministic handling
}
```

Physics body types: `.dynamic` (full simulation), `.static` (immovable, never set velocity), `.kinematic` (moved by code, affects dynamic bodies).

Anti-tunneling for fast objects:
```swift
body.usesPreciseCollisionDetection = true // continuous detection, more expensive
```

#### SKAction System
Actions are copied when run -- safe to reuse templates:
```swift
let moveUp = SKAction.moveBy(x: 0, y: 100, duration: 0.5)
let fadeOut = SKAction.fadeOut(withDuration: 0.3)
let sequence = SKAction.sequence([moveUp, fadeOut, .removeFromParent()])
let forever = SKAction.repeatForever(SKAction.sequence([moveUp, moveUp.reversed()]))

// Named actions (can stop individually)
node.run(moveUp, withKey: "movement")
node.removeAction(forKey: "movement")

// Custom action (per-frame callback)
SKAction.customAction(withDuration: 1.0) { node, elapsed in
    node.alpha = 1.0 - (elapsed / 1.0)
}
```

#### All Node Types (Performance Notes)
| Node | Purpose | Draw Calls |
|------|---------|------------|
| SKSpriteNode | Textured sprites | Batched per atlas |
| SKShapeNode | Vector shapes | 1 per node (expensive!) |
| SKLabelNode | Text | 1 per node |
| SKEmitterNode | Particles | 1 per emitter |
| SKTileMapNode | Tile grids | Batched |
| SKVideoNode | Video playback | 1 per node |
| SKReferenceNode | .sks file reference | Varies |
| SKCropNode | Masking | Adds passes |
| SKEffectNode | CIFilter/blur | Rasterizes subtree |
| SK3DNode | SceneKit in 2D | Full 3D pipeline |
| SKCameraNode | Viewport control | 0 (no rendering) |
| SKLightNode | 2D lighting | Adds light pass |
| SKFieldNode | Physics fields | 0 (physics only) |
| SKAudioNode | Positional audio | 0 (audio only) |
| SKTransformNode | 3D rotation for 2D | 0 (transform only) |

#### Performance Optimization
```swift
// Texture atlases: batch draw calls
let atlas = SKTextureAtlas(named: "Sprites")
let texture = atlas.textureNamed("player_idle_01")

// Object pooling
class BulletPool {
    private var available: [SKSpriteNode] = []
    func get() -> SKSpriteNode {
        available.isEmpty ? createNew() : available.removeLast()
    }
    func recycle(_ node: SKSpriteNode) {
        node.removeFromParent(); node.removeAllActions()
        available.append(node)
    }
}
```

View diagnostics:
```swift
skView.showsFPS = true
skView.showsNodeCount = true
skView.showsDrawCount = true   // Most important -- target < 20
skView.showsPhysics = true     // Debug collision shapes
```

#### Game Loop Phases
`update(_:)` -> `didEvaluateActions()` -> `didSimulatePhysics()` -> `didApplyConstraints()` -> `didFinishUpdate()` -> render.

#### SwiftUI Integration
```swift
struct GameView: View {
    @StateObject var game = GameModel()

    var body: some View {
        SpriteView(scene: makeScene(), preferredFramesPerSecond: 60,
                   options: [.ignoresSiblingOrder], debugOptions: [.showsFPS])
    }
}

// @Observable bridge for SwiftUI <-> SpriteKit communication
@Observable class GameModel {
    var score = 0
    var scene: GameScene?
}
```

#### SKRenderer (Metal Hybrid)
```swift
let renderer = SKRenderer(device: MTLCreateSystemDefaultDevice()!)
renderer.scene = gameScene
// In Metal render loop:
renderer.update(atTime: currentTime)
renderer.render(withViewport: viewport, renderPassDescriptor: rpd,
                commandQueue: queue, renderCommandEncoder: encoder)
```

---

### RealityKit

#### Entity-Component-System (ECS)
**Entity**: Identity container (has position via Transform, holds components). NOT subclassed for behavior.
**Component**: Data (struct, value type). No logic. Examples: HealthComponent, VelocityComponent.
**System**: Logic that runs every frame on entities matching a query.

Entity hierarchy:
```swift
let parent = Entity()
let child = ModelEntity(mesh: .generateSphere(radius: 0.1))
parent.addChild(child)
child.position = [0, 0.5, 0] // Relative to parent
child.setPosition([0, 1, 0], relativeTo: nil) // World space

// Find entities
entity.findEntity(named: "target")
entity.children.first(where: { $0.components.has(HealthComponent.self) })
```

#### Built-in Components Reference
| Component | Purpose |
|-----------|---------|
| Transform | Position, rotation, scale |
| ModelComponent | Mesh + materials |
| CollisionComponent | Collision shapes for physics and gestures |
| PhysicsBodyComponent | .dynamic / .static / .kinematic physics |
| PhysicsMotionComponent | Velocity and angular velocity |
| InputTargetComponent | Enable gesture targeting |
| AnchoringComponent | AR world anchoring |
| SynchronizationComponent | Multiplayer sync |
| DirectionalLightComponent | Directional light source |
| PointLightComponent | Point light source |
| SpotLightComponent | Spot light source |
| AccessibilityComponent | VoiceOver for 3D content |
| OpacityComponent | Transparency |
| GroundingShadowComponent | Drop shadow on ground plane |
| HoverEffectComponent | visionOS hover highlight |
| ImageBasedLightComponent | IBL environment lighting |
| ImageBasedLightReceiverComponent | Receive IBL from another entity |

#### RealityView (iOS 18+)
```swift
RealityView { content in
    // Called once. Add entities to content.
    let model = try? await ModelEntity(named: "Robot")
    if let model { content.add(model) }
} update: { content in
    // Called when @State changes. Modify existing entities.
} attachments: {
    // SwiftUI views attached to 3D space
    Attachment(id: "label") {
        Text("Hello").padding().glassBackgroundEffect()
    }
}
```

#### Model3D (Async Loading)
```swift
Model3D(named: "Robot") { model in
    model.resizable().scaledToFit()
} placeholder: {
    ProgressView()
}
```

#### AR Anchoring
```swift
// Plane anchoring
let anchor = AnchorEntity(.plane(.horizontal, classification: .floor, minimumBounds: [0.5, 0.5]))
anchor.addChild(model)

// Image anchoring (from AR Resource Group in asset catalog)
let anchor = AnchorEntity(.image(group: "ARResources", name: "poster"))

// SpatialTrackingSession (iOS 18+) for hand/world tracking
let config = SpatialTrackingSession.Configuration(tracking: [.hand, .world])
let session = SpatialTrackingSession()
let result = await session.run(config)
```

#### Gesture Interaction
Requirements: entity needs BOTH `InputTargetComponent` AND `CollisionComponent`.
```swift
entity.components.set(InputTargetComponent())
entity.components.set(CollisionComponent(shapes: [.generateBox(size: [0.1, 0.1, 0.1])]))

// In view:
RealityView { /* ... */ }
.gesture(TapGesture().targetedToAnyEntity().onEnded { value in
    print("Tapped: \(value.entity.name)")
})
.gesture(DragGesture().targetedToAnyEntity().onChanged { value in
    value.entity.position = value.convert(value.location3D, from: .local, to: .scene)
})
```

ManipulationComponent (visionOS): Adds built-in translate/rotate/scale with two-hand support.

#### Materials
| Material | Use Case |
|----------|----------|
| SimpleMaterial | Solid color or basic texture, metallic/roughness |
| PhysicallyBasedMaterial | Full PBR (baseColor, roughness, metallic, normal, AO, emissive) |
| UnlitMaterial | No lighting (UI overlays, always-bright) |
| OcclusionMaterial | Invisible but hides content behind it (AR masking) |
| VideoMaterial | Play video on surface |
| ShaderGraphMaterial | Reality Composer Pro shader graphs |
| CustomMaterial | Metal shader integration |

PBR setup:
```swift
var material = PhysicallyBasedMaterial()
material.baseColor = .init(tint: .white, texture: .init(try .load(named: "albedo")))
material.roughness = .init(floatLiteral: 0.3)
material.metallic = .init(floatLiteral: 1.0)
material.normal = .init(texture: .init(try .load(named: "normal")))
```

#### Physics
```swift
// Dynamic body
entity.components.set(PhysicsBodyComponent(
    shapes: [.generateBox(size: [0.1, 0.1, 0.1])],
    mass: 1.0,
    material: .generate(staticFriction: 0.5, dynamicFriction: 0.3, restitution: 0.7),
    mode: .dynamic
))
entity.components.set(PhysicsMotionComponent(linearVelocity: [0, 5, 0]))

// Collision events
scene.subscribe(to: CollisionEvents.Began.self, on: entity) { event in
    let other = event.entityA == entity ? event.entityB : event.entityA
}
```

Modes: `.dynamic` (full simulation), `.static` (immovable), `.kinematic` (code-driven, affects dynamics).

#### Animation
```swift
// Transform animation
var transform = entity.transform
transform.translation.y += 0.5
entity.move(to: transform, relativeTo: entity.parent, duration: 1.0, timingFunction: .easeInOut)

// Play USDZ animation
if let animation = entity.availableAnimations.first {
    entity.playAnimation(animation.repeat())
}

// AnimationResource
let orbit = OrbitAnimation(duration: 3, axis: [0, 1, 0], startTransform: entity.transform, spinClockwise: true)
entity.playAnimation(try AnimationResource.generate(with: orbit))
```

#### Audio
```swift
entity.components.set(SpatialAudioComponent())
entity.components.set(AmbientAudioComponent())
let resource = try AudioFileResource.load(named: "sound.wav")
entity.playAudio(resource)
```

#### RealityRenderer (Metal Integration)
```swift
let renderer = try RealityRenderer()
let entity = ModelEntity(mesh: .generateSphere(radius: 0.1))
renderer.entities.append(entity)

// In Metal render loop:
try renderer.updateAndRender(deltaTime: dt, viewport: viewport,
    colorTexture: drawable.texture, depthTexture: depthTex,
    commandBuffer: commandBuffer)
```

#### Multiplayer
```swift
let service = try MultipeerConnectivityService(session: mcSession)
entity.components.set(SynchronizationComponent())
scene.synchronizationService = service
// Ownership: entity.requestOwnership { result in }
// SynchronizationComponent.isOwner for local authority check
```

---

### SceneKit (Deprecated iOS 26 -- Maintenance Only)

#### Migration Status
SceneKit is soft-deprecated in iOS 26. No new features. Existing apps continue working. Plan migration to RealityKit for new work.

#### SceneKit-to-RealityKit Concept Mapping

| SceneKit | RealityKit |
|----------|-----------|
| SCNScene | Entity (root) |
| SCNNode | Entity |
| SCNGeometry | MeshResource |
| SCNMaterial | Material protocol (SimpleMaterial, PBR) |
| SCNLight | DirectionalLightComponent, PointLightComponent |
| SCNCamera | PerspectiveCamera entity |
| SCNPhysicsBody | PhysicsBodyComponent |
| SCNPhysicsShape | ShapeResource (CollisionComponent) |
| SCNAction | Transform animations, entity.move(to:) |
| SCNTransaction | Not needed (ECS handles updates) |
| SCNHitTestResult | EntityTargetValue (gesture system) |
| SCNView | RealityView |
| ARSCNView | RealityView + ARKit anchoring |
| SCNNode.addChildNode | Entity.addChild |
| node.position | entity.position (SIMD3<Float>) |
| SCNVector3 | SIMD3<Float> |
| SCNQuaternion | simd_quatf |

#### Key Architecture Differences
- SceneKit: OOP scene graph (subclass nodes). RealityKit: ECS (compose with components).
- SceneKit: `SCNVector3`, `SCNQuaternion`. RealityKit: `SIMD3<Float>`, `simd_quatf`.
- SceneKit: Delegate-based updates. RealityKit: System protocol with EntityQuery.
- SceneKit: Manual render loop via `SCNRenderer`. RealityKit: `RealityRenderer`.
- SceneKit: `SCNPhysicsContactDelegate`. RealityKit: `CollisionEvents` subscription.

#### SceneKit Core API (For Maintenance)
```swift
// Scene setup
let scene = SCNScene(named: "scene.usdz")!
let scnView = SCNView(frame: .zero)
scnView.scene = scene
scnView.allowsCameraControl = true
scnView.autoenablesDefaultLighting = true

// Materials (6 lighting models: .physicallyBased, .blinn, .phong, .lambert, .constant, .shadowOnly)
let material = SCNMaterial()
material.lightingModel = .physicallyBased
material.diffuse.contents = UIColor.blue
material.metalness.contents = 0.8
material.roughness.contents = 0.2

// Animation
SCNTransaction.begin()
SCNTransaction.animationDuration = 0.5
node.position = SCNVector3(0, 1, 0)
SCNTransaction.commit()

// Physics
node.physicsBody = SCNPhysicsBody(type: .dynamic, shape: SCNPhysicsShape(geometry: node.geometry!))
node.physicsBody?.categoryBitMask = 1
node.physicsBody?.contactTestBitMask = 2
```

Constraints: SCNLookAtConstraint, SCNBillboardConstraint, SCNDistanceConstraint, SCNReplicatorConstraint, SCNAccelerationConstraint, SCNSliderConstraint, SCNAvoidOccluderConstraint.

SCNAction catalog mirrors SKAction: move, rotate, scale, fade, sequence, group, repeat, removeFromParent, run(block), customAction.

---

## Diagnostics

### SpriteKit Diagnostics

#### Root Causes (by frequency)
1. Physics bitmask misconfiguration -- 35%
2. Coordinate system confusion -- 20%
3. Draw call explosion (SKShapeNode) -- 15%
4. Memory leaks (retained actions/nodes) -- 15%
5. Threading violations -- 15%

#### Symptom Table

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Contacts not firing | contactTestBitMask not set, delegate missing, or both bodies static | Set contactTestBitMask, assign contactDelegate, ensure >= 1 dynamic body |
| Objects tunnel through walls | Fast small objects skip collision | `usesPreciseCollisionDetection = true`, thicker walls |
| FPS drops below 60 | Too many draw calls | Check `showsDrawCount`, replace SKShapeNode with sprites, use atlases |
| Touches not registering | `isUserInteractionEnabled` false, wrong node, node z-order | Enable interaction, check `nodes(at:)`, verify zPosition |
| Memory grows over time | Offscreen nodes not removed, action references retained | Remove nodes leaving screen, use `removeAllActions()` on recycle |
| Sprites in wrong position | Coordinate origin confusion | SpriteKit origin is bottom-left; UIKit is top-left; check anchorPoint |
| Scene transition crash | Retaining references to old scene's nodes | Use weak references, clean up in `willMove(from:)` |
| Physics jitter | Setting position directly on dynamic body | Use `applyForce`/`applyImpulse`, not `.position =` |
| Node not visible | Wrong zPosition, outside scene bounds, alpha = 0 | Check zPosition, position, parent chain, alpha |

#### Quick Diagnostic
```swift
// Enable all debug overlays
skView.showsFPS = true
skView.showsNodeCount = true
skView.showsDrawCount = true
skView.showsPhysics = true

// Dump scene tree
func dumpTree(_ node: SKNode, indent: Int = 0) {
    let prefix = String(repeating: "  ", count: indent)
    print("\(prefix)\(type(of: node)) '\(node.name ?? "")' z:\(node.zPosition) pos:\(node.position)")
    for child in node.children { dumpTree(child, indent: indent + 1) }
}

// Physics bitmask audit
scene.enumerateChildNodes(withName: "//*") { node, _ in
    if let body = node.physicsBody {
        print("\(node.name ?? "?"): cat=\(body.categoryBitMask) col=\(body.collisionBitMask) contact=\(body.contactTestBitMask)")
    }
}
```

### RealityKit Diagnostics

#### Root Causes (by frequency)
1. Missing components (InputTarget, Collision) -- 30%
2. Component read-modify-write errors -- 25%
3. Entity not in scene / not visible -- 20%
4. AR anchor not tracking -- 15%
5. Material/lighting issues -- 10%

#### Symptom Table

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Entity not visible | Not added to scene, scale 0, material transparent, behind camera | Check `entity.isEnabled`, parent chain, position, material |
| Gesture not responding | Missing InputTargetComponent or CollisionComponent | Add BOTH components; collision shape must cover entity |
| Component change ignored | Value type not written back | Use read-modify-write pattern: get, modify, `entity.components.set()` |
| Anchor not tracking | Insufficient features, wrong classification, device unsupported | Check `ARWorldTrackingConfiguration.isSupported`, improve lighting |
| Material looks wrong | Missing normal map, wrong lighting, IBL not set | Add ImageBasedLightComponent to scene, check material properties |
| Physics not working | No PhysicsBodyComponent, no CollisionComponent, wrong mode | Need both components; dynamic bodies for simulation |
| Multiplayer out of sync | SynchronizationComponent missing, ownership conflict | Set sync component, request ownership before modifying |
| Simulator crash | GPU feature unsupported in sim | Test on device; simulator lacks full GPU support |
| System not running | Component not registered, system not registered | Call `Component.registerComponent()` and `System.registerSystem()` at app launch |
| Poor performance | Too many unique meshes, component churn | Use instancing (same MeshResource), avoid add/remove components per frame |

#### Quick Diagnostic
```swift
// Check entity visibility chain
func diagnoseVisibility(_ entity: Entity) {
    print("Enabled: \(entity.isEnabled)")
    print("Position: \(entity.position)")
    print("Scale: \(entity.scale)")
    print("Has model: \(entity.components.has(ModelComponent.self))")
    print("Parent: \(entity.parent?.name ?? "none")")
    if let model = entity.components[ModelComponent.self] {
        print("Mesh bounds: \(model.mesh.bounds)")
    }
}

// Check gesture prerequisites
func diagnoseGesture(_ entity: Entity) {
    print("InputTarget: \(entity.components.has(InputTargetComponent.self))")
    print("Collision: \(entity.components.has(CollisionComponent.self))")
    if let collision = entity.components[CollisionComponent.self] {
        print("Collision shapes: \(collision.shapes.count)")
    }
}
```

#### Common Mistakes Table
| Mistake | Impact | Fix |
|---------|--------|-----|
| Reference type component | Memory issues, ECS breaks | Use struct for all components |
| Subclassing Entity for behavior | Can't swap behavior at runtime | Use components instead |
| Not registering Component/System | System never runs, component ignored | Register at app launch |
| Modifying entity from background thread | Race conditions, crashes | Use MainActor or scene's update |
| Loading USDZ synchronously | UI freeze on load | Use `ModelEntity(named:)` with async/await |

---

## Related

- `ax-metal` -- GPU programming and Metal shader migration
- `ax-camera` -- Camera capture pipeline (AR camera feed)
- `ax-vision` -- Computer vision (hand/body pose for gesture input)
- WWDC: SpriteKit (2017-609), SceneKit (2017-604), RealityKit (2019-603, 2021-10074, 2023-10080, 2024-10103)

### Framework Selection Guide

| Need | Framework | Key Advantage |
|------|-----------|--------------|
| 2D game with physics | SpriteKit | Mature, integrated physics, particle editor |
| 3D content, AR, spatial | RealityKit | Modern ECS, AR-native, Apple's investment path |
| Existing 3D project | SceneKit (maintain) | Already built, still runs, plan migration |
| Metal + 2D game | SKRenderer | SpriteKit scene in custom Metal pipeline |
| Metal + 3D content | RealityRenderer | RealityKit entities in custom Metal pipeline |
| Simple model viewer | Model3D | Declarative SwiftUI, async loading |

### SpriteKit SKView Configuration Reference
```swift
skView.ignoresSiblingOrder = true    // Enable draw call batching (CRITICAL for performance)
skView.preferredFramesPerSecond = 60 // or 120 on ProMotion
skView.isAsynchronous = true         // Default: renders on its own thread
skView.shouldCullNonVisibleNodes = true // Default: skip offscreen nodes
```

### API Availability

| API | iOS |
|-----|-----|
| SpriteKit | 7+ |
| SceneKit | 8+ |
| RealityKit | 13+ |
| RealityView | 18+ |
| Model3D | 18+ |
| SpriteView (SwiftUI) | 14+ |
| ARView (deprecated) | 13+ |
| SpatialTrackingSession | 18+ |
| ManipulationComponent | visionOS 1+ |
| RealityRenderer | 18+ |
| SKRenderer | 11+ |
| SceneKit deprecated | 26+ |
