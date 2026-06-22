/**
 * @od-kernel/chat-service — Parameterized chat handler.
 */
export { createChatRouter, type ChatRouterOptions, type DomainPromptComposer, type DomainContextResolver, type DomainWorkflowResolver, type DomainContext, type DomainWorkflow } from './chat-handler.js';
export { composePrompt, type PromptComposerInput } from './prompt-composer.js';
export { parseSseStream, type SseEvent } from './browser-sse.js';
