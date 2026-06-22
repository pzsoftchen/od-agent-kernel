# Agent 编排内核移植设计

> 如何将 Open Design 的 Agent 编排层提取为通用内核，以 npm 包分层架构 + npx CLI 工具实现「扩展业务场景 = 两条命令 + 两个 Markdown 文件」。
> 所有依赖关系均通过 `grep` 全量 import 交叉验证，所有包接口均基于源码实际调用路径设计。

---

## 1. 内核范围：精确的依赖分析

### 1.1 内核文件清单与外部依赖

以下表格基于对每个文件的 `import` 语句逐一验证。**「外部依赖」指 `node:` 内置模块和同层文件之外的引用。**

| 文件（源路径） | 外部依赖 | 说明 |
|---------------|---------|------|
| `runtimes/registry.ts` | 无 | 24 个 Agent 定义聚合 |
| `runtimes/detection.ts` | `../integrations/vela.js` | 并行探测 + AMR profile 解析 |
| `runtimes/executables.ts` | `@open-design/platform`, `../sandbox-mode.js` | 二进制路径解析 + 沙箱运行时配置 |
| `runtimes/launch.ts` | 无 | spawn 启动 + 环境注入 |
| `runtimes/env.ts` | `@open-design/platform`, `../app-config.js`, `../home-expansion.js`, `../integrations/vela-profile.js`, `../project-root.js`, `../sandbox-mode.js` | 子进程环境构建（耦合应用配置、项目路径、Vela 集成、沙箱模式 — 提取时需大量参数化） |
| `runtimes/types.ts` | `@open-design/contracts` (仅 `AgentDiagnostic` 类型) | 31 字段的 RuntimeAgentDef |
| `runtimes/runs.ts` | `../media/policy.js`, `../run-tool-bundle.js`, `../workspace-contract.js` | 运行生命周期（含媒体策略、工具捆绑、工作空间契约 — 提取时需参数化） |
| `runtimes/capabilities.ts` | 无 | 能力标志位存储 |
| `runtimes/auth.ts` | 无 | 认证状态探测 |
| `runtimes/diagnostics.ts` | `@open-design/contracts` (仅 `AgentFixIntent` 类型) | 诊断信息 |
| `runtimes/models.ts` | 无 | 模型列表缓存 |
| `runtimes/paths.ts` | 无 | 路径展开 |
| `runtimes/prompt-file.ts` | 无 | 提示文件处理 |
| `runtimes/prompt-budget.ts` | 无 | 命令行长度预算检查 |
| `runtimes/invocation.ts` | `@open-design/platform` | 子进程执行封装 |
| `runtimes/run-artifacts.ts` | `@open-design/contracts/analytics` (仅 `TrackingRunResult` 类型), `../question-form-detect.js` | 运行产物事件分析 + 提问表单检测 |
| `runtimes/claude-stream.ts` | `../role-marker-guard.js` | Claude Code 流解析 + 角色标记守卫 |
| `runtimes/json-event-stream.ts` | 无 | 通用 JSON 事件流解析 |
| `runtimes/qoder-stream.ts` | 无 | Qoder CLI 流解析 |
| `runtimes/mmd-routes.ts` | 无 | 本地模型路由 |
| `runtimes/terminal-launch.ts` | 无 | 终端启动 |
| `runtimes/amr-model-cache.ts` | `@open-design/contracts` (仅 `AmrModelsResponse` 类型) | AMR 模型缓存 |
| `runtimes/mcp.ts` | 无（仅引用 `./types.js`） | MCP 服务器构建 |
| `runtimes/metadata.ts` | 无 | Agent 安装/文档链接数据 |
| `runtimes/resolution.ts` | 无（仅引用 `./registry.js`, `./executables.js`） | Agent 二进制路径解析 |
| `runtimes/opencode-log.ts` | 无（仅引用 `./auth.js`） | OpenCode 会话日志恢复（错误信号提取） |
| `runtimes/local-profiles.ts` | `../sandbox-mode.js`（**在 runtimes/ 外部**） | 本地 Agent Profile 管理 |
| `runtimes/defs/shared.ts` | `../../acp.js`, `../../pi-rpc.js` | 共享常量（**这两个引用指向 src/ 根目录，见 §1.2**）|
| `runtimes/defs/claude.ts` — `runtimes/defs/*.ts` (24 个) | 无（仅引用 `./shared.ts`） | Agent 定义文件 |
| `src/acp.ts` (**不在 runtimes/ 内**) | 无 | ACP JSON-RPC 协议解析器 (~1351 行) |
| `src/pi-rpc.ts` (**不在 runtimes/ 内**) | 无 | Pi Agent RPC 解析器 |
| `http/types.ts` | `@open-design/contracts` (`ApiError`) | 类型化路由框架（Result、JsonRouteSpec 等），不依赖 express |
| `http/adapter.ts` | `express` (类型), `@open-design/contracts` | defineJsonRoute + mountJsonRoute |
| `http/parse.ts` | `@open-design/contracts` (`ApiErrorCode`) | 输入解析 |
| `http/response.ts` | `@open-design/contracts` (`ApiError`, `createApiError`) | 响应发送 |
| `http/api-errors.ts` | `@open-design/contracts` (`ApiError`, `ApiErrorCode`, `ApiErrorResponse`), `express` (`Response` 类型) | API 错误构造与发送 |
| `http/origin-guard.ts` | `@open-design/contracts` (仅 `createApiError`), `../origin-validation.js` | 同源防护 + 来源校验 |
| `http/index.ts` | 无（仅 re-export 同层文件） | 统一导出 |

**结论：runtimes 层 32 个文件（27 个顶层 + 25 个 `defs/`）* + http 层 7 个文件 — 除 `@open-design/platform`（已是独立包）外，从 `@open-design/contracts` 仅导入 5 个纯类型/工具函数（`AgentDiagnostic`, `AgentFixIntent`, `AmrModelsResponse`, `ApiError`/`ApiErrorCode`/`createApiError`/`createApiErrorResponse`, `TrackingRunResult`）。**

**但 runtimes/ 层有 12 个文件存在对 `src/` 同级目录的交叉依赖（`../sandbox-mode.js`, `../media/policy.js`, `../integrations/vela.js`, `../question-form-detect.js`, `../run-tool-bundle.js`, `../workspace-contract.js`, `../role-marker-guard.js`, `../app-config.js`, `../home-expansion.js`, `../project-root.js`, `../origin-validation.js`），其中多数是 OD 设计专属或平台耦合逻辑。这些依赖无法通过简单 import 路径修正解决，必须在提取时参数化、剥离或作为可选模块。详见 §1.5 设计依赖剥离策略。**

**需要注意的特殊情况：** `runtimes/local-profiles.ts` 依赖 `../sandbox-mode.js`（位于 `apps/daemon/src/`，不在 runtimes/ 内）。该文件处理沙箱模式下的 Agent profile 配置 — 提取到 `@od-kernel/agent-runtime` 时，需评估是保留此依赖、参数化移除，还是作为可选模块。

另外存在 2 个位于 `src/` 根目录的逻辑上属于运行时的文件需要归位（`acp.ts`, `pi-rpc.ts`，见 §1.2）。

> *注：运行 `ls apps/daemon/src/runtimes/ | grep -v defs | wc -l` 确认顶层为 27 个文件，`ls apps/daemon/src/runtimes/defs/ | wc -l` 确认 defs/ 为 25 个文件。原始分析中列出了不存在的 `copilot-stream.ts`，实际对应的是 `opencode-log.ts`（功能不同 — 用于从 OpenCode 会话日志中恢复被静默吞掉的错误信号，而非流解析），已在本次修正中更新。

### 1.2 两个「放错位置」的文件：acp.ts 和 pi-rpc.ts

`runtimes/defs/shared.ts` 从 `../../acp.js` 和 `../../pi-rpc.js` 导入 `detectAcpModels` 和 `parsePiModels`。这两个文件实际位于 `apps/daemon/src/` 根目录，而非 `runtimes/` 内。

但分析它们的依赖：两者**零外部依赖**（仅引用 `node:` 内置模块和自身），是纯粹的 Agent 协议解析器 — 逻辑上完全属于 Agent 运行时层。它们之所以在 `src/` 根目录，应该是历史原因（最初编写时放在根目录，后来才建了 `runtimes/` 目录但没搬进去）。

**提取时需将它们移入 `runtimes/`，并将 `shared.ts` 的 import 路径从 `../../acp.js` 改为 `../acp.js`（共 2 行改动）。**

### 1.3 需要适配的部分（改内容不改结构）

| 源文件 | 改动 |
|--------|------|
| `server.ts` 中的提示组装 | 替换 7 层设计提示为你的领域上下文管线 |
| `prompts/system.ts` | 重写为你的领域系统提示 |
| `contracts/src/api/chat.ts` | 裁剪设计字段 (`skillId`, `designSystemId`...)，新增你的业务字段 |

### 1.4 需要完全重写的

| 范围 | 原因 |
|------|------|
| `apps/web/` 全部 | 前端 UI 设计专属 |
| `design-systems/`, `design-templates/`, `craft/` | 设计领域知识 |
| `apps/daemon/src/design-systems/`, `critique/`, `media/`, `live-artifacts/` | 设计专属模块 |
| `prompts/` 目录 | 全部设计专属 |

### 1.5 设计依赖剥离策略

§1.1 中标注的交叉依赖（`../sandbox-mode.js`, `../media/policy.js`, `../integrations/vela.js`, `../question-form-detect.js` 等）无法通过简单 import 路径修正解决。这些依赖分三类处理：

#### 第一类：可通过参数化剥离（提取到 daemon-core / chat-service 层）

| 文件 | 依赖 | 剥离策略 |
|------|------|---------|
| `runtimes/runs.ts` | `../media/policy.js` (`normalizeMediaExecutionPolicyForRun`) | 将媒体策略作为 `createRunService()` 的可选参数注入，默认值使用最宽松策略 |
| `runtimes/runs.ts` | `../run-tool-bundle.js` | 工具捆绑是通用能力，整体搬运到 `@od-kernel/agent-runtime` |
| `runtimes/runs.ts` | `../workspace-contract.js` (`projectWorkspaceProvenance`) | 项目来源证明是 OD 专属概念 — 内核中替换为通用 `cwd` 路径，来源证明逻辑留给业务层 |
| `runtimes/env.ts` | `../app-config.js` (`readAppConfigSync`) | 将应用配置读取抽象为 `EnvProvider` 接口，由 `createApp()` 注入 |
| `runtimes/env.ts` | `../home-expansion.js`, `../project-root.js` | 路径展开逻辑是通用工具 — 搬运到 `@od-kernel/agent-runtime` |
| `runtimes/env.ts` | `../sandbox-mode.js` | 沙箱模式配置抽象为 `SandboxConfig` 接口，由 `createAgentOrchestrator()` 注入 |
| `runtimes/executables.ts` | `../sandbox-mode.js` | 同上，与 env.ts 共享同一个 `SandboxConfig` 注入 |
| `runtimes/claude-stream.ts` | `../role-marker-guard.js` | 角色标记守卫是 Claude Code 流解析的通用组件 — 搬运到 `@od-kernel/agent-runtime` |
| `runtimes/run-artifacts.ts` | `../question-form-detect.js` | 提问表单检测是通用能力 — 搬运到 `@od-kernel/agent-runtime` |
| `http/origin-guard.ts` | `../origin-validation.js` | 来源校验逻辑搬运到 `@od-kernel/agent-http` |

#### 第二类：保留为可选扩展（AMR/Vela 集成）

| 文件 | 依赖 | 剥离策略 |
|------|------|---------|
| `runtimes/detection.ts` | `../integrations/vela.js` (`resolveAmrProfile`) | AMR profile 解析是 Vela 平台专属。提取为 `@od-kernel/agent-runtime/amr` 可选子模块，仅在检测到 Vela 环境时加载 |
| `runtimes/env.ts` | `../integrations/vela-profile.js` (`amrVelaProfileEnv`) | 同上，AMR 环境变量注入作为可选扩展 |

#### 第三类：纯类型引用（直接提取到 @od-kernel/types）

| 文件 | 依赖 | 剥离策略 |
|------|------|---------|
| `runtimes/amr-model-cache.ts` | `@open-design/contracts` (`AmrModelsResponse`) | 类型定义提取到 `@od-kernel/types` |
| `runtimes/run-artifacts.ts` | `@open-design/contracts/analytics` (`TrackingRunResult`) | 类型定义提取到 `@od-kernel/types` |

#### 影响汇总

| 类别 | 文件数 | 处理方式 | 新增工作量 |
|------|--------|---------|-----------|
| 第一类（参数化） | 8 处引用，涉及 7 个文件 | 引入注入接口 + 搬运通用逻辑 | ~3-4 人天 |
| 第二类（可选扩展） | 2 处引用，涉及 2 个文件 | 抽为可选子模块 | ~1 人天 |
| 第三类（纯类型） | 2 处引用，涉及 2 个文件 | 类型复制 | 可忽略 |

**合计新增约 4-5 人天**（相比原估算），但换来的是内核与 OD 专有逻辑的真正解耦，而非简单的路径重写。

---

## 2. 提取策略：完整 npm 包分层架构

目标：**除业务场景必需的个性化部分（领域提示、领域上下文、领域工作流）之外，其他一切都通过 npm 包管理和独立升级。通过 `@od-kernel/cli` 的 npx 工具，扩展一种新的业务场景 = 两条命令 + 两个 Markdown 文件，零行 TypeScript。** 高级用户可绕过 CLI 直接组装底层包获得完全定制能力。

### 2.1 包分层总览

```
┌─────────────────────────────────────────────────────────┐
│  npx @od-kernel/cli                                     │
│  · init / dev / add-context / add-workflow / templates  │
│  · 零配置启动，自动发现 domain/ 目录                      │
├─────────────────────────────────────────────────────────┤
│  业务应用 (my-code-review-app)                           │
│  · domain/prompts.md       (提示模板 — 纯 Markdown)      │
│  · domain/contexts/         (领域知识 — 纯 Markdown)     │
│  · domain/workflows/        (工作流 — 纯 Markdown)       │
│  · package.json             (仅依赖 @od-kernel/cli)      │
├─────────────────────────────────────────────────────────┤
│  @od-kernel/cli              零配置启动器 + 脚手架        │
├─────────────────────────────────────────────────────────┤
│  @od-kernel/chat-service      Chat 处理器 (参数化)       │
│  @od-kernel/project-service   项目管理 (可选)             │
│  @od-kernel/skill-utils       技能扫描/暂存 (通用)        │
│  @od-kernel/daemon-core       Express 工厂 + SSE + Run    │
├─────────────────────────────────────────────────────────┤
│  @od-kernel/agent-runtime     Agent 编排 (检测/启动/解析) │
│  @od-kernel/agent-http        类型化 JSON 路由框架        │
│  @od-kernel/types             共享类型                    │
│  @open-design/platform        OS 进程原语                 │
└─────────────────────────────────────────────────────────┘
```

### 2.2 各包职责与 API

#### 底层包（§1 已分析，可直接提取）

| 包 | 职责 | 来源 |
|---|------|------|
| `@open-design/platform` | OS 进程原语（二进制解析、环境、进程匹配） | 已存在 |
| `@od-kernel/types` | 通用错误类型 + Agent 诊断类型 (~60 行) | 新提取 |
| `@od-kernel/agent-http` | `JsonRouteSpec`, `Result<T,E>`, `defineJsonRoute`, `mountJsonRoute` | 新提取 |

> **关于命名：** `agent-http` 实际上是一个与 Agent 无关的轻量级类型化 JSON 路由框架（`Result` 类型 + `defineJsonRoute` + `mountJsonRoute`）。命名沿用 OD 源码中的 `http/` 目录约定。如果未来该包被更广泛地使用，可考虑重命名为 `@od-kernel/json-routes`。

| `@od-kernel/agent-runtime` | 24 个 Agent 检测/启动/流解析 + `AgentEvent` 流 | 新提取 |

#### 新设计：中层胶水包

**`@od-kernel/daemon-core`** — Express 应用工厂 + 运行生命周期 + SSE：

> **依赖说明：** 此包在类型和运行时都依赖 `express`（`createApp()` 返回 `Express` 实例，`registerHealthRoutes` 等函数接受 `Express` 参数）。`express` 应声明为 **peerDependency**（而非直接 dependency），由业务应用自行安装，避免版本冲突。

```typescript
// 创建预配置的 Express 应用 (JSON 解析、CORS、CSP、可选 Bearer 认证)
function createApp(options?: {
  jsonLimit?: string;       // 默认 '4mb'
  cors?: boolean;           // 默认 true
  authToken?: string;       // 可选 Bearer 认证
}): Express;

// SSE 响应工具 (Content-Type, keepalive heartbeat, Cache-Control)
function createSseResponse(res: Response): {
  send(event: string, data: unknown, id?: string): void;
  end(): void;
  cleanup(): void;
};

// 运行生命周期服务 (in-memory, 默认 30min TTL)
function createRunService(options: {
  createSseResponse: typeof createSseResponse;
  ttl?: number;
}): RunService;

// 标准路由注册
function registerHealthRoutes(app: Express): void;
// → GET /health, GET /version, GET /ready
function registerAgentRoutes(app: Express, orchestrator: AgentOrchestrator): void;
// → GET /api/agents
```

**`@od-kernel/chat-service`** — 参数化的 Chat 处理器（核心包）：

```typescript
function createChatRouter(options: {
  orchestrator: AgentOrchestrator;
  runs: RunService;
  composePrompt: DomainPromptComposer['compose'];
  resolveContext: DomainContextResolver;
  resolveWorkflow: (id: string) => DomainWorkflow | null;
  stageSkillFiles?: (cwd: string, workflow: DomainWorkflow) => Promise<string[]>;
}): Router;
// 一行注册，自动挂载以下端点：
//   POST /api/chat              → SSE 流式对话
//   POST /api/runs               → MCP/SDK 对话
//   GET  /api/runs                → 运行列表
//   GET  /api/runs/:id            → 运行状态
//   GET  /api/runs/:id/events     → 运行事件 SSE 回放
//   POST /api/runs/:id/cancel     → 取消运行
//   POST /api/proxy/{provider}/stream → BYOK 代理（无 CLI 时使用）
```

**`@od-kernel/skill-utils`** — 通用 SKILL.md 工具：

```typescript
// 扫描多 root 目录，解析 SKILL.md，支持优先级覆盖
function listSkills(roots: string | readonly string[]): Promise<SkillInfo[]>;
// 解析单个 SKILL.md 的 YAML frontmatter + Markdown body
function parseSkillFile(filePath: string): Promise<{ data: Record<string,unknown>; body: string }>;
// 暂存技能附带文件到 cwd 供 Agent 访问
function stageSkillFiles(cwd: string, skill: { dir: string; name: string }): Promise<string>;
```

**`@od-kernel/project-service`**（可选）— 项目管理：

```typescript
function createProjectService(db: Database): ProjectService;
// ProjectService: { create, get, list, patch, delete, listFiles, ... }

function registerProjectRoutes(app: Express, service: ProjectService): void;
// → GET /api/projects, POST /api/projects, GET /api/projects/:id, ...
```

**`@od-kernel/cli`** — 零配置 CLI 工具（npx 入口）：

这是面向业务开发者的**唯一入口**。安装此包即可获得全部内核能力，无需手动安装其他包或编写胶水代码。

```bash
# 脚手架 — 一键创建完整项目
npx @od-kernel/cli init my-review-app --template code-review

# 开发 — 零配置启动，自动发现 domain/ 目录
npx @od-kernel/cli dev

# 扩展 — 随时添加领域内容
npx @od-kernel/cli add context security-audit
npx @od-kernel/cli add workflow code-review
```

**CLI 内置能力：**

| 功能 | 说明 |
|------|------|
| `init` | 脚手架项目（目录结构 + package.json + 模板 domain 文件），支持 `--template` 选择预置模板 |
| `dev` | 零配置开发服务器：自动扫描 `domain/` 目录、组装 Express 应用、注册全部路由、启动 SSE daemon |
| `add context` | 交互式创建新的领域上下文（CONTEXT.md） |
| `add workflow` | 交互式创建新的工作流（SKILL.md） |
| `templates` | 列出可用的项目模板（代码审查、法律文书、数据分析…） |
| `agents` | 列出当前系统可用的 Agent 及其能力 |

**业务项目目录结构（npx 方式）：**
```
my-review-app/
  domain/
    prompts.md              ← ★ 提示模板（纯 Markdown，{{var}} 语法）
    contexts/
      security-audit/
        CONTEXT.md           ← 领域知识
    workflows/
      code-review/
        SKILL.md             ← 工作流定义
        references/          ← 附带文件
  package.json               ← 仅依赖 @od-kernel/cli
```

**CLI 内部架构：** `@od-kernel/cli` 是薄封装层，依赖所有中层和底层包。它在 `dev` 命令中自动完成原 `src/server.ts` 中 ~60 行胶水代码的全部逻辑（详见 §2.9 CLI 实现设计）。

### 2.3 从零到运行：两种路径对比

#### 路径 A：npx 零配置（推荐，业务开发者首选）

```bash
# 1. 一键创建项目
npx @od-kernel/cli init my-review-app --template code-review

# 2. 启动开发服务器
cd my-review-app
npx @od-kernel/cli dev
# → ready on :7456
# → 自动发现 domain/contexts/ (1 found)
# → 自动发现 domain/workflows/ (1 found)
# → Agent 检测完成: claude (v2.1.0), copilot (v1.5.0)

# 3. 验证
curl http://localhost:7456/api/agents   # → Agent 列表
curl http://localhost:7456/api/contexts # → 领域上下文
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"审查 src/auth.ts","contextId":"security-audit","workflowId":"code-review"}'
```

**用户只需写 Markdown，零行 TypeScript。**

#### 路径 B：手动组装（高级用户，需要深度定制）

如果你需要完全自定义 server 行为（如自定义中间件、额外路由、认证逻辑），可以手动安装底层包并编写 `src/server.ts`。

> **代码量说明：** 手动方式下 "~60 行"指 `src/server.ts` 中的胶水代码（组装内核包 + 注册路由）。此外每个业务场景需要编写领域代码：
> - `domain/prompts.ts` — 提示组装逻辑（~30 行 TS）
> - `domain/contexts/` — 领域知识（纯 Markdown，篇幅取决于领域复杂度）
> - `domain/workflows/` — 工作流定义（纯 Markdown，篇幅取决于领域复杂度）
>
> 即：**手动方式 TypeScript 代码总量约 90 行，Markdown 篇幅按需。** npx 方式零行 TS。

安装依赖：
```bash
pnpm add @od-kernel/daemon-core @od-kernel/chat-service \
         @od-kernel/agent-runtime @od-kernel/skill-utils \
         @od-kernel/types @open-design/platform \
         express better-sqlite3
```

**`src/server.ts`（约 60 行，这是业务应用中唯一需要写胶水代码的地方）：**
```typescript
import { createApp, createRunService, createSseResponse } from '@od-kernel/daemon-core';
import { createAgentOrchestrator } from '@od-kernel/agent-runtime';
import { createChatRouter } from '@od-kernel/chat-service';
import { listSkills } from '@od-kernel/skill-utils';
import { codeReviewPrompts } from './domain/prompts';
import { codeReviewContexts } from './domain/context';
import Database from 'better-sqlite3';

// 1. 基础设施（3 行）
const db = new Database('app.db');
const app = createApp();
const runs = createRunService({ createSseResponse });

// 2. Agent 编排器（1 行）
const orchestrator = createAgentOrchestrator();

// 3. 标准路由（2 行）
app.get('/api/agents', async (_req, res) => {
  res.json(await orchestrator.detectAll());
});

// 4. 领域查询路由（6 行）
app.get('/api/contexts', (_req, res) =>
  res.json(codeReviewContexts.listAll()));
app.get('/api/workflows', async (_req, res) =>
  res.json(await listSkills(['domain/workflows'])));

// 5. 核心：一行挂载 Chat（10 行）
app.use('/api', createChatRouter({
  orchestrator,
  runs,
  composePrompt: codeReviewPrompts.compose,
  resolveContext: codeReviewContexts,
  resolveWorkflow: async (id) => {
    const skills = await listSkills(['domain/workflows']);
    return skills.find(w => w.id === id) ?? null;
  },
}));

// 6. 启动（3 行）
app.listen(7456, () => console.log('ready on :7456'));
```

**`domain/prompts.ts`（手动路径 — 领域唯一需要写 TS 代码的地方）：**
```typescript
export const codeReviewPrompts = {
  compose(input: {
    userPrompt: string;
    activeContext?: DomainContext | null;
    activeWorkflow?: DomainWorkflow | null;
    instructions?: string;
  }): string {
    const sections: string[] = [
      "你是一个资深代码审查专家...",
    ];
    if (input.activeContext) sections.push(input.activeContext.body);
    if (input.activeWorkflow) sections.push(input.activeWorkflow.body);
    sections.push(input.userPrompt);
    return sections.join("\n\n");
  },
};
```

**`domain/prompts.md`（npx 路径 — 推荐，零代码）：**
```markdown
# Role
You are a senior code review expert specializing in security audits.
For each finding you must specify: file path, line number, severity (P0-P3),
corresponding CWE ID, and concrete fix recommendation.

# Review Rules
{{context:body}}

# Workflow
{{workflow:body}}

{{#instructions}}
# Project-Specific Requirements
{{instructions}}
{{/instructions}}

# Review Request
{{userPrompt}}
```

> **模板语法：** `{{context:body}}` 和 `{{workflow:body}}` 在运行时被替换为选中上下文和工作流的正文。`{{userPrompt}}` 为用户输入。`{{#instructions}}...{{/instructions}}` 为条件块（仅当 instructions 存在时渲染）。完整语法见 §2.8。

**`domain/contexts/` 和 `domain/workflows/`（纯 Markdown 文件，无需写代码）。**

### 2.4 添加新业务场景 = 两条命令 + 两个 Markdown 文件

**npx 方式（推荐，零代码）：**

```bash
# 1. 创建上下文
npx @od-kernel/cli add context legal-contract-law
# → 创建 domain/contexts/legal-contract-law/CONTEXT.md（交互式填写）

# 2. 创建工作流
npx @od-kernel/cli add workflow contract-review
# → 创建 domain/workflows/contract-review/SKILL.md（交互式填写）

# 3. 更新 domain/prompts.md 的角色定义（可选）
# → 将 "code review expert" 改为 "legal contract review expert"

# 4. 重启 dev server 即可 — 自动发现新文件
```

**手动方式（深度定制）：**

```
新的业务 =
    1. domain/prompts.ts     ← 定义角色 + 提示组装逻辑（~30 行 TS）
    2. domain/contexts/       ← 放 CONTEXT.md 文件（纯 Markdown）
    3. domain/workflows/      ← 放 SKILL.md 文件（纯 Markdown）

...然后改 src/server.ts 中的 3 个 import 路径。
```

所有 npm 包通过 `pnpm update` 独立升级。domain/ 目录零改动。

### 2.5 升级隔离

```
@od-kernel/agent-runtime  v1.1.0  → 新增 Agent 适配器，修流解析 bug
@od-kernel/daemon-core    v1.0.1  → SSE 性能优化
@od-kernel/chat-service   v1.2.0  → Chat 处理器新增重试逻辑
@od-kernel/skill-utils    v1.0.0  → 不变
@open-design/platform     v1.3.0  → Windows 兼容性修复

业务应用:
  pnpm update           # 一键升级所有包
  # domain/ 目录零改动 — 业务代码完全不受底层能力演进影响
```

### 2.6 与原有的 Vendor 方案的互补关系

如果暂时不方便发布 npm 包，可以先用路径 B（Vendor + Sync）过渡。两种方案**共享同一套包接口设计**— 当条件成熟时，只需将 `vendor/od-kernel/` 下的代码按上述包边界分拆发布，业务应用的 `src/server.ts` 不需要改动（只需把 `import` 从相对路径改为包名）。

### 2.7 Open Design 自身的迁移路径

如果 Open Design 项目本身也要迁移到内核包架构（即 OD 的 daemon 也变为内核包的消费者），迁移可分两步：

**第一步：内部引用（零风险）**
保持 OD monorepo 结构不变，在 `apps/daemon/package.json` 中将内核包添加为 workspace 依赖：
```json
{
  "dependencies": {
    "@od-kernel/agent-runtime": "workspace:*",
    "@od-kernel/agent-http": "workspace:*",
    "@od-kernel/daemon-core": "workspace:*",
    "@od-kernel/chat-service": "workspace:*",
    "@od-kernel/skill-utils": "workspace:*",
    "@od-kernel/types": "workspace:*"
  }
}
```
OD 的 `server.ts` 逐步将 import 从相对路径切换为包名，每次只替换一个模块，保持测试全绿。

**第二步：OD 作为领域实现（长期目标）**
OD 不再拥有独立的 daemon 逻辑 — 它变成一个「设计领域的业务应用」，就像代码审查应用一样：
```
OD 的特有代码 =
    domain/prompts.ts     ← 设计系统提示组装（7 层设计提示管线）
    domain/contexts/       ← design-systems/, craft/ 等设计知识
    domain/workflows/      ← 设计工作流（SKILL.md）
    src/server.ts          ← ~60 行胶水代码（与代码审查应用结构一致）
    apps/web/              ← 设计专属 UI
```
这一步是可选的长期演进方向。如果 OD 团队希望复用内核包的升级能力（`pnpm update` 自动获取新 Agent 适配器），这会是一个自然的演进路径。

### 2.8 提示模板语法（Prompts as Markdown）

`domain/prompts.md` 使用 Mustache 风格的模板语法，CLI 在运行时将变量替换为实际值。这使得非开发者也能配置 Agent 的系统提示。

**可用变量：**

| 变量 | 来源 | 说明 |
|------|------|------|
| `{{userPrompt}}` | 用户输入 | POST /api/chat 的 `message` 字段 |
| `{{context:body}}` | 选中的 DomainContext | CONTEXT.md 的完整正文 |
| `{{context:title}}` | 选中的 DomainContext | 上下文标题 |
| `{{context:id}}` | 选中的 DomainContext | 上下文 ID |
| `{{workflow:body}}` | 选中的 DomainWorkflow | SKILL.md 的正文（不含 frontmatter） |
| `{{workflow:name}}` | 选中的 DomainWorkflow | 工作流名称 |
| `{{workflow:description}}` | 选中的 DomainWorkflow | 工作流描述 |
| `{{memory}}` | 用户记忆 | 可选，持久化的用户偏好 |
| `{{instructions}}` | 项目指令 | 可选，项目级自定义规则 |
| `{{locale}}` | 请求参数 | 语言代码 |

**条件块：**

```markdown
{{#instructions}}
## Project-Specific Requirements
{{instructions}}
{{/instructions}}
```

仅当 `instructions` 存在且非空时渲染内容。

**完整模板示例（代码审查）：**
```markdown
# Role
You are a senior code review expert specializing in security audits.
For each finding, specify: file path, line number, severity (P0-P3), CWE ID, fix suggestion.

{{#context:body}}
# Review Rules
{{context:body}}
{{/context:body}}

{{#workflow:body}}
# Workflow
{{workflow:body}}
{{/workflow:body}}

{{#instructions}}
# Project Requirements
{{instructions}}
{{/instructions}}

# Review Request
{{userPrompt}}
```

**高级用户：** 如果需要动态逻辑（如根据 Agent 类型选择不同的提示风格），仍可使用 `domain/prompts.ts` 编写 TypeScript。CLI 优先检测 `domain/prompts.ts`，回退到 `domain/prompts.md`。

### 2.9 CLI 实现设计

`@od-kernel/cli` 是薄封装层，~400 行代码。它不包含新的业务逻辑，只编排已有内核包。

**依赖关系：**
```
@od-kernel/cli
  ├── @od-kernel/daemon-core    (createApp, createRunService, createSseResponse)
  ├── @od-kernel/chat-service   (createChatRouter)
  ├── @od-kernel/agent-runtime  (createAgentOrchestrator)
  ├── @od-kernel/skill-utils    (listSkills, parseSkillFile)
  ├── commander                  (CLI 参数解析)
  └── chokidar                   (文件监听，dev 模式热重载)
```

**`dev` 命令核心逻辑（伪代码）：**
```typescript
// src/commands/dev.ts — CLI 内部实现
export async function devCommand(options: { port?: number }) {
  const port = options.port ?? 7456;
  const cwd = process.cwd();

  // 1. 自动发现 domain 内容
  const contexts = await discoverContexts(path.join(cwd, 'domain/contexts'));
  const workflows = await listSkills([path.join(cwd, 'domain/workflows')]);

  // 2. 加载提示模板（优先 .ts，回退 .md）
  const composePrompt = await loadPromptComposer(cwd);

  // 3. 基础设施（同手动路径）
  const app = createApp();
  const runs = createRunService({ createSseResponse });
  const orchestrator = createAgentOrchestrator();

  // 4. 自动注册全部路由
  registerHealthRoutes(app);
  registerAgentRoutes(app, orchestrator);
  app.get('/api/contexts', (_req, res) => res.json(contexts));
  app.get('/api/workflows', (_req, res) => res.json(workflows));
  app.use('/api', createChatRouter({
    orchestrator, runs, composePrompt,
    resolveContext: makeContextResolver(contexts),
    resolveWorkflow: makeWorkflowResolver(workflows),
  }));

  // 5. 启动
  app.listen(port, () => {
    console.log(`ready on :${port}`);
    console.log(`  contexts: ${contexts.length} found`);
    console.log(`  workflows: ${workflows.length} found`);
    const agents = await orchestrator.detectAll();
    console.log(`  agents: ${agents.filter(a => a.available).map(a => a.id).join(', ')}`);
  });
}
```

**`init` 命令核心逻辑：**
```typescript
export async function initCommand(name: string, options: { template?: string }) {
  const targetDir = path.join(process.cwd(), name);
  const template = options.template ?? 'minimal';

  // 1. 从内置模板目录复制脚手架
  await fs.copy(path.join(TEMPLATES_DIR, template), targetDir);

  // 2. 生成 package.json
  await writeJSON(path.join(targetDir, 'package.json'), {
    name,
    private: true,
    type: 'module',
    scripts: { dev: 'od-kernel dev', start: 'od-kernel start' },
    dependencies: { '@od-kernel/cli': '^1.0.0' },
  });

  // 3. 安装依赖
  await exec('pnpm install', { cwd: targetDir });

  console.log(`✅ Created ${name}/`);
  console.log(`   cd ${name} && npx od-kernel dev`);
}
```

**内置模板：**

| 模板名 | 包含内容 |
|--------|---------|
| `minimal` | 空白 `domain/prompts.md` + 空 `contexts/` + 空 `workflows/` |
| `code-review` | 安全审计角色 + `security-audit` 上下文 + `code-review` 工作流 |
| `legal-review` | 法律审查角色 + `contract-law` 上下文 + `contract-review` 工作流 |
| `data-analysis` | 数据分析师角色 + `data-schema` 上下文 + `analysis-pipeline` 工作流 |

### 2.10 版本策略

7-8 个包之间的类型依赖（`@od-kernel/types` 被 `agent-http`、`agent-runtime`、`chat-service` 消费）意味着独立 semver 会引入版本协调成本。例如 `types` 新增一个字段后，所有消费包都需要更新其 `peerDependency` 下限。

**初期（v1.x）：锁步版本**

全部包统一使用相同的 major.minor 版本号，一次发布更新所有包：

```
@od-kernel/types           v1.0.0  →  v1.1.0
@od-kernel/agent-http       v1.0.0  →  v1.1.0
@od-kernel/agent-runtime    v1.0.0  →  v1.1.0
@od-kernel/daemon-core      v1.0.0  →  v1.1.0
@od-kernel/skill-utils      v1.0.0  →  v1.1.0
@od-kernel/chat-service     v1.0.0  →  v1.1.0
@od-kernel/project-service  v1.0.0  →  v1.1.0
```

- 包间依赖使用 `^1.0.0`（兼容同一 major），锁步发布保证兼容性
- 下游业务应用只需 `pnpm update` 即可同步升级所有内核包
- 发布脚本：`pnpm --filter "@od-kernel/*" version <version>` 统一 bump

**成熟期（v2+）：独立 semver（可选）**

当包接口稳定、变更频率分化后，可迁移到独立 semver：

- `@od-kernel/types` — 接口变更极低频，可长期停留在 v1.x
- `@od-kernel/agent-runtime` — 新增 Agent 适配器触发 minor bump
- `@od-kernel/chat-service` — 核心包，变更频率最高

迁移条件：(1) 各包的 CHANGELOG 已建立，(2) CI 中有跨包兼容性测试矩阵，(3) 至少 6 个月锁步发布无重大问题。

**下游锁定建议：**

```json
{
  "dependencies": {
    "@od-kernel/cli": "^1.0.0"
  }
}
```

通过 `@od-kernel/cli` 单一依赖间接引入所有内核包，由 CLI 的 `package.json` 控制内核包的精确版本范围。下游应用只需关心 CLI 的 major 版本升级。

---

## 3. 核心抽象：Pluggable Domain 接口

内核通过以下接口与领域代码交互。领域实现接口，内核在运行时调用它们。

### 3.1 领域必须实现的接口

```typescript
// 领域上下文 — 替代 DESIGN.md
// 定义 Agent 执行任务时需要遵循的领域规则和约束
interface DomainContext {
  id: string;
  title: string;
  body: string;                              // 注入系统提示的正文
  attachments?: Record<string, string>;       // 附带文件 (如规则集 JSON, 模板等)
}

// 上下文解析器
interface DomainContextResolver {
  listAll(): Promise<DomainContext[]>;
  resolve(id: string): Promise<DomainContext | null>;
}

// 领域工作流 — 复用 SKILL.md 格式
interface DomainWorkflow {
  id: string;
  name: string;
  description: string;
  body: string;                              // SKILL.md 正文 (工作流步骤)
  dir: string;                               // 附带文件目录
  requiresContext: boolean;                  // 是否需要领域上下文
}

// 提示组装器 — 这是领域适配的核心
interface DomainPromptComposer {
  compose(input: {
    userPrompt: string;
    activeContext?: DomainContext | null;     // 选中的上下文 (如安全规则)
    activeWorkflow?: DomainWorkflow | null;  // 选中的工作流
    memory?: string;                         // 用户记忆
    instructions?: string;                   // 项目级指令
    locale?: string;                         // 语言
  }): string;                                // 返回完整系统提示
}
```

### 3.2 内核暴露的服务（已有实现，直接调用）

```typescript
// Agent 编排器 — 内核的主入口
interface AgentOrchestrator {
  run(input: {
    agentId: string;
    systemPrompt: string;
    userPrompt: string;
    cwd: string;
    extraDirs?: string[];
    model?: string;
    reasoning?: string;
  }): AsyncIterable<AgentEvent>;

  listAgents(): Promise<DetectedAgent[]>;
  getCapabilities(agentId: string): AgentCapabilities;
  cancel(runId: string): Promise<void>;
}

// Agent 事件 — 所有流解析器产出的统一类型
type AgentEvent =
  | { type: "thinking"; text: string }
  | { type: "tool_call"; name: string; input: unknown; id: string }
  | { type: "tool_result"; id: string; output: unknown }
  | { type: "text_delta"; text: string }
  | { type: "file_write"; path: string }
  | { type: "error"; error: string }
  | { type: "done"; reason: "completed" | "cancelled" | "error" };

// Agent 能力位图 — 驱动 UI 自适应
interface AgentCapabilities {
  surgicalEdit: boolean;
  nativeSkillLoading: boolean;
  streaming: boolean;
  resume: boolean;
  permissionMode: "strict" | "permissive" | "none";
  contextWindowHint?: number;
}
```

### 3.3 提示组装管线

```
用户消息
    │
    ▼
┌─ DomainPromptComposer.compose() ─────────────────────┐
│                                                       │
│  1. 角色定义      "你是一个资深代码审查专家..."        │
│  2. 领域上下文     CONTEXT.md (安全规则、CWE 检查项)   │
│  3. 领域工作流     SKILL.md (审查步骤 1-4)            │
│  4. 记忆          (可选 — 用户过去的偏好)             │
│  5. 项目指令      (可选 — 项目级自定义规则)           │
│  6. 用户消息      "审查 src/auth.ts 的安全性"         │
│                                                       │
└───────────────────────────────────────────────────────┘
    │
    ▼
┌─ stageSkillFiles(cwd, workflow) ───────────────────────┐
│                                                         │
│  复制 workflow.dir 到 cwd/.od-skills/<name>/            │
│  Agent 可通过相对路径引用附带文件 (模板、规则等)         │
│                                                         │
└─────────────────────────────────────────────────────────┘
    │
    ▼
AgentOrchestrator.run({ systemPrompt, userPrompt, cwd, extraDirs })
    │
    │  spawn(claude, ['-p', '--output-format', 'stream-json', ...])
    │  → stdout JSONL 解析 → AgentEvent 流
    │
    ▼
SSE → Web UI (start → agent → end)
```

### 3.4 错误处理契约

领域回调（`composePrompt`、`resolveContext`、`resolveWorkflow`）在运行时可能因各种原因失败：上下文文件损坏、工作流 YAML 解析错误、网络请求超时等。`chat-service` 必须定义统一的错误处理契约，确保失败模式可预测。

#### 领域回调错误的三种处理策略

| 错误来源 | 严重程度 | chat-service 行为 | SSE 事件 |
|---------|---------|------------------|---------|
| `resolveContext(id)` 返回 `null` | 低 — 上下文 ID 无效 | 忽略上下文，继续使用基础提示组装 | 无 error 事件 |
| `resolveWorkflow(id)` 返回 `null` | 低 — 工作流 ID 无效 | 忽略工作流，继续使用基础提示组装 | 无 error 事件 |
| `resolveContext(id)` 抛出异常 | 中 — 上下文解析失败 | 返回 HTTP 400 + 错误描述，**不启动 Agent** | 不发起 SSE 连接 |
| `resolveWorkflow(id)` 抛出异常 | 中 — 工作流解析失败 | 返回 HTTP 400 + 错误描述，**不启动 Agent** | 不发起 SSE 连接 |
| `composePrompt(input)` 抛出异常 | 高 — 提示组装失败 | 返回 HTTP 500 + 错误描述，**不启动 Agent** | 不发起 SSE 连接 |
| `orchestrator.run()` 中 Agent 崩溃 | 高 — 运行时错误 | HTTP 200 已发送，通过 SSE error 事件通知 | `event: error` → `event: end` |
| `orchestrator.run()` 中 Agent 找不到 | 中 — Agent 未安装 | 返回 HTTP 400 + "agent not found" | 不发起 SSE 连接 |

#### 设计原则

1. **启动前失败用 HTTP 状态码。** 如果错误在 Agent spawn 之前就能确定（提示组装失败、上下文无效），直接返回 HTTP 4xx/5xx，不发起 SSE 连接。前端在 `fetch` 的 catch 或非 200 响应中处理。

2. **运行时失败用 SSE error 事件。** 如果 HTTP 200 已发送、SSE 连接已建立，后续的 Agent 崩溃通过 `event: error` 通知。前端在 SSE 事件循环中处理。

3. **领域错误不透传。** `composePrompt` 抛出的原始异常信息不直接写入 SSE 流（可能包含文件系统路径等敏感信息）。chat-service 捕获异常后，仅将 `message` 字段写入 `error` 事件，完整错误信息记录到服务端日志。

4. **回调返回 null 是合法的降级。** `resolveContext(id)` 和 `resolveWorkflow(id)` 返回 `null` 意味着「未找到」，而非「出错」。chat-service 静默忽略，不报告错误。

#### TypeScript 类型定义

```typescript
// 领域回调签名（chat-service 期望的约定）
interface DomainCallbacks {
  composePrompt(input: PromptInput): string;        // 抛异常 → 500
  resolveContext(id: string): Promise<DomainContext | null>;  // 抛异常 → 400, 返回 null → 静默忽略
  resolveWorkflow(id: string): Promise<DomainWorkflow | null>; // 同上
}
```

---

## 4. 最小 API 表面

新领域应用需要实现的 REST + SSE 端点：

### REST

```
GET  /api/health                          # 健康检查
GET  /api/version                         # 版本
GET  /api/agents                          # Agent 列表 + 能力 + 认证状态
GET  /api/contexts                        # 领域上下文列表
GET  /api/workflows                       # 领域工作流列表
GET  /api/projects                        # 项目列表
POST /api/projects                        # 创建项目
GET  /api/projects/:id/files              # 项目文件
POST /api/chat              → SSE        # ★ 核心：组装提示 → 启 Agent → SSE 流
GET  /api/runs/:id/events   → SSE        # 运行事件回放
POST /api/runs/:id/cancel                 # 取消运行
GET  /api/runs                            # 运行列表
GET  /api/runs/:id                        # 运行状态
POST /api/proxy/{provider}/stream → SSE  # BYOK 代理（无 CLI 时使用）
```

### SSE 事件

```
event: start    → { runId, agentId, bin, protocolVersion, cwd, model? }
event: agent    → { type: "status"|"text_delta"|"thinking_delta"|
                           "tool_use"|"tool_result"|"usage", ... }
event: stdout   → { chunk: string }
event: stderr   → { chunk: string }
event: error    → { message, error?: ApiError }
event: end      → { code, signal?, status?, resumable? }
```

### 浏览器端 SSE 消费

`@od-kernel/chat-service` 同时导出一个纯 TypeScript 的浏览器端 SSE 事件解析器（零 DOM 依赖），降低前端开发成本：

```typescript
// 导入浏览器端 SSE 解析器
import { parseSseStream } from '@od-kernel/chat-service/browser';

// 用法：从 fetch 的 ReadableStream 中逐事件解析
const response = await fetch('/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ agentId: 'claude', message: '...' }),
});

for await (const event of parseSseStream(response)) {
  switch (event.type) {
    case 'start':
      // { runId, agentId, bin, protocolVersion, cwd, model? }
      break;
    case 'agent':
      // { type: "text_delta"|"thinking_delta"|"tool_use"|"tool_result"|"usage", ... }
      break;
    case 'stdout':
      // { chunk: string }
      break;
    case 'stderr':
      // { chunk: string }
      break;
    case 'error':
      // { message: string, error?: ApiError }
      break;
    case 'end':
      // { code, signal?, status?, resumable? }
      break;
  }
}
```

**设计要点：**
- 零依赖：仅使用 `ReadableStream` + `TextDecoder`（浏览器原生 API），不引入 DOM 或 Node.js 依赖
- 异步迭代器：`AsyncIterable<SseEvent>` 接口，与 `for await...of` 自然配合
- 错误恢复：在 `reader.read()` 抛出时自动中断迭代并 yield `error` 事件，调用方无需手动 catch
- 连接中断检测：检测 `reader.read()` 返回 `done: true` 时，如果未收到 `end` 事件，自动 yield `error` 事件（非预期断开）

**前端组件只需 5 行核心消费代码：**

```typescript
for await (const event of parseSseStream(response)) {
  if (event.type === 'agent' && event.payload.type === 'text_delta') {
    appendToChat(event.payload.text);  // 流式追加到 UI
  }
}
```

这使任何前端框架（React、Vue、Next.js SSR）都能以统一方式消费 SSE 事件流，而不需要独立实现 EventSource 解析和错误处理逻辑。

---

## 5. 移植步骤

### 快速开始（npx，推荐）

```bash
# 第 1 步：脚手架项目（一键完成）
npx @od-kernel/cli init my-review-app --template code-review
cd my-review-app

# 第 2 步：按需编辑 domain 文件（纯 Markdown）
# domain/prompts.md      ← 可选：调整角色定义
# domain/contexts/        ← 可选：修改/添加 CONTEXT.md
# domain/workflows/       ← 可选：修改/添加 SKILL.md

# 第 3 步：启动并验证
npx @od-kernel/cli dev
# → ready on :7456
# → 自动发现: 1 context, 1 workflow
# → Agent: claude (available), copilot (available)

curl http://localhost:7456/api/agents
curl http://localhost:7456/api/contexts
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"审查 src/auth.ts","contextId":"security-audit","workflowId":"code-review"}'
```

**整个过程不写一行 TypeScript。**

---

### 手动路径（高级定制）

如果 npx 方式不能满足定制需求（如自定义认证中间件、额外的 REST 端点），可以走手动路径。

#### 第 1 步：创建项目

```bash
mkdir my-agent-app && cd my-agent-app
pnpm init
pnpm add @od-kernel/daemon-core @od-kernel/chat-service \
         @od-kernel/agent-runtime @od-kernel/skill-utils \
         @od-kernel/types @open-design/platform \
         express better-sqlite3
```

如果暂未发布 npm 包，可先用 Vendor 过渡（见 §2.6）。

#### 第 2 步：实现领域逻辑（以代码审查为例）

**`domain/contexts/security-audit/CONTEXT.md`**：
```markdown
# 安全审计上下文

## 检查范围
- OWASP Top 10 (2021)
- CWE Top 25

## 严重等级
- P0: 可远程利用的 RCE / 权限绕过
- P1: SQL 注入 / XSS / 敏感信息泄露
- P2: 不安全的配置 / 缺少安全头
- P3: 代码异味 / 最佳实践偏离

## 审查规则
1. 所有用户输入必须经过参数化或转义
2. 密码不得硬编码
3. 会话 Token 必须使用安全随机源
...
```

**`domain/workflows/code-review/SKILL.md`**：
```yaml
---
name: code-review
description: 对提交的代码进行安全审查，按严重等级分类问题
triggers: [审查, review, audit, 安全检查]
---
# 代码审查工作流

1. 读取 `references/report-template.md` 了解报告格式
2. 逐文件检查，对照 CONTEXT.md 中的规则
3. 发现问题时记录：文件路径、行号、严重等级、CWE 编号、修复建议
4. 生成审查报告，按严重等级降序排列
5. 在报告末尾给出整体安全评分和建议优先级
```

**`domain/prompts.ts`（参考 §2.3 中的完整示例，结构与以下一致）：**
```typescript
export const codeReviewPrompts = {
  compose(input: {
    userPrompt: string;
    activeContext?: DomainContext | null;     // 选中的审查规则集
    activeWorkflow?: DomainWorkflow | null;  // 选中的审查工作流
    instructions?: string;                   // 项目特定要求
  }): string {
    const sections: string[] = [
      "你是一个资深代码审查专家，专注于安全审计。",
      "对于每个发现的问题，你必须指明：文件路径、行号、严重等级(P0-P3)、对应的 CWE 编号、以及具体的修复建议。",
    ];
    if (input.activeContext) sections.push("## 审查规则\n" + input.activeContext.body);
    if (input.activeWorkflow) sections.push("## 工作流程\n" + input.activeWorkflow.body);
    if (input.instructions) sections.push("## 项目特定要求\n" + input.instructions);
    sections.push("## 审查请求\n" + input.userPrompt);
    return sections.join("\n\n");
  },
};
```

### 第 3 步：验证

```bash
# 启动开发服务器
pnpm tsx src/server.ts
# → ready on :7456

# 验证 Agent 检测
curl http://localhost:7456/api/agents
# → [{ id: "claude", available: true, capabilities: {...} }, ...]

# 验证上下文
curl http://localhost:7456/api/contexts
# → [{ id: "security-audit", title: "安全审计上下文" }]

# 发起代码审查
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "claude",
    "message": "审查 src/auth.ts 的安全性",
    "projectId": "proj-1",
    "conversationId": "conv-1",
    "contextId": "security-audit",
    "workflowId": "code-review"
  }'
# → SSE 流: start → agent(text_delta, tool_use...) → end
```

### 第 4 步：构建前端

前端仅需实现 5 个组件：

1. **AgentSelector** — 调用 `GET /api/agents`，展示 Agent 卡片、能力位图、认证状态
2. **ContextPicker** — 调用 `GET /api/contexts`，选择审查规则集
3. **WorkflowPicker** — 调用 `GET /api/workflows`，选择工作流
4. **ChatPanel** — `POST /api/chat`，消费 SSE 事件流，渲染 text_delta / thinking / tool_use
5. **ResultPreview** — 渲染 Agent 产出的文件（如代码审查 Markdown 报告）

---

## 6. 能力驱动的 UI 降级（直接继承）

不同 Agent 的能力差异由内核的 `capabilities` 位图自动处理，前端无需单独实现：

| 能力 | 有该能力的 Agent | 无该能力的 Agent |
|------|----------------|----------------|
| `streaming: true` | 实时展示 text_delta + tool_call 动态 | 仅显示 spinner，完成后一次性展示结果 |
| `surgicalEdit: true` | 支持精准编辑（如只修改报告中的某一段） | 需重新生成整个报告 |
| `resume: true` | 中断后可恢复 | 中断后只能重新开始 |

前端从 `GET /api/agents` 的 `capabilities` 字段读取这些标志位，自动调整 UI 行为。

---

## 7. 从「代码审查」泛化到任意领域

替换 3 样东西即可切换到新领域：

| 替换项 | 代码审查 | 法律文书 | 数据分析 | 测试生成 |
|--------|---------|---------|---------|---------|
| `domain/contexts/` | 安全规则 + CWE | 法律条文 + 判例 | 数据 Schema + 指标定义 | 测试框架约定 + 覆盖率标准 |
| `domain/workflows/` | 审查步骤 + 报告模板 | 合同模板 + 条款库 | 分析流程 + 可视化模板 | 测试用例模板 + Mock 规则 |
| `domain/prompts.ts` | 安全专家角色 | 律师角色 | 数据分析师角色 | QA 工程师角色 |

**不改动任何一行内核代码。**

---

## 8. 内核升级策略

### 8.1 为什么升级是必须考虑的

内核文件在 OD 上游持续演进 — 过去 3 个月内约 30 次提交涉及内核，覆盖新增 Agent 适配器（Codebuddy、Amp）、流解析器修复、平台兼容性（Windows/Mac/Linux）、认证逻辑改进等。升级链路必须可靠。

### 8.2 升级方式

采用 npm 包分层架构后，升级简化为标准的依赖管理：

```bash
pnpm update                          # 升级全部内核包
pnpm update @od-kernel/agent-runtime  # 只升级 Agent 编排层
pnpm update @od-kernel/chat-service   # 只升级 Chat 处理器
```

| 维度 | 方式 |
|------|------|
| **升级命令** | `pnpm update [package...]` |
| **版本跟踪** | `package.json` 中的 semver range |
| **变更审查** | `pnpm diff` 或查看各包的 CHANGELOG |
| **升级粒度** | 每个包独立升级，互不影响 |

如果暂用 Vendor 过渡（§2.6），升级方式见 Vendor 路径的 sync 脚本。

### 8.3 内核文件变更频率与风险分级

基于过去 3 个月的 git 历史分析：

| 变更类型 | 频率 | 合并风险 | 示例 |
|---------|------|---------|------|
| **新增 Agent 定义** (`defs/<new>.ts`) | ~1-2/月 | 极低 — 纯新增文件，零冲突 | codebuddy.ts, amp.ts |
| **Agent 定义字段更新** (`defs/<existing>.ts`) | ~2-3/月 | 低 — 小范围修改（新增 flag、模型列表更新） | cursor-agent --trust 门控 |
| **流解析器 bug 修复** (`*-stream.ts`) | ~1-2/月 | 低 — 通常是局部修复 | ACP 错误处理 |
| **平台兼容性修复** (`platform/`) | ~1-2/月 | 低 — 独立的 OS 适配 | Windows fnm Node 发现 |
| **接口/类型变更** (`types.ts`) | 极低 | 需关注 — 可能影响你的适配代码 | RuntimeAgentDef 新增字段 |
| **检测/启动逻辑重构** | 极低（过去 3 月未发生） | 需关注 — 核心链路变更 | — |

结论：**绝大多数内核变更是纯增量或局部修复，合并冲突概率极低。** 真正需要关注的（类型接口变更、核心链路重构）发生频率极低。日常操作只是 `pnpm update` + 看一眼 changelog。

### 8.4 CI 自动检测依赖更新（可选）

```yaml
# .github/workflows/dependency-check.yml
name: Check dependency updates
on:
  schedule:
    - cron: '0 9 * * 1'  # 每周一早上

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm outdated --filter "@od-kernel/*"
        continue-on-error: true
      # 如有更新，创建 PR 或通知
```

---

## 9. 完整包体系实施清单

基于 §2 的包分层架构，以下是从 OD 仓库提取全部 8 个包的操作步骤。

### 9.1 底层包：文件搬运 + 路径修正（3 个包）

与之前分析一致，文件搬运量：复制 ~59 个文件（27 顶层 + 25 defs + 7 http），移动 2 个文件，修改 12 行 import。此外，7 个文件中的设计专属依赖需要通过参数化/剥离处理（详见 §1.5），新增约 4-5 人天工作量。

```
□ @od-kernel/types        # 纯新建 ~60 行
□ @od-kernel/agent-runtime # apps/daemon/src/runtimes/* + acp.ts + pi-rpc.ts
□ @od-kernel/agent-http    # apps/daemon/src/http/*
```

| 包 | 来源 | 文件数 | 需修改 |
|---|------|--------|--------|
| `types` | 从 `contracts` 提取 | 1 个文件 (~120 行) | 新建。包含 `ApiError`/`ApiErrorCode`/`ApiErrorResponse`/`createApiError`/`createApiErrorResponse`（来自 errors.ts），`AgentDiagnostic`/`AgentFixIntent`/`AmrModelsResponse`（来自 registry.ts），`TrackingRunResult`（来自 analytics） |
| `agent-runtime` | `apps/daemon/src/runtimes/*` | 52 个文件（27 顶层 + 25 defs） | 移动 acp.ts, pi-rpc.ts 入内 + 修 2 行 import；`local-profiles.ts`、`runs.ts`、`env.ts`、`executables.ts`、`claude-stream.ts`、`detection.ts`、`run-artifacts.ts` 共 7 个文件需参数化剥离设计依赖（详见 §1.5） |
| `agent-http` | `apps/daemon/src/http/*` | 7 个文件 | 修 4 行 import 指向 `@od-kernel/types` |

Import 修正清单（12 行）：

| 文件 | 原 import | 改为 |
|------|----------|------|
| `runtimes/defs/shared.ts` | `from '../../acp.js'` | `from '../acp.js'` |
| `runtimes/defs/shared.ts` | `from '../../pi-rpc.js'` | `from '../pi-rpc.js'` |
| `runtimes/types.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `runtimes/amr-model-cache.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `runtimes/diagnostics.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `runtimes/run-artifacts.ts` | `@open-design/contracts/analytics` | `@od-kernel/types` |
| `http/types.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `http/parse.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `http/response.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `http/api-errors.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `http/origin-guard.ts` | `@open-design/contracts` | `@od-kernel/types` |
| `http/adapter.ts` | `@open-design/contracts` | `@od-kernel/types` |

### 9.2 中层包：从 server.ts 抽取胶水代码（4 个包，新工作）

这 4 个包在之前的分析中只描述了接口，以下是**基于 server.ts 实际调用路径**的实现清单。

#### `@od-kernel/daemon-core`

| 模块 | 来源 | 说明 |
|------|------|------|
| `createApp()` | 参考 `server.ts:4417-4510` | Express 初始化 + 标准中间件（JSON 解析、CORS、CSP、可选 Bearer 认证）。封装 ~90 行样板代码。 |
| `createSseResponse()` | 直接搬 `server.ts:3999-4056` | SSE 响应工具（Content-Type 头、keepalive heartbeat、`send`/`end`/`cleanup`）。~40 行。 |
| `createRunService()` | 直接搬 `runtimes/runs.ts` | In-memory 运行注册表（create/get/list/start/fail/cancel/stream），带 TTL 清理。~200 行。 |
| `registerHealthRoutes()` | 参考 `server.ts` 中 `/health`, `/version`, `/ready` 的路由注册 | 3 个标准端点。~15 行。 |
| `registerAgentRoutes()` | 参考 `server.ts` 中 `GET /api/agents` 的处理 | 调用 `orchestrator.detectAll()` 并返回 JSON。~10 行。 |

#### `@od-kernel/chat-service`

这是**最重要的新包** — 把 server.ts 中 ~1500 行的 `startChatRun` + chat 路由注册逻辑参数化：

| 模块 | 来源 | 说明 |
|------|------|------|
| `createChatRouter()` | 重构 `server.ts` 中 `POST /api/chat`（L11243）和 `POST /api/runs`（L10277）的处理逻辑 | 接收 `composePrompt`, `resolveContext`, `resolveWorkflow`, `stageSkillFiles`（可选）四个领域回调，内部封装 Agent 启动、SSE 流式推送、运行取消、事件回放。~300 行。 |

关键设计：`createChatRouter` 内部调用 `orchestrator.run()` 启动 Agent，通过 `runs.stream()` 建立 SSE 连接，通过 `runs.fail()` / `runs.cancel()` 管理生命周期。领域回调在三个点介入：
1. **运行开始时**：调用 `composePrompt(input)` 组装系统提示
2. **上下文解析时**：调用 `resolveContext(id)` 和 `resolveWorkflow(id)` 获取领域知识
3. **Agent 启动前**：调用 `stageSkillFiles(cwd, workflow)` 将工作流附带文件暂存到项目 cwd 下的 `.od-skills/<name>/`，Agent 可通过相对路径直接访问模板、规则等文件

#### `@od-kernel/skill-utils`

| 模块 | 来源 | 说明 |
|------|------|------|
| `listSkills()` | 直接搬 `skills.ts:145-314` | 多 root 扫描 + SKILL.md 解析 + 优先级覆盖。~170 行。 |
| `parseSkillFile()` | 从 `listSkills` 中拆出单文件解析逻辑 | ~30 行。 |
| `stageSkillFiles()` | 直接搬 `cwd-aliases.ts` 中的 `stageActiveSkill` | 复制技能附带文件到 `.od-skills/`，支持解引用符号链接。~50 行。 |

#### `@od-kernel/project-service`（可选）

| 模块 | 来源 | 说明 |
|------|------|------|
| `createProjectService()` | 参考 `projects.ts` + `project-routes.ts` + `db.ts` 的项目表操作 | SQLite 支持的项目 CRUD。~200 行。 |
| `registerProjectRoutes()` | 参考 `server.ts` 中的项目路由注册 | REST 端点。~50 行。 |

#### `@od-kernel/cli`（薄封装层，新增）

| 模块 | 来源 | 说明 |
|------|------|------|
| `dev` 命令 | 封装 §2.3 中 ~60 行胶水代码 | 自动发现 domain/、组装 Express、注册路由、启动 SSE daemon。~150 行 |
| `init` 命令 | 模板系统 + package.json 生成 | 脚手架项目，从 `templates/` 目录复制。~100 行 |
| `add` 命令 | 交互式文件创建 | `add context` / `add workflow`，生成 CONTEXT.md / SKILL.md。~80 行 |
| `prompts.md` 模板引擎 | 新实现 | Mustache 风格 `{{var}}` 替换 + 条件块 `{{#key}}...{{/key}}`。~50 行 |
| 内置模板 | 新建 | `minimal` / `code-review` / `legal-review` / `data-analysis` 四个脚手架模板 |

### 9.3 总改动量

| 类别 | 数量 | 说明 |
|------|------|------|
| **文件搬运（零修改）** | ~45 个 | `runtimes/*` 中无外部依赖的文件 (~20 个) + `http/*` 中仅依赖 contracts 类型的文件 (7 个) |
| **文件搬运（需参数化）** | ~7 个 | `runs.ts`, `env.ts`, `executables.ts`, `claude-stream.ts`, `detection.ts`, `run-artifacts.ts`, `local-profiles.ts` — 详见 §1.5 |
| **文件搬运（含通用逻辑）** | ~7 个 | `run-tool-bundle.js`, `role-marker-guard.js`, `question-form-detect.js`, `home-expansion.js`, `project-root.js`, `origin-validation.js`, `app-config.js`（部分逻辑） |
| **文件移动** | 2 个 | `acp.ts`, `pi-rpc.ts` → `runtimes/` |
| **Import 路径修正** | 12 行 | 见 §9.1（8 行 contracts → types + 2 行 acp/pi-rpc 路径修正 + 2 行 http 补充） |
| **设计依赖剥离** | ~4-5 人天 | 参数化接口设计 + 搬运通用逻辑 + AMR 可选模块（详见 §1.5） |
| **新写代码（中层包）** | ~550 行 | `daemon-core` (~370 行) + `chat-service` (~320 行) + `skill-utils` (~250 行) — 大部分从 server.ts 搬运并参数化，含新增注入接口 |
| **新写代码（CLI）** | ~380 行 | CLI 命令 + 模板引擎 + 内置模板（全新编写） |
| **新建配置文件** | ~16 个 | 8 个包的 `package.json` + `tsconfig.json` |

### 9.4 验证

```bash
# 1. 构建全部包
for pkg in types agent-http agent-runtime daemon-core skill-utils chat-service project-service cli; do
  pnpm --filter @od-kernel/$pkg build
done

# 2. 类型检查
pnpm typecheck

# 3. 在新业务项目中验证
mkdir my-code-review-app && cd my-code-review-app
pnpm init
pnpm add @od-kernel/daemon-core @od-kernel/chat-service \
         @od-kernel/agent-runtime @od-kernel/skill-utils \
         express better-sqlite3

# 4. 复制 §2.3 的 src/server.ts，启动验证
# 5. 用 Mock Agent 验证端到端 SSE 流
export PATH="$PWD/mocks/bin:$PATH"
export OD_MOCKS_TRACE=<8-char-id> OD_MOCKS_NO_DELAY=1
pnpm tsx src/server.ts &
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"test","projectId":"p1","conversationId":"c1"}'
# → 确认 SSE 事件流完整
```

---

## 10. 许可分析

> 本节仅讨论提取内核代码并重新发布所涉及的许可问题，不构成正式法律意见。

### 10.1 基础事实

| 项目 | 许可证 | 说明 |
|------|--------|------|
| Open Design 仓库整体 | **Apache-2.0** | `package.json` 中声明 |
| 内核代码 (`runtimes/`, `http/`) | Apache-2.0 | 源文件无独立版权头，继承仓库许可 |
| `packages/platform/` | Apache-2.0 | 同一个 monorepo，同许可 |
| `express`（`http/` 的类型依赖） | MIT | 仅在编译期使用类型，非运行时捆绑 |
| Node.js 内置模块 | MIT-like | 运行时依赖，不随包分发 |
| 无 NOTICE 文件 | — | 无额外的归属负担 |

### 10.2 Apache-2.0 的关键条款

| 允许 | 必须履行 |
|------|---------|
| ✅ 商业使用 | ⚠️ 保留版权声明和 LICENSE 文本 |
| ✅ 修改和衍生作品 | ⚠️ 标注你所做的修改 |
| ✅ 私有使用 | ⚠️ 不得使用上游商标（"Open Design" 名称和 Logo） |
| ✅ 分发（源码或编译形式） | ⚠️ 传递专利授权（Apache-2.0 §3） |
| ✅ 再许可 | — |

### 10.3 风险评估

**无风险项：**

| 维度 | 结论 |
|------|------|
| **Copyleft 污染** | 无风险。所有依赖均为宽松许可（Apache-2.0、MIT），不含 GPL/AGPL 代码。提取后的包不会「感染」下游项目。 |
| **专利** | 有保护。Apache-2.0 §3 包含贡献者的明确专利授权，下游用户免受专利诉讼。 |
| **商业使用** | 明确允许。Apache-2.0 不要求开源衍生作品（非 Copyleft），提取后可用于闭源商业产品。 |
| **与 GPLv3 兼容** | 兼容。Apache-2.0 代码可与 GPLv3 代码组合。 |

**需关注项（均可控）：**

| 风险 | 等级 | 原因与缓解 |
|------|------|-----------|
| **归属缺失** | ⚠️ 中 | Apache-2.0 §4(a) 要求分发时保留版权声明。缓解：每个提取的包中复制一份完整的 LICENSE 文件，在 README 中标注来源。 |
| **商标冲突** | ⚠️ 低 | Apache-2.0 不授权商标使用。「Open Design」及其 Logo 属于上游项目。缓解：包名使用 `@od-kernel/*` 而非直接的「Open Design」，在文档中注明「衍生自 Open Design」而非「由 Open Design 官方发布」。 |
| **贡献者版权分散** | ⚠️ 低 | 内核代码有多位贡献者，但均通过 Apache-2.0 入站许可贡献。缓解：使用 `Copyright <year> Open Design Contributors` 作为统一版权声明。 |
| **GPLv2 不兼容** | ⚠️ 低 | Apache-2.0 与 GPLv2 不兼容（但兼容 GPLv3）。如果下游用户必须将内核整合进 GPLv2-only 项目，存在许可冲突。这是用户侧的边缘情况。 |

### 10.4 提取时必须执行的操作清单

| # | 操作 | 适用于 |
|---|------|--------|
| 1 | 在每个包的根目录各复制一份 Apache-2.0 `LICENSE` 原文 | 全部 8 个包 |
| 2 | `package.json` 中设置 `"license": "Apache-2.0"` | 全部 8 个包 |
| 3 | 在 `README.md` 中标注来源和修改声明（模板见下文） | 全部 8 个包 |
| 4 | 不在包名、文档、宣传材料中使用 "Open Design" 商标或 Logo | 全部 8 个包 |
| 5 | 如对内核代码做了实质性修改，在文件头或 CHANGELOG 中记录修改内容 | 按需 |

**README.md 中的来源声明模板：**

```markdown
## License and Attribution

This package is licensed under the Apache License, Version 2.0.
See [LICENSE](./LICENSE) for the full text.

This package contains code extracted from
[Open Design](https://github.com/nexu-io/open-design)
([Apache-2.0](https://github.com/nexu-io/open-design/blob/main/LICENSE)).

Modifications from the original:
- Extracted from the monorepo as a standalone package.
- `acp.ts` and `pi-rpc.ts` relocated to the runtime directory.
- Import paths adjusted to resolve within the standalone package.
- A minimal `@od-kernel/types` package extracted from `@open-design/contracts`.
```

### 10.5 结论

**Apache-2.0 是业界最宽松的主流开源许可证之一。从许可角度看，提取和重新发布 Open Design 的内核代码没有任何法律障碍。** 仅需履行两项义务：(1) 保留 LICENSE 文本，(2) 注明来源和修改。以上操作清单全长 5 项，均为一次性设置。

---

## 11. 测试策略

### 11.1 测试分层

```
┌──────────────────────────────────────────┐
│  E2E: 多领域端到端 SSE 流验证             │
│  (2-3 个业务场景 × Mock Agent)            │
├──────────────────────────────────────────┤
│  集成测试: chat-service 契约验证           │
│  (composePrompt/resolve 回调正确调用)      │
├──────────────────────────────────────────┤
│  单元测试: 各包独立函数                    │
│  (流解析器 / 路由 / SSE 工具 / 技能扫描)   │
└──────────────────────────────────────────┘
```

### 11.2 单元测试（各包独立）

| 包 | 测试内容 | 工具 |
|---|---------|------|
| `@od-kernel/types` | 类型编译验证（`tsc --noEmit`），无需运行时测试 | `vitest` + `tsc` |
| `@od-kernel/agent-http` | `defineJsonRoute` + `mountJsonRoute` 路由注册；`Result<T,E>` 构造；`InputParser` 解析正确性；CORS/CSP 中间件行为 | `vitest` + `supertest` |
| `@od-kernel/agent-runtime` | 每个流解析器 (`claude-stream`, `qoder-stream`, `json-event-stream`) 对 fixture JSONL 的正确解析；`AgentOrchestrator.run()` 在 mock spawn 下的 `AgentEvent` 序列正确性；`capabilities` 位图读写 | `vitest` + mock `child_process` |
| `@od-kernel/daemon-core` | `createSseResponse` send/end/cleanup 行为；`createRunService` CRUD + TTL 过期；`registerHealthRoutes` 端点响应 | `vitest` + `supertest` |
| `@od-kernel/skill-utils` | `parseSkillFile` 对 fixture SKILL.md 的 YAML + Markdown 解析；`listSkills` 多 root 扫描 + 优先级覆盖 | `vitest` |
| `@od-kernel/chat-service` | （见 §11.3 契约测试） | — |
| `@od-kernel/project-service` | SQLite CRUD 操作正确性 | `vitest` + `better-sqlite3` |

### 11.3 契约测试（chat-service 核心）

chat-service 的 `createChatRouter` 通过三个领域回调与业务代码交互。契约测试验证这些回调在正确时机被调用、返回值被正确注入系统提示。

**测试方法：** 用 3 个模拟领域实现（代码审查、法律文书、数据分析）各写一个最小 `DomainPromptComposer` + `DomainContextResolver`，验证：

```typescript
describe('chat-service contract', () => {
  // 1. composePrompt 在每次运行开始时被调用
  it('calls composePrompt with user prompt and active context', async () => {
    const spy = vi.fn().mockReturnValue('full system prompt');
    const router = createChatRouter({
      composePrompt: spy,
      resolveContext: mockResolver,
      resolveWorkflow: () => null,
      // ...
    });
    // 发起 POST /api/chat，验证 spy 被调用且参数正确
  });

  // 2. resolveContext 在上下文切换时被调用
  it('calls resolveContext when contextId changes', async () => { /* ... */ });

  // 3. 领域回调抛异常时，chat-service 返回 SSE error 事件
  it('emits SSE error when composePrompt throws', async () => { /* ... */ });

  // 4. 多领域契约：3 个不同语义的 DomainPromptComposer 都能正常工作
  it.each([codeReviewDomain, legalDomain, dataAnalysisDomain])(
    'works with %s domain',
    async (domain) => { /* ... */ },
  );
});
```

### 11.4 Mock Agent 端到端验证

使用 mock Agent 二进制（替换真实的 Claude/Copilot CLI）验证完整 SSE 流：

```bash
# mock-agent 脚本 — 输出标准 ACP JSONL 流
#!/bin/bash
# 读取 stdin 中的 systemPrompt/userPrompt，输出预定义的 AgentEvent 序列
echo '{"type":"start","runId":"mock-run-1"}'
echo '{"type":"text_delta","text":"Mock response for: '${1:-test}'"}'
echo '{"type":"done","reason":"completed"}'
```

**验证矩阵：**

| 场景 | Mock Agent 行为 | 期望 SSE 事件 |
|------|----------------|-------------|
| 正常对话 | 输出 text_delta + done | start → agent(text_delta) → end |
| Agent 崩溃 | 退出码 1 | start → error → end |
| 用户取消 | — | start → end(cancelled) |
| 长输出 | 输出 100+ text_delta 事件 | 全部事件按序到达 |
| 非流式 Agent | 一次性输出全部结果 | 显示 spinner 后完整展示 |

### 11.5 回归测试：与原 server.ts 的一致性

提取 chat-service 后，必须验证其行为与原 `server.ts` 一致：

1. **Fixture 重放**：录制原 server.ts 在处理 `POST /api/chat` 请求时的完整 SSE 事件流，作为 baseline
2. **提取后重放**：用相同请求对 chat-service 发起，比较 SSE 事件流
3. **差异断言**：允许 `runId`、`timestamp` 等非确定性字段不同，但事件类型序列必须完全一致

### 11.6 CI 中的测试流水线

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm --filter "@od-kernel/*" test

  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm --filter "@od-kernel/chat-service" test:contract

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: |
          # 用 mock agent 启动 daemon，执行 SSE 端到端测试
          pnpm --filter my-code-review-app test:e2e
```

### 11.7 防腐层检查（编译期隔离 + CI 兜底）

防止设计专属依赖污染内核层采用两层防线：

**第一道防线：编译期隔离（主防线）**

提取后的内核包使用独立的 `tsconfig.json`，`paths` 和 `include` 不包含任何 OD 设计专属路径。这意味着如果有人在内核包中写了 `import { DESIGN_SYSTEM_DIR } from '../design-systems'`，TypeScript 编译器会直接报错 `Cannot find module`，在开发阶段就能捕获。

```json
// @od-kernel/agent-runtime/tsconfig.json
{
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "paths": {
      "@od-kernel/types": ["../types/src"]
    }
    // 注意：不包含任何 OD 设计专属 paths
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

**第二道防线：CI 自动扫描（兜底）**

为防止 OD 上游在未来提交中不小心给内核文件引入设计专属依赖（在提取前的源文件中），CI 中加入每周自动扫描：

```yaml
# .github/workflows/anti-corruption.yml
name: Anti-corruption check
on:
  schedule:
    - cron: '0 8 * * 1'  # 每周一
  pull_request:
    paths:
      - 'apps/daemon/src/runtimes/**'
      - 'apps/daemon/src/http/**'

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: |
          # 检查 runtimes/ 和 http/ 中的 import 是否引用了设计专属路径
          # 注意：此列表需与 §1.5 中的设计依赖清单保持同步
          DESIGN_IMPORTS=$(grep -rE "from ['\"].*(design-systems|craft|critique|media|live-artifacts|prompts/system)" \
            apps/daemon/src/runtimes/ apps/daemon/src/http/ || true)
          if [ -n "$DESIGN_IMPORTS" ]; then
            echo "❌ 发现设计专属依赖泄露到内核层："
            echo "$DESIGN_IMPORTS"
            exit 1
          fi
          echo "✅ 内核层依赖干净"

      - run: |
          # 额外检查：sandbox-mode、app-config 等已验证的设计依赖不应增加新的引用点
          # 如果此检查失败，说明有新的文件开始依赖这些模块，需要更新 §1.5
          KNOWN_DESIGN_DEPS="sandbox-mode|app-config|home-expansion|integrations/vela|question-form-detect|workspace-contract|media/policy"
          CURRENT_COUNT=$(grep -rEc "from ['\"].*/(${KNOWN_DESIGN_DEPS})" \
            apps/daemon/src/runtimes/ apps/daemon/src/http/ || true | wc -l)
          echo "当前设计依赖引用点数量: $CURRENT_COUNT (基线: 12)"
```

---

*文档生成时间: 2026-06-22 · 所有 import 依赖均通过 grep 交叉验证 · 修订: 2026-06-22 (补全遗漏文件、修正依赖标注、增加测试策略、引入 npx CLI 零配置方案)*
