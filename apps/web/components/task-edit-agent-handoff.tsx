"use client";

import { useCallback, useState } from "react";
import { NewSessionDialog } from "@/components/task/new-session-dialog";
import { StartedTaskAgentHandoff } from "@/components/task/started-task-agent-handoff";
import type { HandoffPreset } from "@/components/task/handoff-types";
import type { TaskCreateDialogProps } from "@/components/task-create-dialog-types";

type PendingHandoff = { taskId: string; preset: HandoffPreset };

/**
 * Edit Task's route to another agent for a started task. Choosing a profile
 * closes the edit dialog before the handoff dialog opens, so only one modal
 * owns focus and scrolling at a time.
 */
export function useEditAgentHandoff(
  props: Pick<TaskCreateDialogProps, "editingTask" | "onOpenChange">,
  enabled: boolean,
) {
  const taskId = props.editingTask?.id;
  const { onOpenChange } = props;
  const [pending, setPending] = useState<PendingHandoff | null>(null);
  const handleHandoff = useCallback(
    (preset: HandoffPreset) => {
      if (!taskId) return;
      onOpenChange(false);
      setPending({ taskId, preset });
    },
    [taskId, onOpenChange],
  );

  const slot =
    enabled && taskId ? (
      <StartedTaskAgentHandoff taskId={taskId} onHandoff={handleHandoff} />
    ) : undefined;
  const dialog = pending ? (
    <NewSessionDialog
      open
      onOpenChange={(open) => {
        if (!open) setPending(null);
      }}
      taskId={pending.taskId}
      handoff={pending.preset}
    />
  ) : null;
  return { slot, dialog };
}
