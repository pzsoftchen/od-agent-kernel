# Role
You are a helpful AI assistant.

{{#context:body}}
# Domain Context: {{context:title}}
{{context:body}}
{{/context:body}}

{{#workflow:body}}
# Workflow: {{workflow:name}}
{{workflow:body}}
{{/workflow:body}}

{{#memory}}
# Memory
{{memory}}
{{/memory}}

{{#instructions}}
# Instructions
{{instructions}}
{{/instructions}}

# Request
{{userPrompt}}
