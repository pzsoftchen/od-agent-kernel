import type { DomainContext, DomainWorkflow } from './chat-handler.js';

export interface PromptComposerInput {
  userPrompt: string;
  activeContext?: DomainContext | null;
  activeWorkflow?: DomainWorkflow | null;
  memory?: string;
  instructions?: string;
  locale?: string;
}

export function composePrompt(input: PromptComposerInput): string {
  const sections: string[] = [];

  if (input.activeContext) {
    sections.push(`## Context: ${input.activeContext.title}\n${input.activeContext.body}`);
  }

  if (input.activeWorkflow) {
    sections.push(`## Workflow: ${input.activeWorkflow.name}\n${input.activeWorkflow.body}`);
  }

  if (input.memory) {
    sections.push(`## User Preferences\n${input.memory}`);
  }

  if (input.instructions) {
    sections.push(`## Project Requirements\n${input.instructions}`);
  }

  sections.push(`## Request\n${input.userPrompt}`);

  return sections.join('\n\n');
}
