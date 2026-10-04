"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listWorkflowSteps } from "@/lib/api/domains/workflow-api";
import type { AgentProfileOption } from "@/lib/state/slices";
import type { WorkflowStep } from "@/lib/types/http";
import {
  buildWorkflowAgentOverrideRows,
  type WorkflowAgentOverrideOption,
  type WorkflowAgentOverrideRow,
} from "@/components/task-create-dialog-workflow-agent-overrides";

export type SubtaskWorkflowAgentsStatus = "loading" | "error" | "ready";

export type SubtaskWorkflowAgents = {
  rows: WorkflowAgentOverrideRow[];
  options: WorkflowAgentOverrideOption[];
  status: SubtaskWorkflowAgentsStatus;
  invalid: boolean;
  /** A chosen replacement cannot be validated or is unavailable. */
  submitBlocked: boolean;
  onChange: (sourceProfileId: string, replacementProfileId: string) => void;
  onReset: () => void;
  onRetry: () => void;
};

function toOverrideSteps(steps: readonly WorkflowStep[]) {
  return steps.map((step) => ({
    id: step.id,
    title: step.name,
    position: step.position,
    agent_profile_id: step.agent_profile_id,
    session_target: step.session_target,
  }));
}

function useWorkflowSteps(workflowId: string | null, open: boolean) {
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [status, setStatus] = useState<SubtaskWorkflowAgentsStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  const generationRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    const generation = ++generationRef.current;
    setSteps([]);
    if (!workflowId) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    void listWorkflowSteps(workflowId, { cache: "no-store" }).then(
      (response) => {
        if (generationRef.current !== generation) return;
        setSteps(response.steps);
        setStatus("ready");
      },
      () => {
        if (generationRef.current !== generation) return;
        setStatus("error");
      },
    );
    return () => {
      generationRef.current += 1;
    };
  }, [workflowId, open, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { steps, status, retry };
}

/**
 * Fixed-profile replacement rows for a new subtask. Replacements start at the
 * workflow profile; the parent's own replacements are never copied.
 */
export function useSubtaskWorkflowAgents({
  workflowId,
  open,
  profiles,
  options,
  overrides,
  setOverrides,
}: {
  workflowId: string | null;
  open: boolean;
  profiles: readonly AgentProfileOption[];
  options: readonly WorkflowAgentOverrideOption[];
  overrides: Readonly<Record<string, string>>;
  setOverrides: (next: Record<string, string>) => void;
}): SubtaskWorkflowAgents {
  const { steps, status, retry } = useWorkflowSteps(workflowId, open);
  const rows = useMemo(
    () =>
      status === "ready"
        ? buildWorkflowAgentOverrideRows({
            steps: toOverrideSteps(steps),
            profiles,
            replacementOptions: options,
            overrides,
          })
        : [],
    [status, steps, profiles, options, overrides],
  );
  const invalid = rows.some((row) => !row.replacementAvailable);
  const hasSelection = Object.values(overrides).some((value) => value.trim() !== "");
  const onChange = useCallback(
    (sourceProfileId: string, replacementProfileId: string) => {
      const next = { ...overrides };
      if (!replacementProfileId || replacementProfileId === sourceProfileId) {
        delete next[sourceProfileId];
      } else {
        next[sourceProfileId] = replacementProfileId;
      }
      setOverrides(next);
    },
    [overrides, setOverrides],
  );
  const onReset = useCallback(() => setOverrides({}), [setOverrides]);
  return {
    rows,
    options: options as WorkflowAgentOverrideOption[],
    status,
    invalid,
    submitBlocked: invalid || (hasSelection && status !== "ready"),
    onChange,
    onReset,
    onRetry: retry,
  };
}
