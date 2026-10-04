"use client";

import { useTranslation } from "react-i18next";
import { TaskCreateWorkflowAgentOverridesSection } from "@/components/task-create-dialog-advanced-settings";
import type { SubtaskWorkflowAgents } from "@/hooks/domains/kanban/use-subtask-workflow-agents";

/**
 * Child-only replacements for the workflow's fixed agent profiles. Hidden for
 * a workflow without fixed profiles; loading and failed loads stay visible so
 * they are never mistaken for an empty list.
 */
export function SubtaskWorkflowAgentsSection({
  state,
  disabled,
}: {
  state: SubtaskWorkflowAgents;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  if (state.status === "ready" && state.rows.length === 0) return null;
  return (
    <div data-testid="subtask-workflow-agents">
      <TaskCreateWorkflowAgentOverridesSection
        rows={state.rows}
        options={state.options}
        loading={state.status === "loading"}
        error={state.status === "error"}
        invalid={state.invalid}
        dependenciesDisabled={disabled}
        onChange={state.onChange}
        onReset={state.onReset}
        onRetry={state.onRetry}
        description={t("task:workflowAgentsSubtaskOnly")}
      />
    </div>
  );
}
