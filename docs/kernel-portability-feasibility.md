# Agent 编排内核移植 — 可行性评估

> 对 `docs/kernel-portability-design.md` 所提方案的独立评估，重点审查技术可行性、实施风险和遗漏项。

---

## 1. 总体评价

方案的核心思想 —「将 Agent 编排层提取为分层 npm 包 + npx CLI 工具，业务场景 = 两条命令 + 两个 Markdown 文件」— **方向正确，技术上基本可行。** 但可行性在 8 个包之间差异显著。**注意：本文第一版基于设计文档的依赖分析编写。经全量 grep 交叉验证后，发现 7 个文件的依赖被低估，agent-runtime 和 daemon-core 的风险评级已下调。** CLI 包是低风险的薄封装层。

| 包 | 可行性 | 信心 |
|---|--------|------|
| `@od-kernel/types` | ✅ 高 — 新建 ~120 行（含类型 + 运行时工具函数） | 100% |
| `@od-kernel/agent-http` | ✅ 高 — 直接搬运，改 6 行 import（含 `origin-guard.ts` 的遗漏引用） | 100% |
| `@od-kernel/agent-runtime` | 🟡 中高 — 搬运 + 移动 2 文件，但 **7 个文件存在设计专属交叉依赖需参数化剥离**（runs.ts, env.ts, executables.ts, claude-stream.ts, detection.ts, run-artifacts.ts, local-profiles.ts），详见设计文档 §1.5 | 80% |
| `@od-kernel/skill-utils` | ✅ 高 — 直接搬运 skills.ts + cwd-aliases.ts | 100% |
| `@od-kernel/daemon-core` | 🟡 中 — 5 个模块中 3 个直接搬运，2 个需从 server.ts 抽取，且需为 runs.ts/env.ts 的参数化提供注入接口 | 75% |
| `@od-kernel/chat-service` | 🔴 中 — 核心设计正确，但实施需从 ~1500 行交织代码中参数化，是最大风险点 | 65% |
| `@od-kernel/project-service` | ✅ 高 — 直接搬运 projects.ts + db.ts | 95% |
| `@od-kernel/cli` | ✅ 高 — 薄封装层，编排已有包，新增 ~380 行（模板引擎 + 命令） | 95% |

---

## 2. 逐包可行性分析

### 2.1 底层包：大部分已验证，agent-runtime 需额外关注

经过全量 grep 交叉验证（`grep -rn "from '..\/" apps/daemon/src/runtimes/`），发现原始依赖分析存在遗漏。**更新后的结论：**

- `types` + `agent-http`：import 修正从 4 行增至 6 行（`origin-guard.ts` 和 `adapter.ts` 的 contracts 引用被遗漏），但仍然是纯文件搬运。**零风险。**
- `agent-runtime`：6 行 contracts → types 的 import 修正（含新增的 `amr-model-cache.ts`、`diagnostics.ts`、`run-artifacts.ts`）+ 2 行 acp/pi-rpc 路径修正，合计 8 行。**但 7 个文件有设计专属交叉依赖需要额外处理**（见设计文档 §1.5）— 这些依赖不能通过 import 路径修正解决，需要参数化接口或逻辑搬运。**风险从 100% 下调至 80%。**

**唯一需要注意：** `@open-design/platform` 是外部依赖（由 OD 上游维护）。如果 OD 修改了 platform 的接口，`agent-runtime` 需要跟随升级。但 platform 本身是稳定的 OS 原语包，接口变更概率极低。

### 2.2 skill-utils：直接搬运

`skills.ts` 的 `listSkills()` 和 `cwd-aliases.ts` 的 `stageActiveSkill()` 是独立函数，不依赖设计概念。搬运风险为零。

### 2.3 daemon-core：大部分搬运，部分抽取

5 个模块中：

- `createSseResponse()` — server.ts:3999-4056，完全自包含的 SSE 工具函数。**直接搬运。**
- `createRunService()` — runtimes/runs.ts，in-memory 运行注册表。但在 OD 中，它是通过 `server.ts` 的依赖注入创建（传入了 `createSseResponse`、`analyticsService`、`readAnalyticsContext` 等设计专属参数）。提取时需要**剥离 analytics**，只保留核心的 create/get/list/start/fail/cancel/stream。**~30 行删除，低风险。**
- `createApp()` — 需要从 server.ts:4417-4510 抽取 Express 初始化逻辑。中间件配置（JSON 解析、CORS、CSP）是通用的，但当前 server.ts 还将这些与设计专属路由混合注册。**需要仔细分离 ~90 行。低-中风险。**
- `registerHealthRoutes()` / `registerAgentRoutes()` — 简单的路由注册封装。**直接搬运。**

### 2.4 chat-service：核心突破点，也是最大风险

这是整个设计中最关键也最复杂的包。当前 OD 的 `startChatRun` 函数（server.ts 中约 1500 行）将以下逻辑紧密交织：

```
Agent 选择 → 技能解析 → 设计系统解析 → 工艺规则注入 →
系统提示组装 (7 层) → 技能文件暂存 → Agent 启动 → SSE 流式推送 →
运行生命周期管理 → 错误处理
```

参数化为 `createChatRouter({ composePrompt, resolveContext, resolveWorkflow })` 需要：

1. **识别所有设计专属的调用点。** 当前已识别出两个主要注入点（提示组装、上下文解析），但可能存在隐藏的泄露。例如：错误消息中是否硬编码了设计术语？工具调用过滤是否假定设计场景？BYOK 代理路径是否有设计假设？

2. **保留所有通用逻辑不变。** Agent spawn、SSE 流管理、运行取消、事件回放、BYOK 代理 — 这些是纯通用逻辑，提取时不能引入回归。

3. **定义稳定的回调契约。** `composePrompt` 的输入类型（`DomainPromptComposer['compose']`）需要覆盖所有提示组装所需的上下文，同时不暴露设计概念。当前设计用 `DomainContext` / `DomainWorkflow` / `memory` / `instructions` 覆盖了主要场景，但边缘情况（如媒体生成、多模态输入）可能需要扩展。

**风险缓解措施：**
- 提议先提取 chat-service 的**最小可行版本**（仅支持单轮对话 + 纯文本提示），在 2-3 个不同领域验证后再扩展
- 用 Mock Agent 对提取后的 chat-service 做回归测试，确保事件流完整性与原始 server.ts 一致

### 2.5 project-service：可选的辅助包

`projects.ts` + `project-routes.ts` + `db.ts` 的项目 CRUD 是纯 SQLite 操作，无设计依赖。如果下游不需要项目管理（如用内存模式），可以完全跳过此包。

---

## 3. 依赖图验证

```
@od-kernel/types          (零依赖)
@open-design/platform     (零依赖, 已存在)
    │
@od-kernel/agent-http     → types + express (types only)
@od-kernel/agent-runtime  → platform + types
@od-kernel/skill-utils    → node:fs (零外部依赖)
    │
@od-kernel/daemon-core    → express + types + agent-runtime (类型)
    │
@od-kernel/chat-service   → daemon-core + agent-runtime + express
    │
@od-kernel/project-service → better-sqlite3
```

**无循环依赖。** 箭头方向从底层（纯类型 / OS 原语）到中层（胶水逻辑）到应用层，是经典的分层架构。

---

## 4. 实施工作量估算

> **修订注：** 第一版基于原始依赖分析（3 个文件有外部依赖）估算。经全量 grep 验证后，发现 7 个文件存在设计专属交叉依赖需参数化剥离（详见设计文档 §1.5），新增约 4-5 人天。以下为修订后估算。

| 阶段 | 内容 | 估算 |
|------|------|------|
| 底层 3 包 | 文件搬运 + import 修正（12 行，原估算 8 行）+ 配置文件 + 构建验证 | 2 人天 |
| 设计依赖剥离 | 参数化接口设计（SandboxConfig, EnvProvider）+ 搬运通用逻辑（run-tool-bundle, role-marker-guard, question-form-detect, home-expansion, project-root, origin-validation）+ AMR 可选模块 | **4-5 人天** |
| daemon-core | 从 server.ts 抽取 + 剥离 analytics + 新增注入接口 + 测试 | 4 人天 |
| skill-utils | 直接搬运 + 拆出 parseSkillFile + 测试 | 1 人天 |
| chat-service | 参数化 startChatRun + 定义回调契约 + 错误处理约定 + 浏览器 SSE 解析器 + 测试 | **6-8 人天** |
| project-service | 搬运 + 测试（可选） | 2 人天 |
| 包配置 & CI | 8 个包的构建脚本 + workspace 配置 + CI + 防腐层检查 | 2 人天 |
| Mock 测试 | 端到端 SSE 流验证 + 多领域契约测试 | 3 人天 |
| 文档 | API 文档 + 迁移指南 + 示例 | 2 人天 |
| **合计** | | **26-31 人天** |

chat-service + 设计依赖剥离 合计占总工作量的 40-45%，是决定项目成败的关键路径。

---

## 5. 设计遗漏项

> **修订注：** 以下 6 项中，§5.2（错误处理约定）、§5.3（版本策略）、§5.4（浏览器 SSE 消费）、§5.6（防腐层）已在设计文档中补充。§5.1（契约测试）已纳入 §11.3 测试策略。§5.5（chat-service 内部设计）为后续优化项。

### 5.1 缺少契约测试设计 ✅ 已解决

方案提到「用 Mock Agent 验证」，但未定义需要验证哪些契约。一个可行的方法是：为 3 个典型领域（代码审查、法律文书、数据分析）各写一个最小 domain，验证 chat-service 的回调接口在这 3 个不同语义下都能正常工作。

→ **已纳入设计文档 §11.3（契约测试），包含具体的测试用例代码和 `it.each` 多领域验证。**

### 5.2 缺少错误处理约定 ✅ 已解决

当领域代码（`composePrompt` / `resolveContext` / `resolveWorkflow`）抛出异常时，chat-service 应如何响应？是 500 错误、SSE error 事件、还是优雅降级？当前设计未定义这个契约。

→ **已纳入设计文档 §3.4（错误处理契约），定义了三种策略（启动前 HTTP 状态码 / 运行时 SSE error / 回调返回 null 静默降级）及 TypeScript 类型定义。**

### 5.3 缺少包版本策略 ✅ 已解决

7 个包是独立 semver 还是锁步发布？如果 `types` 新增了一个字段，需要 `agent-runtime` 和 `agent-http` 同时升级 — 独立版本管理会导致依赖地狱。建议初期采用锁步版本（如全部 v1.0.0），成熟后再考虑独立 semver。

→ **已纳入设计文档 §2.10（版本策略），明确初期锁步版本 + 成熟期独立 semver 的迁移条件。**

### 5.4 缺少浏览器端 SSE 消费的指导 ✅ 已解决

当前方案聚焦 daemon 侧，但业务应用还需要前端 SSE 消费。方案提到「前端需实现 ChatPanel」，但没有给出标准的 SSE 消费封装。建议在 `@od-kernel/chat-service` 中同时导出浏览器端的 SSE 事件解析器（纯 TypeScript，零 DOM 依赖），降低前端开发成本。

→ **已纳入设计文档 §4 浏览器端 SSE 消费小节，包含 `parseSseStream()` API 设计、AsyncIterable 接口、错误恢复逻辑，以及 5 行核心消费代码示例。**

### 5.5 chat-service 内部设计不够具体 ⏳ 后续优化

`createChatRouter` 是核心包，但方案只描述了它的外部接口（接受哪些参数、注册哪些端点），没有说明内部如何工作。建议补充一页的架构图或伪代码，说明：
- 请求如何流经 composePrompt → orchestrator.run → SSE
- 领域回调在哪些生命周期钩子被调用
- 错误如何从 Agent 子进程传播到 SSE error 事件

### 5.6 缺少 OD 上游的「防腐层」设计 ✅ 已解决

方案依赖 OD 上游的内核文件保持零设计依赖。但没有任何机制防止 OD 在未来提交中不小心引入设计依赖（例如有人给 runtimes 的某个文件加了一个 `import { DESIGN_SYSTEM_DIR } from '../design-systems'`）。建议在提取后的 CI 中加入一个自动检查：扫描所有包的 import，断言不出现设计专属的 import 路径。

→ **已纳入设计文档 §11.7（防腐层检查），包含 CI 自动扫描脚本和编译期 tsconfig 隔离建议。**

---

## 6. 与替代方案的对比

| 维度 | 本方案（8 npm 包 + npx CLI） | 直接 fork OD 精简 | 从零写 Agent 编排 |
|------|-------------------|-------------------|-------------------|
| 初始投入 | 26-31 人天（含 CLI ~3 人天 + 设计依赖剥离 4-5 人天） | 5-10 人天 | 60+ 人天 |
| 复用度 | 极高（除 domain/ 外全部 npm） | 中（需手动从上游合并）| 零 |
| 业务接入门槛 | **npx 零代码**（两条命令 + 两个 MD 文件） | 需写 TS 胶水代码 | 需从零实现全部 |
| 升级效率 | `pnpm update` | 手动 merge 上游 | 自行维护全部 |
| 多领域扩展成本 | 每个新领域 ~0.5 人天（纯 Markdown） | 每个新领域 ~3-5 人天 | 每个新领域 ~10+ 人天 |
| 技术风险 | 集中在 chat-service | 低（机械精简）| 高（重新实现全部适配器） |
| 长期可维护性 | 高（标准化依赖管理） | 中 | 取决于团队 |

---

## 7. 结论与建议

### 可行性结论

**方案整体可行，但风险比初次评估更高。** 经全量 grep 交叉验证后，agent-runtime 从零风险下调为中高风险（7 个文件需参数化剥离设计依赖），daemon-core 从中高风险下调为中风险（需为注入接口新增代码）。chat-service 仍然是核心突破点和最大风险点。CLI 是低风险的薄封装。**npx CLI 的引入大幅降低了业务接入门槛（从"写 90 行 TS"降为"写 Markdown"），是方案的核心竞争力。**

### 推荐实施顺序

| 优先级 | 包 | 理由 |
|--------|----|------|
| P0 | `types` + `agent-http` | 纯搬运 + import 修正（12 行），零风险，产出即可用 |
| P0 | `agent-runtime`（文件搬运阶段） | 先完成文件搬运 + import 修正 + 移动 acp.ts/pi-rpc.ts。**设计依赖剥离放到 P1** |
| P1 | 设计依赖剥离（§1.5 第一类） | 参数化接口设计（SandboxConfig, EnvProvider）+ 搬运通用逻辑。**agent-runtime 能否真正独立取决于这一步** |
| P1 | `skill-utils` + `daemon-core` | 低风险，直接搬运 + 注入接口 |
| P2 | `chat-service`（最小版本） | 核心价值所在，但需要最多设计精力。先用最小版本（单轮对话 + 纯文本提示）验证回调契约 |
| P2 | `project-service` | 可选，独立性强 |
| P2 | `@od-kernel/cli` | 薄封装 + 模板引擎，依赖 P0-P2 全部完成后即可实现 |
| P3 | 用 2-3 个领域验证 chat-service + CLI | 在真实业务场景中暴露设计缺陷 |
| P4 | 补充遗漏项（chat-service 内部设计细化） | 从 PoC 到生产级 |

### 最大风险点

1. **chat-service 的参数化** — 如果做得不好，会导致两种后果之一：
   - 回调接口过于复杂（暴露了太多 OD 内部概念），失去了简洁性
   - 回调接口过于简单（遗漏了必要的扩展点），下游业务无法按需定制

2. **设计依赖剥离**（新增风险点）— `runs.ts` 中的 `media/policy`、`env.ts` 中的 `sandbox-mode`/`app-config` 等依赖，如果在剥离时引入回归（如改变了沙箱模式的行为语义），会导致 Agent 启动失败。这些逻辑在 OD 中经过了大量实际使用验证，剥离时必须保持行为等价。

**缓解方案：**
- 在 chat-service 设计阶段，先用 TypeScript 写一份完整的类型定义文件，用 3 个不同领域的 server.ts 示例来验证接口是否足够简洁且足够灵活
- 对设计依赖剥离，每个参数化接口先写回归测试（用原始 server.ts 的行为作为 oracle），再逐步替换
- 建议先完成 P0+P1（底层包 + 设计依赖剥离），用 Mock Agent 验证端到端 SSE 流后再进入 chat-service 的参数化

---

*评估时间: 2026-06-22 · 基于源码分析和设计文档审查*
