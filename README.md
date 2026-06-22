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
│  @open-design/platform     OS process primitives (external)│
└──────────────────────────────────────────────────────────┘
```

### Package Dependency Graph

```
@od-kernel/types  (zero deps)
    ↑
@od-kernel/agent-http  → types + express (peer)
    ↑
@od-kernel/agent-runtime  → types + @open-design/platform (external)
    ↑
@od-kernel/daemon-core  → types + agent-http + express (peer)
    ↑
@od-kernel/chat-service  → daemon-core + agent-runtime + types
    ↑
@od-kernel/cli  → chat-service + daemon-core + agent-runtime + skill-utils

@od-kernel/skill-utils  → types (standalone)
@od-kernel/project-service  → types + better-sqlite3 (standalone, optional)
```

---

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| `@od-kernel/types` | Shared error codes, agent diagnostic types, HTTP route types (~120 lines) | ✅ |
| `@od-kernel/agent-http` | Type-safe JSON route framework — `Result<T,E>`, `defineJsonRoute`, `mountJsonRoute` | ✅ |
| `@od-kernel/agent-runtime` | Agent detection, launch, stream parsing, run lifecycle for 24+ agents | ✅ |
| `@od-kernel/daemon-core` | Express app factory, SSE response helpers, health/agent routes | ✅ |
| `@od-kernel/chat-service` | Parameterized chat handler with pluggable domain callbacks | ✅ |
| `@od-kernel/skill-utils` | Multi-root SKILL.md scanner, YAML frontmatter parser, file staging | ✅ |
| `@od-kernel/project-service` | Optional SQLite-backed project CRUD | ✅ |
| `@od-kernel/cli` | npx CLI — `init`, `dev`, `add` commands + Mustache template engine | ✅ |

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

# 4. Verify
curl http://localhost:7456/api/agents
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"Review src/auth.ts","contextId":"security-audit","workflowId":"code-review"}'
```

### Option B: Manual Assembly (advanced — full control)

```bash
pnpm add @od-kernel/daemon-core @od-kernel/chat-service \
         @od-kernel/agent-runtime @od-kernel/skill-utils \
         @od-kernel/types @open-design/platform \
         express better-sqlite3
```

Then write `src/server.ts` (~60 lines of glue code) — see the [design document](./docs/kernel-portability-design.md) for a complete example.

### Extend to a New Domain

```bash
# npx way (recommended)
npx @od-kernel/cli add context legal-contract-law
npx @od-kernel/cli add workflow contract-review
# → Edit the generated Markdown files, restart dev server — done.

# Manual way
# 1. domain/prompts.ts     ← define the role + prompt assembly (~30 lines TS)
# 2. domain/contexts/       ← drop in CONTEXT.md files (pure Markdown)
# 3. domain/workflows/      ← drop in SKILL.md files (pure Markdown)
# Then update 3 import paths in src/server.ts.
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
# Currently: 124 tests passing across 16 test files
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

## API Surface

### REST Endpoints (provided by daemon-core + chat-service)

```
GET  /api/health                          # Health check
GET  /api/version                         # Version info
GET  /api/agents                          # Agent list + capabilities
GET  /api/contexts                        # Domain contexts
GET  /api/workflows                       # Domain workflows
POST /api/chat              → SSE        # Core: assemble prompt → launch agent → SSE stream
GET  /api/runs/:id/events   → SSE        # Run event replay
POST /api/runs/:id/cancel                 # Cancel a run
GET  /api/runs                            # Run list
GET  /api/runs/:id                        # Run status
```

### SSE Events

```
event: start    → { runId, agentId, bin, cwd, model? }
event: agent    → { type: "text_delta"|"thinking_delta"|"tool_use"|"tool_result"|"usage", ... }
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

## Testing

The project uses [Vitest](https://vitest.dev/) for testing across four layers:

| Layer | Description | Packages Covered |
|-------|-------------|-----------------|
| **Unit** | Individual functions (parsers, guards, helpers) | All packages |
| **Integration** | Express route mounting, SSE lifecycle | agent-http, daemon-core |
| **Contract** | Domain callback correctness across 3 simulated domains | chat-service |
| **E2E** | Full SSE stream validation with mock agents | cli |

Key regression scenarios covered:
- Agent detection timeout handling
- Incomplete JSON multi-chunk recovery (ACP protocol)
- Role marker contamination cut-off in Claude streams
- Cross-origin request rejection
- SSE keepalive heartbeat continuity

---

## Design Dependency Stripping

The kernel was extracted from Open Design's monorepo. Seven files in the agent runtime had design-specific cross-dependencies that required parameterization rather than simple import path fixes:

| File | Original Design Deps | Stripping Strategy |
|------|---------------------|-------------------|
| `runs.ts` | `media/policy`, `run-tool-bundle`, `workspace-contract` | Injected via `MediaPolicyDeps` |
| `env.ts` | `app-config`, `home-expansion`, `vela-profile`, `project-root`, `sandbox-mode` | Injected via `AppConfigDeps` + `AmrIntegrationDeps` + `SandboxConfigDeps` |
| `executables.ts` | `sandbox-mode` | Injected via `SandboxConfigDeps` |
| `detection.ts` | `integrations/vela` | Injected via `AmrIntegrationDeps` |
| `claude-stream.ts` | `role-marker-guard` | Copied into kernel (general-purpose utility) |
| `run-artifacts.ts` | `question-form-detect` | Copied into kernel (general-purpose utility) |
| `local-profiles.ts` | `sandbox-mode` | Injected via `SandboxConfigDeps` |

All injection points are optional — the kernel ships with no-op defaults so it works out of the box without any design-specific configuration.

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

---

## Contributing

See [Open Design CONTRIBUTING.md](https://github.com/nexu-io/open-design/blob/main/CONTRIBUTING.md) for the upstream contribution guide. This kernel follows the same conventions and workflows.
