# Agent Orchestration Kernel

> Extract the Agent orchestration layer into a reusable npm package hierarchy. Extend a new business scenario with two commands and two Markdown files — zero TypeScript required.

[中文文档](./README.zh-CN.md)

---

## Overview

The Agent Orchestration Kernel (`@od-kernel/*`) is a layered npm package architecture extracted from [Open Design](https://github.com/nexu-io/open-design). It provides agent detection, launch, stream parsing, and chat lifecycle management for **any** business domain — code review, legal document analysis, data analytics, test generation, and beyond.

### Core Philosophy

- **Business logic lives in Markdown.** Domain knowledge (`CONTEXT.md`), workflows (`SKILL.md`), and prompt templates (`prompts.md`) are plain Markdown files. No TypeScript required for domain authors.
- **Kernel upgrades via `pnpm update`.** All agent adapters, stream parsers, and platform fixes ship as independent npm packages. Your domain files stay untouched.
- **Progressive customization.** Start with the npx CLI (zero code). Graduate to manual assembly when you need custom middleware, auth, or REST endpoints.

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Business Application                    │
│  my-review-app/                                           │
│    domain/prompts.md    (prompt template — Markdown)      │
│    domain/contexts/     (domain knowledge — Markdown)     │
│    domain/workflows/    (workflow definitions — Markdown) │
│    package.json         (only depends on @od-kernel/cli)  │
├──────────────────────────────────────────────────────────┤
│                     CLI Layer                             │
│  @od-kernel/cli          Zero-config launcher + scaffolder│
├──────────────────────────────────────────────────────────┤
│                    Service Layer                          │
│  @od-kernel/chat-service    Parameterized chat handler    │
│  @od-kernel/project-service SQLite project CRUD (optional)│
│  @od-kernel/skill-utils     SKILL.md scanner / stager     │
├──────────────────────────────────────────────────────────┤
│                    Glue Layer                             │
│  @od-kernel/daemon-core    Express factory + SSE + runs   │
├──────────────────────────────────────────────────────────┤
│                    Core Layer                             │
│  @od-kernel/agent-runtime  Agent orchestration (24 agents)│
│  @od-kernel/agent-http     Typed JSON route framework     │
├──────────────────────────────────────────────────────────┤
│                    Base Layer                             │
│  @od-kernel/types          Shared error + agent types     │
└──────────────────────────────────────────────────────────┘
```

### Package Dependency Graph

```
@od-kernel/types  (zero deps)
    ↑
@od-kernel/agent-http  → types + express (peer)
@od-kernel/agent-runtime  → types
    ↑
@od-kernel/daemon-core  → agent-runtime + types + express (peer)
    ↑
@od-kernel/chat-service  → daemon-core + agent-runtime + types
    ↑
@od-kernel/cli  → chat-service + daemon-core + agent-runtime + skill-utils + types

@od-kernel/skill-utils  (zero runtime deps — standalone)
@od-kernel/project-service  → types + better-sqlite3 (standalone, optional)
```

---

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| `@od-kernel/types` | Shared error codes (27 codes), agent diagnostic types, HTTP route types (`Result<T,E>`, `JsonRouteSpec`) | ✅ |
| `@od-kernel/agent-http` | Type-safe JSON route framework — `defineJsonRoute`, `mountJsonRoute`, same-origin guard | ✅ |
| `@od-kernel/agent-runtime` | Agent detection, launch, stream parsing (Claude/Qoder/JSON), run lifecycle, ACP + Pi-RPC protocols, 24 agent definitions | ✅ |
| `@od-kernel/daemon-core` | Express app factory (auth/CORS/CSP), SSE response helpers, health/agent routes | ✅ |
| `@od-kernel/chat-service` | Parameterized chat handler with domain callbacks, BYOK proxy, prompt composer, trigger auto-matching | ✅ |
| `@od-kernel/skill-utils` | Multi-root SKILL.md scanner, YAML frontmatter parser, file staging, trigger matching (substring/regex/keyword) | ✅ |
| `@od-kernel/project-service` | Optional SQLite-backed project CRUD (auto-creates schema, prepared statements) | ✅ |
| `@od-kernel/cli` | npx CLI — `init`, `dev`, `add`, `agents`, `templates` commands + enhanced Mustache template engine | ✅ |

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 24
- **pnpm** ≥ 10.33.2 (the workspace uses Corepack-compatible version pinning)

### Option A: npx CLI (recommended — zero TypeScript)

```bash
# 1. Scaffold a new project
npx @od-kernel/cli init my-review-app --template code-review
cd my-review-app

# 2. Edit domain files (pure Markdown)
#    domain/prompts.md      ← adjust the role definition
#    domain/contexts/        ← add/modify CONTEXT.md files
#    domain/workflows/       ← add/modify SKILL.md files

# 3. Start the dev server
npx @od-kernel/cli dev
# → ready on :7456
# → auto-discovered: 1 context, 1 workflow
# → agents: claude (available), copilot (available)

# 4. Verify — explicit workflow selection
curl http://localhost:7456/api/agents
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"Review src/auth.ts","contextId":"security-audit","workflowId":"code-review"}'

# 5. Or let the system auto-match the workflow from your message
# The code-review workflow has triggers: [review, code review, security audit, ...]
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"Please review the auth module for security issues"}'
# → workflow "code-review" is auto-selected via trigger matching
```

### Option B: Manual Assembly (advanced — full control)

```bash
pnpm add @od-kernel/daemon-core @od-kernel/chat-service \
         @od-kernel/agent-runtime @od-kernel/skill-utils \
         @od-kernel/types express better-sqlite3
```

Then write `src/server.ts` (~60 lines of glue code) — see the [design document](./docs/kernel-portability-design.md) for a complete example.

### Extend to a New Domain

```bash
# npx way (recommended)
npx @od-kernel/cli add context legal-contract-law
npx @od-kernel/cli add workflow contract-review
# → Edit the generated Markdown files, restart dev server — done.

# Manual way
# 1. domain/prompts.md      ← define the role + prompt template (pure Markdown)
# 2. domain/contexts/        ← drop in CONTEXT.md files (pure Markdown)
# 3. domain/workflows/       ← drop in SKILL.md files (pure Markdown)
#    Add triggers: [contract, legal, agreement] for auto-matching.
```

---

## Key Features

### Template Engine

The Mustache-style template engine in `prompts.md` supports:

| Syntax | Description | Example |
|--------|-------------|---------|
| `{{var}}` | Simple substitution | `{{userPrompt}}` |
| `{{var:-default}}` | Default value | `{{role:-helpful assistant}}` |
| `{{#key}}...{{/key}}` | Conditional block (truthy) | `{{#instructions}}Rules: {{instructions}}{{/instructions}}` |
| `{{^key}}...{{/key}}` | Inverted block (falsy) | `{{^instructions}}No special requirements.{{/instructions}}` |
| `{{#each key}}...{{/each}}` | Iteration | `{{#each files}}- {{this}}\n{{/each}}` |
| `{{this}}` / `{{this.prop}}` | Loop context access | Current item in `#each` |

Blocks can be nested arbitrarily.

### Workflow Trigger Auto-Matching

SKILL.md files can declare `triggers` in their YAML frontmatter:

```yaml
---
name: code-review
description: Security-focused code review
triggers: [review, code review, security audit, /audit|review/i, kw:review,check]
---
```

Three trigger modes are supported:
- **Substring** (default): `"review"` matches any message containing "review" (case-insensitive)
- **Regex**: `"/review|audit/i"` matches messages with "review" or "audit"
- **Keyword** (`kw:`): `"kw:review,audit"` matches whole words only (not "preview")

When a user sends a message without an explicit `workflowId`, the system checks all workflows' triggers and auto-selects the first match. See `@od-kernel/skill-utils` `matchTrigger()` and `findMatchingWorkflow()`.

### BYOK Proxy

Bring your own API key and route through any supported provider:

```
POST /api/proxy/claude/stream       → routes to Claude Code agent
POST /api/proxy/opencode/stream     → routes to OpenCode agent
POST /api/proxy/codex/stream        → routes to Codex agent
POST /api/proxy/deepseek/stream     → routes to DeepSeek agent
```

Built-in provider→agent mappings: `claude`, `opencode`, `codex`, `gemini`, `qwen`, `deepseek`, `copilot`, `cursor`. Custom mappings can be added via `ChatRouterOptions.providerAgentMap`.

---

## API Surface

### REST Endpoints

```
# Health & Meta
GET  /api/health
GET  /api/version
GET  /api/ready

# Agent Discovery
GET  /api/agents
POST /api/agents/:id/launch-terminal    # Launch agent for interactive OAuth

# Core Chat
POST /api/chat              → SSE       # Assemble prompt → launch agent → SSE stream
POST /api/runs                          # Create a run (MCP/SDK style, no SSE)
POST /api/proxy/:provider/stream → SSE  # BYOK proxy for direct provider access

# Run Management
GET  /api/runs                           # List all runs
GET  /api/runs/:id                       # Get run status
GET  /api/runs/:id/events   → SSE       # Replay run events
POST /api/runs/:id/cancel                # Cancel a running run

# Domain Discovery (dev server auto-discovers from domain/)
GET  /api/contexts                        # List domain contexts
GET  /api/workflows                       # List domain workflows

# Project Management (when project-service is mounted)
GET    /api/projects                      # List projects
POST   /api/projects                      # Create project
GET    /api/projects/:id                  # Get project
PATCH  /api/projects/:id                  # Update project
DELETE /api/projects/:id                  # Delete project
GET    /api/projects/:id/files            # List project files
```

### SSE Events

```
event: start    → { runId, agentId, bin, cwd, model? }
event: agent    → { type: "text_delta"|"thinking_delta"|"tool_use"|"tool_result"|"file_write"|"usage", ... }
event: error    → { message, error? }
event: end      → { code, signal?, status?, resumable? }
```

### Browser-Side SSE Consumption

```typescript
import { parseSseStream } from '@od-kernel/chat-service/browser';

const response = await fetch('/api/chat', { method: 'POST', ... });
for await (const event of parseSseStream(response)) {
  if (event.type === 'agent' && event.payload.type === 'text_delta') {
    appendToChat(event.payload.text);
  }
}
```

---

## Development

### Setup

```bash
git clone <repo-url> agent-kernel
cd agent-kernel
pnpm install
```

### Build

```bash
pnpm build          # Build all 8 packages
pnpm -r build       # Same as above
```

### Test

```bash
pnpm test           # Run all tests (vitest)
# Currently: 253 tests passing across 17 test files
```

### Type Check

```bash
pnpm typecheck      # TypeScript compilation check for all packages
```

### Run a Single Package

```bash
pnpm --filter @od-kernel/agent-runtime test
pnpm --filter @od-kernel/chat-service build
```

### Project Structure

```
kernel/
├── package.json              # Workspace root
├── pnpm-workspace.yaml       # packages: ["packages/*"]
├── tsconfig.base.json        # Shared TypeScript config
├── README.md                 # This file
├── README.zh-CN.md           # Chinese documentation
├── CLAUDE.md                 # Architecture docs for AI assistants
├── docs/                     # Design documents
└── packages/
    ├── types/                # @od-kernel/types
    ├── agent-http/           # @od-kernel/agent-http
    ├── agent-runtime/        # @od-kernel/agent-runtime
    ├── daemon-core/          # @od-kernel/daemon-core
    ├── chat-service/         # @od-kernel/chat-service
    ├── skill-utils/          # @od-kernel/skill-utils
    ├── project-service/      # @od-kernel/project-service
    └── cli/                  # @od-kernel/cli
```

---

## Testing

The project uses [Vitest](https://vitest.dev/) for testing across four layers:

| Layer | Description | Packages Covered |
|-------|-------------|-----------------|
| **Unit** | Individual functions (parsers, guards, helpers, trigger matching) | All packages |
| **Integration** | Express route mounting, SSE lifecycle | agent-http, daemon-core |
| **Contract** | Domain callback correctness, template engine rendering | chat-service, cli |
| **Structural** | Agent definition field validation across all 24 agents | agent-runtime |

Key regression scenarios covered:
- Agent detection timeout handling
- Incomplete JSON multi-chunk recovery (ACP protocol)
- Role marker contamination cut-off in Claude streams
- Cross-origin request rejection
- SSE keepalive heartbeat continuity
- Template engine nested blocks, loops, defaults, inverted conditions
- Trigger matching: substring, regex, and keyword modes

---

## Design Dependency Stripping

The kernel was extracted from Open Design's monorepo. Seven files in the agent runtime had design-specific cross-dependencies that required parameterization rather than simple import path fixes:

| File | Original Design Deps | Stripping Strategy |
|------|---------------------|-------------------|
| `runs.ts` | `media/policy`, `run-tool-bundle`, `workspace-contract` | Injected via `MediaPolicyDeps` |
| `env.ts` | `app-config`, `home-expansion`, `vela-profile`, `project-root`, `sandbox-mode` | Injected via `AppConfigDeps` + `AmrIntegrationDeps` + `SandboxConfigDeps`; agent-specific logic moved to `spawnEnvCustomizer` on each agent def |
| `executables.ts` | `sandbox-mode` | Injected via `SandboxConfigDeps` |
| `detection.ts` | `integrations/vela` | Injected via `AmrIntegrationDeps` |
| `claude-stream.ts` | `role-marker-guard` | Copied into kernel (general-purpose utility) |
| `run-artifacts.ts` | `question-form-detect` | Copied into kernel (general-purpose utility) |
| `local-profiles.ts` | `sandbox-mode` | Injected via `SandboxConfigDeps` |

All injection points are optional — the kernel ships with no-op defaults so it works out of the box without any design-specific configuration. Stub files (`platform-stub.ts`, `sandbox-stub.ts`, `vela-profile-stub.ts`, `app-config-stub.ts`) provide minimal standalone behavior.

---

## Version Strategy

All packages use **lockstep versioning** during the v0.x / v1.x phase:

```
@od-kernel/types           v0.1.0
@od-kernel/agent-http       v0.1.0
@od-kernel/agent-runtime    v0.1.0
@od-kernel/daemon-core      v0.1.0
@od-kernel/chat-service     v0.1.0
@od-kernel/skill-utils      v0.1.0
@od-kernel/project-service  v0.1.0
@od-kernel/cli              v0.1.0
```

Inter-package dependencies use `workspace:*` during development and `^0.1.0` when published. Migration to independent semver is planned for v2+ once interfaces stabilize.

---

## License

Apache-2.0 © Open Design Contributors

This project contains code extracted from [Open Design](https://github.com/nexu-io/open-design) ([Apache-2.0](https://github.com/nexu-io/open-design/blob/main/LICENSE)).

Modifications from the original:
- Extracted from the monorepo as standalone packages.
- `acp.ts` and `pi-rpc.ts` relocated to the runtime protocol directory.
- Import paths adjusted to resolve within standalone packages.
- Design-specific error codes trimmed from the shared type definitions.
- Seven design-coupled files parameterized with dependency injection interfaces.
- Hardcoded agent ID branches in `env.ts` replaced with polymorphic `spawnEnvCustomizer`.
- Six thin agent definitions (kilo, kiro, vibe, qwen, kimi, trae-cli) completed with full metadata.
- Template engine enhanced with nested blocks, loops, defaults, and inverted conditions.
- Workflow trigger auto-matching added (substring, regex, keyword modes).
- BYOK proxy expanded with configurable provider→agent mapping.

---

## Contributing

See [Open Design CONTRIBUTING.md](https://github.com/nexu-io/open-design/blob/main/CONTRIBUTING.md) for the upstream contribution guide. This kernel follows the same conventions and workflows.
