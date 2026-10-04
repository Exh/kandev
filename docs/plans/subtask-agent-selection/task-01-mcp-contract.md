---
id: "01-mcp-contract"
title: "Expose child workflow replacements in MCP"
status: done
wave: 2
depends_on: []
plan: "plan.md"
requirements:
  - REQ-TASKS-SUBTASK-AGENT-SELECTION-001
acceptance_criteria:
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.2
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.3
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.4
system_design:
  - ../../specs/tasks/system-design/subtask-agent-selection.md
---

# Task 01: Expose child workflow replacements in MCP

## Summary

Let `create_task_kandev` forward explicit fixed-profile replacements to the existing task create service. Preserve existing behavior for callers that omit the new input.

## In scope

- Own `apps/backend/internal/mcp/server/server.go`, `handlers.go`, and focused MCP tests.
- Use an optional array of source/replacement profile IDs, reject malformed or duplicate entries, and forward the established map.
- Confirm service child isolation, invalid-choice rejection, deferred launch, and effective routing with focused existing or new task-service tests where coverage is missing.
- Audit `apps/backend/internal/task/service/workflow_agent_overrides.go` for inherited executor validation; adjust it and cover the case when the child omits executor fields.
- Update `docs/public/automation-and-mcp.md` and the tool description.

## Out of scope

- Frontend form changes and changing shared workflow precedence.

## Acceptance

- The tool advertises and forwards the new input with a clear statement of how it differs from `agent_profile_id`.
- Invalid entries and ineligible profiles fail before child persistence; omitted entries keep current behavior.
- A persisted child replacement is visible after reload and does not modify its parent.

## Verification

```bash
go test ./internal/mcp/server ./internal/mcp/handlers ./internal/task/service -run 'CreateTask|WorkflowAgentOverrides|ChildTask'
```

Run from `apps/backend`. Record actual test names and results here after implementation.

## Risks

- MCP schema object support may need a small schema definition adjustment; keep the public shape structured and the validation in the handler/service.

## Results

Implemented 2026-10-04.

- `create_task_kandev` advertises `workflow_agent_overrides` (array of `{source_profile_id, replacement_profile_id}`); the tool handler rejects malformed, blank, non-string, and duplicate-source entries before any backend call and forwards the established map. The WS handler forwards it to `Service.CreateTask`.
- `ErrInvalidWorkflowAgentOverrides` is classified as a validation error, so callers see the actionable reason instead of "Failed to create task".
- Audit result: `resolveWorkflowAgentOverrideExecutor` fell back to the workspace default executor when a child omitted executor fields. It now mirrors launch-time inheritance: the parent's primary-session executor profile or executor, else worktree for a non-`inherit_parent` child, else the workspace default.
- Tests: `TestCreateTaskWorkflowAgentOverridesSchema`, `TestCreateTaskForwardsWorkflowAgentOverrides`, `TestCreateTaskOmittedWorkflowAgentOverridesKeepPayload`, `TestCreateTaskRejectsInvalidWorkflowAgentOverrides`, `TestClassifyCreateTaskErrorMapsInvalidWorkflowAgentOverridesToValidation`, `TestCreateChildTaskValidatesWorkflowOverrideAgainstInheritedParentExecutor`, `TestCreateChildTaskPersistsWorkflowOverrideWithoutChangingParent`.
- Verification command: `ok` for `internal/mcp/server`, `internal/mcp/handlers`, `internal/task/service`.
