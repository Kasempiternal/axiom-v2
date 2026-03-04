---
name: optimize-build
description: Scan Xcode project for build performance optimizations
disable-model-invocation: true
---

# Optimize Build Performance

Analyzes your Xcode project for build performance optimization opportunities.

## What It Does

1. Scan build settings for quick wins (compilation mode, architecture settings)
2. Check build phase scripts for conditional execution
3. Identify type checking performance issues
4. Detect suboptimal compiler flags
5. Provide specific fixes with expected time savings

## Expected Results

Based on typical findings:
- **30-50% faster** incremental debug builds
- **5-10 seconds saved** per build from conditional scripts
- **Measurable improvements** in Build Timeline

## Prefer Natural Language?

- "My builds are slow"
- "How can I speed up build times?"
- "Optimize my Xcode build performance"

## Deep Dive

For comprehensive build analysis, use the `ax-build` skill directly.
