---
id: "02-subtask-form"
title: "Add subtask form selection"
status: in_progress
wave: 3
depends_on:
  - "01-mcp-contract"
plan: "plan.md"
requirements:
  - REQ-TASKS-SUBTASK-AGENT-SELECTION-001
acceptance_criteria:
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.1
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.2
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.4
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.5
  - AC-TASKS-SUBTASK-AGENT-SELECTION-001.6
system_design:
  - ../../specs/tasks/system-design/subtask-agent-selection.md
---

# Task 02: Add subtask form selection

## Summary

Expose the child's fixed workflow agent choices in New Subtask and submit them with the existing task create API. Make the effective routing clear on desktop and phone.

## In scope

- Own `apps/web/components/task/new-subtask-form-state.ts`, `new-subtask-dialog.tsx`, `new-subtask-form-parts.tsx`, `use-subtask-submit.ts`, and their focused tests.
- Reuse `task-create-dialog-workflow-agent-overrides.ts` and existing selection primitives; adjust shared components only where necessary for reuse.
- Add localized copy to six catalogs when existing keys do not express the child scope.
- Update the subtask creation instructions in `docs/public/coordination.md`.
- Add desktop and phone E2E flows named in the plan.

## Out of scope

- Editing task routing after creation or changing the model of a running session.

## Acceptance

- The form distinguishes initial profile from fixed workflow agent replacements and shows the affected steps.
- Loading, retry, invalid-choice, and create errors preserve the draft; the payload contains child-only replacements.
- Desktop and phone flows select a Codex child under a Claude parent and show the effective child model without changing the parent.

## ASCII UI preview

Use [UI-01 and UI-02 in the plan](plan.md#ascii-ui-preview). The changed region is:

```text
Initial agent
[Claude Opus                                         v]
Workflow agents (this subtask)
Implement / PR
[Codex profile                                       v]
```

On a phone these controls stack in the existing full-height dialog. The body is the scroll owner, the footer remains reachable, and selection uses touch-sized controls. Maps to AC `.1`, `.2`, `.5`, and `.6`.

## Verification

```bash
pnpm exec vitest run components/task/new-subtask-form-state.test.ts components/task/new-subtask-form-parts.test.tsx components/task/use-subtask-submit.test.ts components/task-create-dialog-workflow-agent-overrides.test.ts
pnpm run i18n:check
pnpm e2e:run --project=chromium e2e/tests/task/subtask-agent-selection.spec.ts
pnpm e2e:run --project=mobile-chrome e2e/tests/task/mobile-subtask-agent-selection.spec.ts
```

Run from `apps/web`. Build the web and backend artifacts required by the E2E harness before the Playwright commands. Record exact results here after implementation.

## Risks

- The current subtask form treats workflow override state and fetched steps as inert; replace those stubs only for the fields the dialog now uses.
- Loading errors must not be mistaken for a workflow with no fixed profiles.

## Results

Implemented 2026-10-04; E2E pending CI.

- `useSubtaskFormState` keeps a per-opening replacement map. `useSubtaskWorkflowAgents` loads the steps of the workflow the child is created in (`listWorkflowSteps`), derives rows with `buildWorkflowAgentOverrideRows`, and exposes loading, error/retry, invalid, and submit-blocked states.
- `SubtaskWorkflowAgentsSection` reuses the task-create override section (now exported, with a subtask-only scope note) after the initial agent selector; it is hidden for workflows without fixed profiles.
- `useSubtaskSubmit` sends normalized child-only `workflow_agent_overrides` and refuses to submit while a choice is blocked.
- Unit: `pnpm exec vitest run components/task/new-subtask-form-state.test.ts components/task/new-subtask-form-parts.test.tsx components/task/use-subtask-submit.test.ts components/task-create-dialog-workflow-agent-overrides.test.ts hooks/domains/kanban/use-subtask-workflow-agents.test.ts` passed. `pnpm run i18n:check` passed.
- E2E: `subtask-agent-selection.spec.ts` and `mobile-subtask-agent-selection.spec.ts` were written but could not be verified on the local Windows host (same mock-agent launch failure as the existing override spec). Run on Linux CI.
