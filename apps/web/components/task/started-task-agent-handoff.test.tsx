import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskSession } from "@/lib/types/http";

type SessionsState = { sessions: TaskSession[]; isLoaded: boolean };
let mockSessions: SessionsState = { sessions: [], isLoaded: false };
let mockProfiles = [
  { id: "codex", label: "Codex", agentName: "codex", disabled: false },
  { id: "gemini", label: "Gemini", agentName: "gemini", disabled: true },
];

vi.mock("@/hooks/use-task-sessions", () => ({
  useTaskSessions: () => mockSessions,
}));

vi.mock("@/components/state-provider", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      agentProfiles: {
        items: [{ id: "claude-opus", label: "Claude • Opus", agent_name: "claude" }],
      },
    }),
}));

vi.mock("@/components/agent-logo", () => ({ AgentLogo: () => null }));

vi.mock("@kandev/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect?: () => void;
  }) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

vi.mock("./handoff-profile-menu-items", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./handoff-profile-menu-items")>();
  return {
    ...actual,
    useHandoffProfiles: () => mockProfiles,
    useHasSelectableAgentProfiles: () => true,
  };
});

import { pickHandoffSourceSession, StartedTaskAgentHandoff } from "./started-task-agent-handoff";

function session(overrides: Record<string, unknown>): TaskSession {
  return {
    id: "session",
    task_id: "child-task",
    agent_profile_id: "claude-opus",
    is_primary: false,
    started_at: "2026-10-01T10:00:00Z",
    ...overrides,
  } as TaskSession;
}

const CONTINUE_BUTTON = "Continue with another agent";

describe("StartedTaskAgentHandoff", () => {
  afterEach(() => {
    cleanup();
    mockSessions = { sessions: [], isLoaded: false };
    mockProfiles = [
      { id: "codex", label: "Codex", agentName: "codex", disabled: false },
      { id: "gemini", label: "Gemini", agentName: "gemini", disabled: true },
    ];
  });

  // @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.7
  it("hands off from the child's primary session to the chosen profile", () => {
    mockSessions = {
      isLoaded: true,
      sessions: [
        session({ id: "newer", started_at: "2026-10-02T10:00:00Z" }),
        session({ id: "primary", is_primary: true }),
      ],
    };
    const onHandoff = vi.fn();
    render(<StartedTaskAgentHandoff taskId="child-task" onHandoff={onHandoff} />);

    expect(screen.getByTestId("started-task-current-agent").textContent).toContain("Opus");
    fireEvent.click(screen.getByRole("menuitem", { name: /Codex/ }));

    expect(onHandoff).toHaveBeenCalledWith({
      sourceSessionId: "primary",
      targetProfileId: "codex",
    });
  });

  // @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.8
  // @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.9
  it("explains the new-session boundary and shows why a profile is unavailable", () => {
    mockSessions = { isLoaded: true, sessions: [session({ id: "primary", is_primary: true })] };
    const onHandoff = vi.fn();
    render(<StartedTaskAgentHandoff taskId="child-task" onHandoff={onHandoff} />);

    expect(screen.getByTestId("started-task-agent-hint").textContent).toContain(
      "Workflow steps with a fixed agent keep using that agent",
    );
    const gemini = screen.getByRole("menuitem", { name: /Gemini/ }) as HTMLButtonElement;
    expect(gemini.disabled).toBe(true);
    expect(gemini.textContent).toContain("Not configured for this executor");
    fireEvent.click(gemini);
    expect(onHandoff).not.toHaveBeenCalled();
  });

  it("disables the action with a reason until a session exists", () => {
    mockSessions = { isLoaded: true, sessions: [] };
    render(<StartedTaskAgentHandoff taskId="child-task" onHandoff={vi.fn()} />);

    expect(
      (screen.getByRole("button", { name: CONTINUE_BUTTON }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByTestId("started-task-agent-hint").textContent).toBe(
      "This task has no session to continue yet.",
    );
  });
});

describe("pickHandoffSourceSession", () => {
  it("falls back to the newest session when none is primary", () => {
    const picked = pickHandoffSourceSession([
      session({ id: "old", started_at: "2026-10-01T10:00:00Z" }),
      session({ id: "new", started_at: "2026-10-03T10:00:00Z" }),
    ]);
    expect(picked?.id).toBe("new");
  });

  it("returns null without sessions", () => {
    expect(pickHandoffSourceSession([])).toBeNull();
  });
});
