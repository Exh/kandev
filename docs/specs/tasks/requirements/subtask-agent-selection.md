---
status: draft
system: tasks
created: 2026-09-29
owners:
  - kandev
---

# Subtask agent selection requirements

## Overview

A child task can use a different agent provider or model from its parent, including after its first session exists. The task system owns the choice because it controls the child's sessions and workflow routing; the agent system owns the available profiles. This extends [task workflow agent overrides](workflow-agent-overrides.md) to subtask creation and makes the existing session handoff path visible when editing a started child.

## Terminology

- **Initial agent:** The profile requested for the child's first session where workflow routing permits it.
- **Workflow agent replacement:** A child-owned replacement for a fixed profile used by one or more workflow steps.
- **Handoff:** Starting another session on the same task with a selected agent profile, keeping the earlier session and task history.

## Requirements

### REQ-TASKS-SUBTASK-AGENT-SELECTION-001: Independent child agent routing

**Intent:** Let a user choose a Codex profile for a subtask even when its parent runs Claude Opus, without changing the parent or shared workflow.

#### Acceptance criteria

- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.1:** The New Subtask form shall show the selected initial agent and, when its workflow has fixed agent profiles, offer a separate replacement choice for each distinct fixed profile. It shall identify the affected steps and the effective agent before creation.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.2:** A user shall be able to choose an eligible profile from another provider for the child. Fixed workflow steps shall use the child's explicit replacements; initial-session and referenced-session targets shall keep their existing routing rules. Parent task, sibling tasks, and shared workflow definitions shall retain their own selections.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.3:** `create_task_kandev` shall accept explicit fixed-profile replacements for a child task and report an actionable error for invalid choices before creating or starting it. Omitting the new input shall preserve current inheritance and routing.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.4:** Child selections shall survive deferred launch, reload, and restart. The launch and workflow previews shall report the effective child profile and model; an unavailable replacement shall fail visibly instead of silently reverting to the parent's or workflow's profile.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.5:** The form shall work on desktop and phone with visible labels, keyboard and touch selection, contained scrolling, focus return, and no horizontal overflow. Phone controls shall have at least 44-pixel touch targets.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.6:** A workflow without fixed profiles shall show only the initial agent choice. Loading or failed workflow data shall not be presented as an empty list of fixed agents; failed loading shall allow retry without losing the draft.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.7:** When a subtask already has a session, editing it shall offer a visible way to continue with another agent profile. Selecting Codex shall open the existing handoff flow for that same subtask, preserve its Claude session and task history, and activate the new Codex session after launch.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.8:** The started-task edit surface shall distinguish the immutable runner (executor and workspace environment) from the agent profile. A runner lock shall not imply that the agent cannot change. Handoff shall explain that it starts a new session and does not alter fixed workflow-step routing.
- **AC-TASKS-SUBTASK-AGENT-SELECTION-001.9:** If Codex is unavailable or incompatible with the existing executor, the handoff control shall give an actionable reason and shall not alter the existing task or Claude session. Desktop and phone users shall have an accessible, touch-usable path.

## Out of scope

- Editing a child task's stored workflow replacements after creation. Existing session-level model controls retain their current behavior.
- Changing the selected provider/model inside an already running session.
- Automatic copying of the parent's workflow replacement map.
- Changing executor or materialized-workspace inheritance, Office assignees, review participants, or workflow definitions.

## Planning assumption

The after-creation path uses a new session on the same child task, retaining the Claude session and history. Whether the child's stored fixed-step replacements should also be editable later remains a separate product decision.
