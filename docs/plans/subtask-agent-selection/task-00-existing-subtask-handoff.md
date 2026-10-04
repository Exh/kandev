---
id: "00-existing-subtask-handoff"
title: "Continue an existing child with another agent"
status: in_progress
wave: 1
depends_on: []
plan: "plan.md"
requirements:
  - REQ-TASKS-SUBTASK-AGENT-SELECTION-001
acceptance_criteria:
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.7
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.8
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.9
system_design:
  - ../../specs/tasks/system-design/subtask-agent-selection.md
---

# Task 00: Continue an existing child with another agent

## Summary

Make the existing agent handoff path visible from Edit Task for a started subtask. A runner lock continues to protect the executor while a Codex session can continue the same child task.

## In scope

- Own the started-task selector region in `apps/web/components/task-create-dialog-form-body.tsx`, the edit-dialog action wiring, and focused component tests.
- Reuse `apps/web/components/task/handoff-profile-menu-items.tsx` and `apps/web/components/task/new-session-dialog.tsx` behavior; change those files only when necessary to expose the same task/session handoff safely.
- Add localized labels/explanation in all six catalogs and update `docs/public/coordination.md`.
- Add the desktop and mobile handoff E2E flows named in the plan.

## Out of scope

- Updating the runner after materialization, converting an existing Claude session in place, or editing stored workflow replacements.

## Acceptance

- Edit Task on a started child shows the current agent and a visible Continue with another agent action beside a runner note that clearly refers to the executor.
- Choosing Codex opens handoff for that child, launches a new session, activates it, and retains the Claude session and workspace.
- Missing or incompatible profiles give an actionable reason without changing the child; desktop and phone can complete the flow.

## ASCII UI preview

Use [UI-00 in the plan](plan.md#ui-00-started-subtask-edit-task-on-desktop-and-phone):

```text
Agent                     Claude Opus
                          [Continue with another agent]
Runner / environment      Worktree (locked: session exists)
```

On a phone, rows stack and the agent action is touch sized. The edit dialog closes before the existing handoff surface opens. Maps to AC `.7`, `.8`, `.9`.

## Verification

```bash
pnpm exec vitest run components/task-create-dialog-form-body.test.tsx components/task/new-session-dialog.test.tsx components/task/handoff-profile-menu-items.test.ts
pnpm run i18n:check
pnpm e2e:run --project=chromium e2e/tests/task/subtask-agent-handoff.spec.ts
pnpm e2e:run --project=mobile-chrome e2e/tests/task/mobile-subtask-agent-handoff.spec.ts
```

Run from `apps/web`; rebuild the web and backend artifacts required by E2E first. Record exact results here after implementation.

## Risks

- Modal stacking and focus return must be correct when the handoff starts from Edit Task.
- Fixed workflow steps can still select their configured profile for later automated launches; the UI must state this boundary.

## Results

Implemented 2026-10-04; E2E pending CI.

- Edit Task on a started task shows the current agent, a **Continue with another agent** profile menu (touch-sized on phones, disabled profiles show their executor reason), the new-session/workflow-routing hint, and a **Runner (executor and environment)** label above the runner note.
- Choosing a profile closes Edit Task, then opens `NewSessionDialog` with a handoff preset for the child's primary (else newest) session.
- `NewSessionDialog` now reads the handoff source session instead of the globally active session, so the runner and compatibility come from the child; when another task is open it activates the child and navigates to it instead of adding a panel to the current layout.
- Unit: `pnpm exec vitest run components/task-create-dialog-form-body.test.tsx components/task/new-session-dialog.test.tsx components/task/handoff-profile-menu-items.test.ts components/task/started-task-agent-handoff.test.tsx` passed. `pnpm run i18n:check` passed.
- E2E: `subtask-agent-handoff.spec.ts` and `mobile-subtask-agent-handoff.spec.ts` were written but could not be verified on the local Windows host: mock-agent sessions never become answerable there, and the existing `create-task-workflow-agent-overrides.spec.ts` fails the same way. Run on Linux CI.
