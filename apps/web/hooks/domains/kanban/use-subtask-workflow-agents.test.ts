import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentProfileOption } from "@/lib/state/slices";

const { mockListWorkflowSteps } = vi.hoisted(() => ({ mockListWorkflowSteps: vi.fn() }));

vi.mock("@/lib/api/domains/workflow-api", () => ({
  listWorkflowSteps: mockListWorkflowSteps,
}));

import { useSubtaskWorkflowAgents } from "./use-subtask-workflow-agents";

const PROFILES = [
  { id: "claude-opus", label: "Claude • Opus", agent_name: "claude", enabled: true },
  { id: "codex", label: "Codex • GPT", agent_name: "codex", enabled: true },
] as AgentProfileOption[];
const OPTIONS = PROFILES.map((profile) => ({
  value: profile.id,
  label: profile.label,
  renderLabel: () => profile.label,
}));
const STEPS = {
  steps: [
    { id: "plan", name: "Plan", position: 0 },
    { id: "implement", name: "Implement", position: 1, agent_profile_id: "claude-opus" },
  ],
};

function renderAgents(overrides: Record<string, string> = {}) {
  const setOverrides = vi.fn();
  const hook = renderHook(
    (props: { overrides: Record<string, string> }) =>
      useSubtaskWorkflowAgents({
        workflowId: "workflow-1",
        open: true,
        profiles: PROFILES,
        options: OPTIONS,
        overrides: props.overrides,
        setOverrides,
      }),
    { initialProps: { overrides } },
  );
  return { ...hook, setOverrides };
}

describe("useSubtaskWorkflowAgents", () => {
  beforeEach(() => {
    mockListWorkflowSteps.mockReset();
  });

  // @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.1
  it("groups the workflow's fixed profiles after the steps load", async () => {
    mockListWorkflowSteps.mockResolvedValue(STEPS);
    const { result } = renderAgents();

    expect(result.current.status).toBe("loading");
    expect(result.current.rows).toEqual([]);
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0]).toMatchObject({
      sourceProfileId: "claude-opus",
      stepNames: ["Implement"],
      replacementProfileId: "",
    });
    expect(mockListWorkflowSteps).toHaveBeenCalledWith("workflow-1", { cache: "no-store" });
  });

  // @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.6
  it("reports a failed load and retries without touching the draft", async () => {
    mockListWorkflowSteps.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(STEPS);
    const { result, setOverrides } = renderAgents({ "claude-opus": "codex" });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.submitBlocked).toBe(true);
    act(() => result.current.onRetry());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.rows[0]?.replacementProfileId).toBe("codex");
    expect(result.current.submitBlocked).toBe(false);
    expect(setOverrides).not.toHaveBeenCalled();
  });

  it("drops a replacement that matches the source profile", async () => {
    mockListWorkflowSteps.mockResolvedValue(STEPS);
    const { result, setOverrides } = renderAgents({ "claude-opus": "codex" });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.onChange("claude-opus", "claude-opus"));

    expect(setOverrides).toHaveBeenCalledWith({});
  });

  // @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.4
  it("blocks submission when a chosen replacement is unavailable", async () => {
    mockListWorkflowSteps.mockResolvedValue(STEPS);
    const { result } = renderAgents({ "claude-opus": "deleted-profile" });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.invalid).toBe(true);
    expect(result.current.submitBlocked).toBe(true);
  });
});
