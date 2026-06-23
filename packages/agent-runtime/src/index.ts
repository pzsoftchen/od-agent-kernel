/**
 * @od-kernel/agent-runtime — Agent orchestration kernel.
 *
 * Provides agent detection, launch, stream parsing, and run lifecycle
 * management. All design-specific integrations are injected through
 * RuntimeModuleDeps rather than imported directly.
 */

// Core types
export type {
  RuntimeAgentDef,
  RuntimeModelOption,
  RuntimeModelSource,
  RuntimeBuildOptions,
  RuntimeContext,
  RuntimeCapabilityMap,
  RuntimeListModels,
  RuntimePromptBudgetError,
  RuntimeReasoningOption,
  DetectedAgent,
  RuntimeExecOptions,
  RuntimeEnv,
  AgentDiagnostic,
} from './types.js';

// Dependency injection
export {
  type RuntimeModuleDeps,
  type SandboxConfigDeps,
  type AmrIntegrationDeps,
  type AppConfigDeps,
  type MediaPolicyDeps,
  defaultDeps,
  resolveDeps,
} from './deps.js';

// Agent definitions
export { AGENT_DEFS, getAgentDef } from './defs/index.js';

// Capabilities
export { agentCapabilities } from './capabilities.js';

// Run lifecycle
export {
  createRunService,
  type RunService,
  type RunRecord,
  type RunStatus,
  type CreateRunServiceOptions,
} from './runs.js';

// Role marker guard
export {
  createRoleMarkerGuard,
  FABRICATED_ROLE_MARKER_RE,
  type RoleMarkerGuard,
} from './role-guard.js';

// Question form detection
export {
  QUESTION_FORM_OPEN_RE,
  questionFormBodyIsRenderable,
  findQuestionFormCloseTag,
  emittedRenderableQuestionForm,
} from './question-form-detect.js';

// Invocation
export { execAgentFile, type ExecAgentFileResult } from './invocation.js';

// Orchestrator
export {
  createAgentOrchestrator,
  type AgentOrchestrator,
  type AgentEvent,
  type AgentCapabilities,
  type AgentRunInput,
  type CreateAgentOrchestratorOptions,
} from './orchestrator.js';
