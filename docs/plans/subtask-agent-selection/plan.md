---
created: 2026-09-29
status: draft
requirements:
  - REQ-TASKS-SUBTASK-AGENT-SELECTION-001
system_design:
  - ../../specs/tasks/system-design/subtask-agent-selection.md
legacy_specs: []
---

# Implementation Plan: Subtask agent selection

## Overview

Make it clear how to continue an already-started subtask with another agent profile, then expose existing task-owned workflow agent replacements in the subtask form and `create_task_kandev`. The started-task path reuses session handoff. The creation paths reuse existing service validation, storage, and routing.

## Scope

### In scope

- Select a child initial profile and explicit replacements for fixed workflow profiles, including a different provider.
- Persist and preview child-only selections for immediate and deferred launches.
- Desktop and phone subtask creation and MCP tool creation.
- A visible agent handoff action when editing an already-started child, with an explanation of the separate runner lock.

### Out of scope

- Editing a task's workflow replacements after creation or changing an active session's provider.
- Changing an existing executor after the task has a session.
- Inheriting the parent's replacement map.
- Office assignment and executor inheritance changes.

## Technical approach

- `apps/web/components/task-create-dialog-form-body.tsx` currently hides the agent column when editing a started task and renders a runner lock note for the executor. Show the current agent and a Continue with another agent action. Use the existing `Handoff` profile list and `NewSessionDialog` flow for the same child task, closing edit before opening handoff. The new session becomes active; Claude history and executor remain intact.
- `apps/backend/internal/mcp/server/server.go` declares optional replacement entries; `handlers.go` checks shape and duplicate source IDs and forwards the existing `workflow_agent_overrides` map. The task service remains authoritative for workflow membership, profile eligibility, executor compatibility, and persistence.
- `apps/backend/internal/task/service/workflow_agent_overrides.go` must validate an `inherit_parent` child against the actual inherited executor/profile. Audit this before relying on the existing validation path; adjust it if the omitted executor fields otherwise select the workspace fallback.
- `apps/web/components/task/new-subtask-form-state.ts` stores a per-opening override map instead of inert fields. `new-subtask-dialog.tsx` loads the resolved workflow steps, derives rows with `buildWorkflowAgentOverrideRows`, and supplies selection/loading/error state. `new-subtask-form-parts.tsx` renders the existing workflow-agent controls in a subtask-appropriate region. `use-subtask-submit.ts` forwards the map.
- No schema migration. `Service.CreateTask`, `validateWorkflowAgentOverrides`, `Task.WorkflowAgentOverrides`, and move previews already support the persisted child record.
- Update `docs/public/automation-and-mcp.md` for the MCP input and `docs/public/coordination.md` for the subtask dialog during implementation. Add English, Portuguese, Simplified Chinese, Japanese, and generated Traditional Chinese locale values for new copy if the existing strings cannot be reused.

## Compatibility matrix

| Creator | Choice | Routing | Invalid choice |
| --- | --- | --- | --- |
| Web New Subtask | Initial profile and fixed-profile replacements | Existing task-owned bindings; explicit session targets retain their bindings | Row error or preserved form with server error |
| Session-bound MCP | Explicit profile and optional replacement entries | Existing creator-session default only when explicit profile omitted; fixed-step bindings take precedence | Tool error before creation |
| External MCP | Explicit profile and optional replacement entries | Existing external fallback when omitted; fixed-step bindings take precedence | Tool error before creation |
| Existing callers | Omitted replacement input | Current parent/creator/workflow resolution | Current behavior |

## ASCII UI preview

### UI-00: Started subtask, Edit Task on desktop and phone

```text
Edit subtask
Agent                     Claude Opus
                          [Continue with another agent]
Runner / environment      Worktree (locked: session exists)
```

After selecting the action, the edit dialog closes and the existing handoff surface opens with a Codex profile choice, context choice, continuation prompt, and Start Agent action. On a phone, the rows stack and the action has a touch-sized target. The Claude session stays in the session list. The runner note refers only to the executor. Maps to AC `.7`, `.8`, `.9`.

### UI-01: Desktop New Subtask, workflow with fixed agent

```text
New subtask for Parent task                         [Close]
Initial agent             [Claude Opus             v]
Workflow agents (this subtask)
  Implement / PR          [Codex profile           v]
  Other fixed steps       [Use workflow agent      v]
Workspace                 [Use parent workspace    v]
Prompt                    [                         ]
                               [Cancel] [Create subtask]
```

### UI-02: Phone New Subtask, same choice

```text
New subtask for Parent task                         [Close]
Initial agent
[Claude Opus                                         v]
Workflow agents (this subtask)
Implement / PR
[Codex profile                                       v]
Workspace
[Use parent workspace                                v]
Prompt
[                                                    ]
------------------------------------------------------
                         [Create subtask]
```

The existing phone dialog is full height. One form body scrolls; the footer stays reachable above the safe area. The agent picker uses its existing responsive surface and returns focus to the selector. Fixed-agent rows appear only after workflow data loads. On failure the region shows Retry and preserves the other fields. Control order and visible source/selection are required; labels and spacing are illustrative. The preview maps to AC `.1`, `.2`, `.5`, and `.6`.

## Tests

| Criteria | Evidence |
| --- | --- |
| `.2`, `.3`, `.4` | MCP handler schema/payload tests and task service child creation tests for override isolation, deferred launch, rejection, and effective preview |
| `.1`, `.5`, `.6` | Subtask form state, row derivation, submission, and rendered component tests |
| `.7`, `.8`, `.9` | Started-task edit action and handoff identity tests; unchanged runner mutability tests |

## E2E tests

- `apps/web/e2e/tests/task/subtask-agent-selection.spec.ts` (`chromium`): create a child of a Claude-profile parent, select a Codex replacement for a fixed step, and inspect child profile/model while parent remains unchanged. Covers `.1`, `.2`, `.4`.
- `apps/web/e2e/tests/task/mobile-subtask-agent-selection.spec.ts` (`mobile-chrome`): make the same choice in the phone dialog, verify touch selection, contained scroll, footer access, and no horizontal overflow. Covers `.1`, `.2`, `.5`, `.6`.
- `apps/web/e2e/tests/task/subtask-agent-handoff.spec.ts` (`chromium`) and `mobile-subtask-agent-handoff.spec.ts` (`mobile-chrome`): open Edit Task on a started Claude child, hand off to Codex, confirm both sessions remain and the executor is unchanged. Covers `.7`, `.8`, `.9`.

## Work orders

- [ ] [Task 00: Continue an existing child with another agent](task-00-existing-subtask-handoff.md)
- [x] [Task 01: Expose child workflow replacements in MCP](task-01-mcp-contract.md)
- [ ] [Task 02: Add subtask form selection](task-02-subtask-form.md)

## Verification results

Implemented 2026-10-04. Backend MCP/service checks and all frontend unit tests pass; `pnpm run i18n:check` passes. The four Playwright specs are written but unverified locally: on the Windows host, mock-agent sessions never become answerable (the existing workflow-override E2E fails identically), so they need a Linux CI run before Tasks 00 and 02 are marked done and the specs are promoted.

## Risks

- The initial agent selector alone may appear to promise control over pinned workflow steps; the form must show both effective choices clearly.
- A user may read the runner lock as an agent lock; the edit surface must label the executor boundary and expose the working handoff route.
- MCP input validation must reject duplicate sources rather than silently accepting a last-write-wins map.
- A child sharing the parent's materialized workspace must still validate the replacement profile against that executor.

## Open questions

- Should stored workflow-agent replacements also be editable after creation? This package covers creation only pending that product decision.
