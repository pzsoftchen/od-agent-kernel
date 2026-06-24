---
name: code-review
description: Security-focused code review with severity classification
---

# Code Review Workflow

1. Review each file against the context rules
2. For each finding, record: file path, line number, severity (P0-P3), CWE ID, fix suggestion
3. Generate a review report sorted by severity (P0 first)
4. Include an overall security score and recommended priority at the end of the report
