#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Axiom v2 skill catalog for search
 */
const SKILLS: Array<{ name: string; description: string; category: string }> = [
  // Build & Fix
  { name: 'ax-build', description: 'Xcode build diagnostics, environment fixes, SPM resolution, CI/CD setup', category: 'build' },
  { name: 'ax-build-ref', description: 'xcodebuild CLI reference, build settings, scheme configuration', category: 'build' },
  { name: 'ax-shipping', description: 'App Store submission, TestFlight, code signing, provisioning profiles', category: 'build' },
  { name: 'ax-lldb', description: 'LLDB debugging commands, breakpoints, memory inspection, crash analysis', category: 'build' },

  // UI
  { name: 'ax-swiftui', description: 'SwiftUI architecture, @Observable, state management, view lifecycle', category: 'ui' },
  { name: 'ax-swiftui-ref', description: 'SwiftUI API reference, modifiers, containers, property wrappers', category: 'ui' },
  { name: 'ax-uikit', description: 'UIKit patterns, view controllers, collection views, UIKit-SwiftUI interop', category: 'ui' },
  { name: 'ax-design', description: 'iOS design patterns, Human Interface Guidelines, accessibility, Dynamic Type', category: 'ui' },
  { name: 'ax-design-ref', description: 'Design system reference, color tokens, typography, layout specs', category: 'ui' },

  // Data & Async
  { name: 'ax-swiftdata', description: 'SwiftData @Model, ModelContainer, queries, migrations', category: 'data' },
  { name: 'ax-core-data', description: 'Core Data stack, NSManagedObject, fetch requests, migrations', category: 'data' },
  { name: 'ax-grdb', description: 'GRDB database patterns, migrations, WAL mode, query optimization', category: 'data' },
  { name: 'ax-cloud-storage', description: 'CloudKit, iCloud Drive, NSUbiquitousKeyValueStore, conflict resolution', category: 'data' },
  { name: 'ax-file-storage', description: 'File system patterns, sandboxing, file protection, Codable serialization', category: 'data' },
  { name: 'ax-concurrency', description: 'Swift 6 concurrency, actors, Sendable, structured concurrency, @MainActor', category: 'async' },
  { name: 'ax-concurrency-ref', description: 'Concurrency API reference, Task, AsyncSequence, actor isolation rules', category: 'async' },

  // Performance & Networking
  { name: 'ax-performance', description: 'Instruments profiling, Time Profiler, Allocations, xctrace CLI', category: 'performance' },
  { name: 'ax-energy', description: 'Battery optimization, timer patterns, location accuracy, background tasks', category: 'performance' },
  { name: 'ax-energy-ref', description: 'Energy debugging reference, Power Log, thermal state monitoring', category: 'performance' },
  { name: 'ax-swift-perf', description: 'Swift performance patterns, COW, ARC optimization, generics specialization', category: 'performance' },
  { name: 'ax-networking', description: 'URLSession, async/await networking, NWPathMonitor, background downloads', category: 'networking' },
  { name: 'ax-networking-ref', description: 'Networking API reference, URL loading system, HTTP/2, certificates', category: 'networking' },

  // Integration
  { name: 'ax-storekit', description: 'StoreKit 2, in-app purchases, subscriptions, receipt validation', category: 'integration' },
  { name: 'ax-app-intents', description: 'App Intents, Shortcuts, Siri integration, parameter types', category: 'integration' },
  { name: 'ax-widgets', description: 'WidgetKit, timelines, widget families, Live Activities', category: 'integration' },
  { name: 'ax-media', description: 'AVFoundation, media playback, audio sessions, video capture', category: 'integration' },
  { name: 'ax-background-tasks', description: 'BGTaskScheduler, background refresh, processing tasks', category: 'integration' },
  { name: 'ax-core-location', description: 'CoreLocation, CLLocationManager, geofencing, significant changes', category: 'integration' },
  { name: 'ax-privacy', description: 'Privacy Manifests, required reason APIs, App Tracking Transparency', category: 'integration' },

  // AI & Vision
  { name: 'ax-foundation-models', description: 'Apple Intelligence, Foundation Models framework, @Generable, prompts', category: 'ai' },
  { name: 'ax-vision', description: 'Vision framework, image analysis, text recognition, barcode detection', category: 'ai' },
  { name: 'ax-create-ml', description: 'Create ML, model training, Core ML integration, on-device ML', category: 'ai' },

  // Graphics & Games
  { name: 'ax-3d-games', description: 'SpriteKit, SceneKit, game loops, physics, particle systems', category: 'graphics' },
  { name: 'ax-metal', description: 'Metal rendering, shaders, compute pipelines, GPU programming', category: 'graphics' },
  { name: 'ax-camera', description: 'AVCaptureSession, camera configuration, photo/video capture, interruptions', category: 'graphics' },

  // Testing
  { name: 'ax-testing', description: 'XCTest, Swift Testing, UI testing, xcresulttool, test debugging', category: 'testing' },
  { name: 'ax-simulator', description: 'iOS Simulator, simctl commands, AXe automation, screenshots, diagnostics', category: 'testing' },

  // Meta
  { name: 'ax-migration', description: 'iOS version migration guides, API changes, deprecation paths', category: 'meta' },
  { name: 'ax-wwdc', description: 'WWDC session references, framework evolution, adoption guides', category: 'meta' },
];

/**
 * Simple text search across skill names and descriptions
 */
function searchSkills(query: string): typeof SKILLS {
  const terms = query.toLowerCase().split(/\s+/);
  return SKILLS.filter((skill) => {
    const text = `${skill.name} ${skill.description} ${skill.category}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  }).slice(0, 10);
}

/**
 * Main entry point for Axiom v2 MCP Server
 */
async function main() {
  const server = new Server(
    {
      name: 'axiom-v2-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: [
        'Axiom v2 is a read-only iOS/Swift development knowledge base with 40 skills covering SwiftUI, Swift concurrency, data persistence, performance, accessibility, networking, Apple Intelligence, and more.',
        'Use axiom_search_skills to find relevant skills by keyword.',
        'All tools are read-only documentation lookups.',
      ].join(' '),
    }
  );

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'axiom_search_skills',
          description:
            'Search Axiom v2 iOS development skills by keyword. Returns matching skill names and descriptions. Use keywords like "swiftui", "concurrency", "testing", "performance", etc.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              query: {
                type: 'string',
                description:
                  'Search query - keywords to match against skill names and descriptions',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'axiom_list_skills',
          description:
            'List all available Axiom v2 skills organized by category.',
          inputSchema: {
            type: 'object' as const,
            properties: {
              category: {
                type: 'string',
                description:
                  'Optional category filter: build, ui, data, async, performance, networking, integration, ai, graphics, testing, meta',
              },
            },
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === 'axiom_search_skills') {
      const query = (args as { query: string }).query;
      const results = searchSkills(query);

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No skills found for "${query}". Try broader terms like "swiftui", "data", "testing", "build", "performance".`,
            },
          ],
        };
      }

      const formatted = results
        .map(
          (s) => `**${s.name}** [${s.category}]\n  ${s.description}`
        )
        .join('\n\n');

      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${results.length} skill(s) for "${query}":\n\n${formatted}`,
          },
        ],
      };
    }

    if (name === 'axiom_list_skills') {
      const category = (args as { category?: string }).category;
      const filtered = category
        ? SKILLS.filter((s) => s.category === category)
        : SKILLS;

      const byCategory = new Map<string, typeof SKILLS>();
      for (const skill of filtered) {
        const list = byCategory.get(skill.category) || [];
        list.push(skill);
        byCategory.set(skill.category, list);
      }

      let text = `Axiom v2 Skills (${filtered.length} total):\n\n`;
      for (const [cat, skills] of byCategory) {
        text += `## ${cat}\n`;
        for (const s of skills) {
          text += `- **${s.name}**: ${s.description}\n`;
        }
        text += '\n';
      }

      return {
        content: [{ type: 'text' as const, text }],
      };
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  });

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Start the server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
