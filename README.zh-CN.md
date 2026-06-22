# Agent 编排内核

> 将 Agent 编排层提取为可复用的 npm 包分层架构。扩展一种新的业务场景只需两条命令 + 两个 Markdown 文件，零行 TypeScript。

[English Documentation](./README.md)

---

## 概述

Agent 编排内核（`@od-kernel/*`）是从 [Open Design](https://github.com/nexu-io/open-design) 中提取的分层 npm 包架构。它为**任何**业务领域提供 Agent 检测、启动、流解析和对话生命周期管理能力 — 代码审查、法律文书分析、数据分析、测试生成等等。

### 核心理念

- **业务逻辑用 Markdown 表达。** 领域知识（`CONTEXT.md`）、工作流（`SKILL.md`）和提示模板（`prompts.md`）都是纯 Markdown 文件，领域作者无需编写 TypeScript。
- **内核通过 `pnpm update` 升级。** 所有 Agent 适配器、流解析器和平台修复作为独立的 npm 包发布。你的领域文件保持不变。
- **渐进式定制。** 从 npx CLI 开始（零代码）。当需要自定义中间件、认证或 REST 端点时，切换到手动组装模式。

---

## 架构

```
┌──────────────────────────────────────────────────────────┐
│                     业务应用层                             │
│  my-review-app/                                           │
│    domain/prompts.md    (提示模板 — 纯 Markdown)          │
│    domain/contexts/     (领域知识 — 纯 Markdown)          │
│    domain/workflows/    (工作流定义 — 纯 Markdown)        │
│    package.json         (仅依赖 @od-kernel/cli)           │
├──────────────────────────────────────────────────────────┤
│                      CLI 层                               │
│  @od-kernel/cli          零配置启动器 + 脚手架             │
├──────────────────────────────────────────────────────────┤
│                     服务层                                │
│  @od-kernel/chat-service    参数化 Chat 处理器            │
│  @od-kernel/project-service SQLite 项目管理（可选）        │
│  @od-kernel/skill-utils      SKILL.md 扫描/暂存           │
├──────────────────────────────────────────────────────────┤
│                     胶水层                                │
│  @od-kernel/daemon-core     Express 工厂 + SSE + 运行管理  │
├──────────────────────────────────────────────────────────┤
│                     核心层                                │
│  @od-kernel/agent-runtime   Agent 编排（24 个 Agent）     │
│  @od-kernel/agent-http      类型化 JSON 路由框架          │
├──────────────────────────────────────────────────────────┤
│                     基础层                                │
│  @od-kernel/types           共享错误码 + Agent 类型        │
│  @open-design/platform      OS 进程原语（外部依赖）        │
└──────────────────────────────────────────────────────────┘
```

### 包依赖关系图

```
@od-kernel/types  (零依赖)
    ↑
@od-kernel/agent-http  → types + express (peer)
    ↑
@od-kernel/agent-runtime  → types + @open-design/platform (外部)
    ↑
@od-kernel/daemon-core  → types + agent-http + express (peer)
    ↑
@od-kernel/chat-service  → daemon-core + agent-runtime + types
    ↑
@od-kernel/cli  → chat-service + daemon-core + agent-runtime + skill-utils

@od-kernel/skill-utils  → types (独立)
@od-kernel/project-service  → types + better-sqlite3 (独立，可选)
```

---

## 包列表

| 包名 | 描述 | 状态 |
|------|------|------|
| `@od-kernel/types` | 共享错误码、Agent 诊断类型、HTTP 路由类型（~120 行） | ✅ |
| `@od-kernel/agent-http` | 类型安全的 JSON 路由框架 — `Result<T,E>`、`defineJsonRoute`、`mountJsonRoute` | ✅ |
| `@od-kernel/agent-runtime` | Agent 检测、启动、流解析、运行生命周期，支持 24+ Agent | ✅ |
| `@od-kernel/daemon-core` | Express 应用工厂、SSE 响应工具、健康检查/Agent 路由 | ✅ |
| `@od-kernel/chat-service` | 参数化 Chat 处理器，可插拔领域回调 | ✅ |
| `@od-kernel/skill-utils` | 多 root SKILL.md 扫描、YAML frontmatter 解析、文件暂存 | ✅ |
| `@od-kernel/project-service` | 基于 SQLite 的项目 CRUD（可选） | ✅ |
| `@od-kernel/cli` | npx CLI — `init`、`dev`、`add` 命令 + Mustache 模板引擎 | ✅ |

---

## 快速开始

### 环境要求

- **Node.js** ≥ 24
- **pnpm** ≥ 10.33.2

### 方式 A：npx CLI（推荐 — 零 TypeScript）

```bash
# 1. 一键创建项目
npx @od-kernel/cli init my-review-app --template code-review
cd my-review-app

# 2. 按需编辑领域文件（纯 Markdown）
#    domain/prompts.md      ← 调整角色定义
#    domain/contexts/        ← 添加/修改 CONTEXT.md
#    domain/workflows/       ← 添加/修改 SKILL.md

# 3. 启动开发服务器
npx @od-kernel/cli dev
# → ready on :7456
# → 自动发现: 1 context, 1 workflow
# → Agent: claude (available), copilot (available)

# 4. 验证
curl http://localhost:7456/api/agents
curl -N -X POST http://localhost:7456/api/chat \
  -H "Content-Type: application/json" \
  -d '{"agentId":"claude","message":"审查 src/auth.ts","contextId":"security-audit","workflowId":"code-review"}'
```

### 方式 B：手动组装（高级 — 完全控制）

```bash
pnpm add @od-kernel/daemon-core @od-kernel/chat-service \
         @od-kernel/agent-runtime @od-kernel/skill-utils \
         @od-kernel/types @open-design/platform \
         express better-sqlite3
```

然后编写 `src/server.ts`（约 60 行胶水代码）— 完整示例见[设计文档](./docs/kernel-portability-design.md)。

### 扩展到新领域

```bash
# npx 方式（推荐）
npx @od-kernel/cli add context legal-contract-law
npx @od-kernel/cli add workflow contract-review
# → 编辑生成的 Markdown 文件，重启 dev server 即可

# 手动方式
# 1. domain/prompts.ts     ← 定义角色 + 提示组装逻辑（~30 行 TS）
# 2. domain/contexts/       ← 放入 CONTEXT.md 文件（纯 Markdown）
# 3. domain/workflows/      ← 放入 SKILL.md 文件（纯 Markdown）
# 然后修改 src/server.ts 中的 3 个 import 路径
```

---

## 开发指南

### 环境搭建

```bash
git clone <repo-url> agent-kernel
cd agent-kernel
pnpm install
```

### 构建

```bash
pnpm build          # 构建全部 8 个包
pnpm -r build       # 同上
```

### 测试

```bash
pnpm test           # 运行全部测试（vitest）
# 当前：124 项测试通过，覆盖 16 个测试文件
```

### 类型检查

```bash
pnpm typecheck      # 全部包的 TypeScript 编译检查
```

### 运行单个包

```bash
pnpm --filter @od-kernel/agent-runtime test
pnpm --filter @od-kernel/chat-service build
```

### 项目结构

```
kernel/
├── package.json              # workspace 根配置
├── pnpm-workspace.yaml       # packages: ["packages/*"]
├── tsconfig.base.json        # 共享 TypeScript 配置
├── README.md                 # 英文文档
├── README.zh-CN.md           # 中文文档（本文件）
├── docs/                     # 设计文档
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

## API 接口

### REST 端点（由 daemon-core + chat-service 提供）

```
GET  /api/health                          # 健康检查
GET  /api/version                         # 版本信息
GET  /api/agents                          # Agent 列表 + 能力位图
GET  /api/contexts                        # 领域上下文列表
GET  /api/workflows                       # 领域工作流列表
POST /api/chat              → SSE        # 核心：组装提示 → 启动 Agent → SSE 流
GET  /api/runs/:id/events   → SSE        # 运行事件回放
POST /api/runs/:id/cancel                 # 取消运行
GET  /api/runs                            # 运行列表
GET  /api/runs/:id                        # 运行状态
```

### SSE 事件类型

```
event: start    → { runId, agentId, bin, cwd, model? }
event: agent    → { type: "text_delta"|"thinking_delta"|"tool_use"|"tool_result"|"usage", ... }
event: error    → { message, error? }
event: end      → { code, signal?, status?, resumable? }
```

### 浏览器端 SSE 消费

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

## 测试体系

项目使用 [Vitest](https://vitest.dev/) 进行四层测试：

| 层级 | 描述 | 覆盖的包 |
|------|------|---------|
| **单元测试** | 独立函数（解析器、守卫、工具函数） | 全部包 |
| **集成测试** | Express 路由挂载、SSE 生命周期 | agent-http、daemon-core |
| **契约测试** | 3 个模拟领域的回调正确性验证 | chat-service |
| **E2E 测试** | 使用 Mock Agent 的完整 SSE 流验证 | cli |

覆盖的关键回归场景：
- Agent 检测超时处理
- 不完整 JSON 多段恢复（ACP 协议）
- Claude 流中的角色标记污染截断
- 跨域请求拒绝
- SSE keepalive 心跳连续性

---

## 设计依赖剥离

内核从 Open Design 的 monorepo 中提取。Agent 运行时中有 7 个文件存在设计专属的交叉依赖，不能简单通过 import 路径修正解决，需要参数化处理：

| 文件 | 原始设计依赖 | 剥离策略 |
|------|-------------|---------|
| `runs.ts` | `media/policy`、`run-tool-bundle`、`workspace-contract` | 通过 `MediaPolicyDeps` 注入 |
| `env.ts` | `app-config`、`home-expansion`、`vela-profile`、`project-root`、`sandbox-mode` | 通过 `AppConfigDeps` + `AmrIntegrationDeps` + `SandboxConfigDeps` 注入 |
| `executables.ts` | `sandbox-mode` | 通过 `SandboxConfigDeps` 注入 |
| `detection.ts` | `integrations/vela` | 通过 `AmrIntegrationDeps` 注入 |
| `claude-stream.ts` | `role-marker-guard` | 复制到内核（通用工具） |
| `run-artifacts.ts` | `question-form-detect` | 复制到内核（通用工具） |
| `local-profiles.ts` | `sandbox-mode` | 通过 `SandboxConfigDeps` 注入 |

所有注入点均为可选 — 内核提供无操作（no-op）默认实现，开箱即用，无需任何设计专属配置。

---

## 版本策略

在 v0.x / v1.x 阶段，所有包采用**锁步版本**：

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

开发阶段包间依赖使用 `workspace:*`，发布后使用 `^0.1.0`。当接口稳定后（v2+）迁移到独立 semver。

---

## 许可证

Apache-2.0 © Open Design Contributors

本项目包含从 [Open Design](https://github.com/nexu-io/open-design) 提取的代码（[Apache-2.0](https://github.com/nexu-io/open-design/blob/main/LICENSE)）。

相对于原版的修改：
- 从 monorepo 中提取为独立包。
- `acp.ts` 和 `pi-rpc.ts` 移至运行时协议目录。
- Import 路径调整为独立包内引用。
- 从共享类型定义中裁剪了设计专属的错误码。
- 7 个设计耦合的文件通过依赖注入接口进行了参数化。

---

## 参与贡献

上游贡献指南见 [Open Design CONTRIBUTING.md](https://github.com/nexu-io/open-design/blob/main/CONTRIBUTING.md)。本内核遵循相同的约定和工作流。
