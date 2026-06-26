# od-agent-kernel — Agent Orchestration Kernel

A TypeScript monorepo that provides a unified orchestration layer for 24 CLI coding
agents (Claude Code, Codex, Aider, Copilot, Cursor, Gemini, DeepSeek, Qwen, …).
Extracted from the Open Design monorepo to serve as a standalone, design-agnostic
kernel that downstream consumers inject their own platform integrations into.

## Architecture

```
┌──────────────────────────────────────────────────┐
│                 CLI (npx od-kernel)               │
│      init / dev / add / agents / templates        │
├──────────────────────────────────────────────────┤
│            Chat Service (Express router)          │
│   POST /api/chat → compose → run → SSE stream     │
├──────────────────────────────────────────────────┤
│           Daemon Core (Express app factory)        │
│   createApp / SSE / agent-routes / run-service    │
├──────────────────────────────────────────────────┤
│           Agent Runtime (orchestration kernel)     │
│  orchestrator / detection / stream-parsers /       │
│  24 agent-defs / ACP / Pi-RPC / run-lifecycle     │
├──────────────────────────────────────────────────┤
│  Types / Skill-Utils / Project-Service / Agent-HTTP│
└──────────────────────────────────────────────────┘
```

### Package dependency graph

```
types         — zero deps, shared contracts
skill-utils   — zero deps, SKILL.md scanner
agent-runtime — depends on types
agent-http    — depends on types
daemon-core   — depends on agent-runtime, types
chat-service  — depends on agent-runtime, daemon-core, types
project-service — depends on types
cli           — depends on everything above
```

## Package responsibilities

### `@od-kernel/types`
Shared type contracts: `AgentInfo`, `AgentDiagnostic`, `ApiError`, `Result<T,E>`,
`JsonRouteSpec`, HTTP route framework types. Zero runtime dependencies.

### `@od-kernel/agent-runtime`
The kernel. Provides:
- **24 agent definitions** (`defs/`) — one file per CLI agent with `buildArgs`,
  `listModels`, `fetchModels`, `streamFormat`, `eventParser`, etc.
- **Detection** (`detection.ts`) — probes agent binaries for availability,
  version, auth status, capabilities, and live model lists. Probes run in
  parallel both within one agent and across agents (all probed concurrently
  via `Promise.all`; `detectAgentsStream` yields each in completion order).
- **Orchestrator** (`orchestrator.ts`) — the main entry point: spawns the
  agent subprocess, attaches a stream parser, and yields unified `AgentEvent`s.
- **Stream parsers** — `claude-stream.ts` (Claude Code stream-json),
  `qoder-stream.ts` (Qoder CLI), `json-event-stream.ts` (generic JSONL).
- **Protocol handlers** — `protocol/acp.ts` (Agent Communication Protocol,
  1,351 lines), `protocol/pi-rpc.ts` (Pi RPC, 684 lines).
- **Run lifecycle** (`runs.ts`) — state machine: queued → running → succeeded |
  failed | cancelled, with SSE listener tracking and TTL cleanup.
- **Dependency injection** (`deps.ts`) — `RuntimeModuleDeps` with four
  injectable facets: `SandboxConfigDeps`, `AmrIntegrationDeps`,
  `AppConfigDeps`, `MediaPolicyDeps`. Each has a no-op default.

### `@od-kernel/daemon-core`
Express.js integration layer:
- `createApp()` — Express factory with optional Bearer auth, CORS, CSP.
- `createSseResponse()` — SSE helper with 15s keepalive heartbeat.
- `registerAgentRoutes()` — `GET /api/agents`, `POST /api/agents/:id/launch-terminal`.
- `createDaemonRunService()` — wraps core RunService with Express SSE binding.

### `@od-kernel/chat-service`
The main chat endpoint (`POST /api/chat`):
- **Phase 1** (pre-SSE): resolve context/workflow, stage skill files.
  Failures return HTTP 400/500.
- **Phase 2** (pre-SSE): compose system prompt from template + context + workflow.
- **Phase 3** (SSE): create run, spawn agent via orchestrator, stream events.
  Errors after this point are delivered as SSE error events.
- Also provides: `POST /api/runs` (MCP/SDK-style), `POST /api/proxy/:provider/stream` (BYOK),
  run management endpoints (`GET/DELETE /api/runs/:id`).

### `@od-kernel/cli`
The `od-kernel` CLI binary:
- `od-kernel init <name> --template <name>` — scaffold a new project.
- `od-kernel dev` — start dev server with auto-discovery of `domain/`.
- `od-kernel add context|workflow <name>` — add domain files.
- `od-kernel agents` — detect and list installed agents.
- `od-kernel templates` — list available project templates.

### `@od-kernel/skill-utils`
- `listSkills()` — scan directories for `SKILL.md` files, parse YAML frontmatter.
- `stageSkillFiles()` — copy skill directory to `.od-skills/` in the project cwd.

### `@od-kernel/project-service`
Optional SQLite-backed project CRUD. Falls back to in-memory Map when no
`better-sqlite3` database is provided.

### `@od-kernel/agent-http`
Type-safe JSON route framework:
- `defineJsonRoute()` — identity function that pins generic parameters.
- `mountJsonRoute()` — adapter between Express and typed route specs.
- `origin-guard.ts` — same-origin policy enforcement.

## Design principles

### 1. Dependency injection over direct imports
All Open Design-specific integrations are injected through `RuntimeModuleDeps`.
The kernel ships with no-op defaults so it compiles and runs standalone.
Downstream consumers (e.g. the Open Design daemon) provide real implementations.

### 2. Agent definitions are data, not code
Each agent is a `RuntimeAgentDef` object with declarative fields.
Adding a new agent means creating one file in `defs/` and adding it to the
`BUILTIN_DEFS` array. No other code changes required.

### 3. Errors are typed and explicit
Uses `Result<T, E>` (discriminated union) throughout the HTTP layer.
API errors use a closed set of error codes (`API_ERROR_CODES`).
Pre-SSE errors → HTTP status codes. Post-SSE errors → SSE error events.

### 4. Streaming is first-class
Agent output is parsed in real time and delivered as typed `AgentEvent`s:
`thinking`, `tool_call`, `tool_result`, `text_delta`, `file_write`, `error`, `done`.

### 5. Markdown-native extensibility
Business scenarios are defined in markdown: `prompts.md` for system prompts,
`CONTEXT.md` for domain knowledge, `SKILL.md` for workflows. No code changes
needed to add a new business scenario.

## Key files to read first

| File | Purpose |
|------|---------|
| `packages/agent-runtime/src/types.ts` | Core type definitions |
| `packages/agent-runtime/src/orchestrator.ts` | Main agent execution entry point |
| `packages/agent-runtime/src/detection.ts` | Agent detection and probing |
| `packages/agent-runtime/src/defs/index.ts` | Agent definition registry |
| `packages/agent-runtime/src/defs/claude.ts` | Example agent definition |
| `packages/agent-runtime/src/deps.ts` | Dependency injection interfaces |
| `packages/chat-service/src/chat-handler.ts` | Chat endpoint implementation |
| `packages/types/src/agent-types.ts` | Public API types |
| `packages/types/src/errors.ts` | Error codes and types |

## Development

```bash
pnpm install          # install dependencies
pnpm build            # build all packages
pnpm test             # run all tests
pnpm typecheck        # type-check all packages
```

### Adding a new agent
1. Create `packages/agent-runtime/src/defs/<agent>.ts`
2. Export a `RuntimeAgentDef` object
3. Add it to `BUILTIN_DEFS` array in `defs/index.ts`
4. If it uses a custom stream format, add a parser

### Adding a new template
1. Create `packages/cli/src/templates/<name>/` with:
   - `prompts.md` — system prompt template
   - `contexts/<name>/CONTEXT.md` — domain context
   - `workflows/<name>/SKILL.md` — workflow definition

### Testing philosophy
- Unit tests for pure logic (parsers, composers, type guards)
- Structural tests for agent definitions (all required fields present)
- Integration tests for the chat-service routes
- No tests that require actual agent binaries (those live in the Open Design monorepo)
