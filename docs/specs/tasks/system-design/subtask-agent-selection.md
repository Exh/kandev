---
status: draft
system: tasks
requirements:
  - REQ-TASKS-SUBTASK-AGENT-SELECTION-001
---

# Subtask agent selection system design

## Purpose and boundaries

Extend the task-owned [workflow replacement contract](workflow-agent-overrides.md) to child creation through the UI and MCP tool. For an existing child, reuse session handoff to continue with another profile. Agent profile identity and eligibility remain agent-system concerns. The selected profile, rather than a raw provider model string, represents a cross-provider choice such as Claude Opus to Codex.

## Requirement mapping

| Requirement | Design sections |
| --- | --- |
| `REQ-TASKS-SUBTASK-AGENT-SELECTION-001` | Components and responsibilities; Data and contracts; Control flow; Failure and recovery |

## Components and responsibilities

- `NewSubtaskDialog`, `NewSubtaskForm`, and `SubtaskFormBody` expose the initial profile and fixed-profile replacement rows. Reuse `buildWorkflowAgentOverrideRows`, the existing responsive `AgentSelector`, and the task-create override row/validation behavior rather than maintaining a second grouping algorithm.
- `useSubtaskFormState` owns the replacement draft for one dialog opening. `useSubtaskSubmit` sends `workflow_agent_overrides` with `agent_profile_id` through the existing task-create API.
- `registerCreateTaskTool` and `createTaskHandler` expose and forward an optional `workflow_agent_overrides` tool input. The MCP handler forwards caller data; the task service remains the validation authority.
- `Service.CreateTask` already calls `validateWorkflowAgentOverrides` and persists expanded bindings in `tasks.workflow_agent_overrides`. Existing task-aware workflow routing and move previews consume those bindings.
- `CreateEditSelectors` currently hides the agent selector for a started task and shows `RunnerIneligibleNote` for the executor. The edit dialog should show the current agent and a Continue with another agent action that opens `NewSessionDialog` with a handoff preset for this child. Reuse `useHandoffProfiles` for eligibility and the session-tab handoff path for session creation.

## Data and contracts

REST and service create requests retain the existing `workflow_agent_overrides` map from fixed source profile ID to replacement profile ID. Omitted and empty input mean no replacement. The child's record stores expanded step bindings scoped to its workflow. No new database column is required.

Add an optional MCP `workflow_agent_overrides` array of `{source_profile_id, replacement_profile_id}` entries. The tool handler rejects malformed or duplicate source entries and converts the array to the established map before forwarding. This shape uses the existing MCP array/object schema facilities and avoids parsing JSON encoded inside a string. Document that `agent_profile_id` chooses the initial agent only where workflow routing permits it; fixed steps require the replacement input.

The child inherits no parent override map. `start_agent=false` stores the same choices for later launch. The task service validates profile existence, enabled state, workspace access, and executor compatibility. Audit `resolveWorkflowAgentOverrideExecutor` for `inherit_parent`: validation must use the parent's effective executor/profile, not a workspace fallback when the create request omits executor fields. External-ID replay retains the original task unchanged.

## Control flow

The subtask form loads the parent's effective workflow and its steps, groups fixed sources, and displays their affected steps. The initial agent selector keeps its current seeded value. A replacement starts at the workflow default even when the parent has a task-specific override; the parent choice is not copied implicitly. The selected map enters the create request. On success, task-owned bindings direct fixed-step launches and existing previews show the child's effective profile and model.

For MCP, the caller may supply `agent_profile_id` and replacement entries independently. The tool's existing parent/workspace resolution runs first. The task service validates against the resolved child workflow before persistence. Profile routing for explicit session targets and later steps remains as defined by the workflow replacement design.

For a started child, the edit action chooses a compatible target profile and invokes the existing handoff dialog with the current child session as source. The user supplies a continuation prompt or selects available context. Successful launch activates the new session and keeps the Claude session intact. Close the edit dialog before opening handoff so modal focus and scroll ownership remain predictable. This path does not call `task.runner`, mutate workflow overrides, or change the executor. Fixed workflow steps may still route later automated launches to their configured profile; explain that boundary near the action.

## Failure and recovery

Loading and failed workflow steps are distinct states in the form. Failed loading offers retry; invalid or unavailable choices identify the affected row and preserve the draft. Submit is blocked until choices can be validated. Server rejection also preserves the form. MCP input shape errors and service validation errors create no partial task. At runtime, an unavailable replacement yields the existing launch/transition error without falling back to the source profile.

For an existing task, an unavailable Codex profile is shown with the existing executor compatibility reason. Failed handoff leaves the Claude session and task state intact. The runner lock message may remain for the executor field but must identify it as the environment and point to the independent agent action.

## Persistence

Reuse the task-owned `workflow_agent_overrides` column, create transaction, DTO, and reload path. The parent task is never updated by child creation. No migration is needed.

## Security

Existing task-creation authorization applies to both UI and MCP. The service checks replacement profiles in the child's workspace and against the selected executor. MCP creator session context remains server owned; callers cannot provide it.

## Mobile and accessibility

Reuse the New Subtask dialog's full-height phone form and its single scrolling body. Place Workflow agents after the initial agent and workspace choices, before the prompt and fixed footer. On desktop, each row may align source and selector side by side; on phones it stacks with a full-width selector. Reuse the responsive agent picker, at least 44-pixel phone targets, visible labels, and focus return. Long names wrap within the dialog. All new copy uses the six locale catalogs.

The started-task edit surface uses the same responsive agent picker and handoff dialog as session tabs. On phones, the action is visible without hover, opens one focused selection flow, and returns focus to the edit entry point on dismissal. Do not stack the edit and handoff dialogs as simultaneous modal scroll owners.

## Observability and verification

Existing task routing logs and task DTO previews expose source and effective profiles. Add no high-cardinality metric. Service tests cover child isolation, deferred launch, rejection, and preview identity. MCP tests cover schema, translation, duplicate rejection, and propagation. Frontend tests cover row derivation, draft preservation, and payload. Desktop and mobile Playwright flows prove a Claude-parent/Codex-child selection.

Frontend interaction tests also prove the started-child edit action passes that child's task/session identity into handoff. Desktop and mobile Playwright flows prove a Claude child can continue in a Codex session without changing its executor or losing Claude history.

## Related contracts

- [Task workflow agent overrides](workflow-agent-overrides.md)
- [MCP-created task profile default](../requirements/mcp-task-agent-profile-default.md)
- [Workflow profile session lifecycle](workflow-profile-session-lifecycle.md)
- [Runner switch before materialization](runner-switch-before-materialization.md)
