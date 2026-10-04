"use client";

import { useMemo } from "react";
import { Button } from "@kandev/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@kandev/ui/dropdown-menu";
import { AgentLogo } from "@/components/agent-logo";
import { useAppStore } from "@/components/state-provider";
import { useTaskSessions } from "@/hooks/use-task-sessions";
import type { TaskSession } from "@/lib/types/http";
import { parseTurnTimestamp } from "@/lib/state/slices/session/turn-actions";
import { useTranslation } from "react-i18next";
import {
  HandoffProfileList,
  useHandoffProfiles,
  useHasSelectableAgentProfiles,
} from "./handoff-profile-menu-items";
import type { HandoffPreset } from "./handoff-types";

/** The session a handoff continues from: the primary one, else the newest. */
export function pickHandoffSourceSession(sessions: readonly TaskSession[]): TaskSession | null {
  const primary = sessions.find((session) => session.is_primary);
  if (primary) return primary;
  let newest: TaskSession | null = null;
  let newestStartedAt: bigint | null = null;
  for (const session of sessions) {
    const startedAt = parseTurnTimestamp(session.started_at);
    if (
      !newest ||
      (startedAt !== null && (newestStartedAt === null || startedAt > newestStartedAt))
    ) {
      newest = session;
      newestStartedAt = startedAt;
    }
  }
  return newest;
}

function useCurrentAgent(profileId: string | undefined) {
  const profiles = useAppStore((state) => state.agentProfiles.items);
  return useMemo(() => {
    const profile = profiles.find((entry) => entry.id === profileId);
    if (!profile) return null;
    const parts = profile.label.split(" • ");
    const label = parts.length > 1 ? parts.slice(1).join(" • ") : profile.label;
    return { label, agentName: profile.agent_name };
  }, [profiles, profileId]);
}

type StartedTaskAgentHandoffProps = {
  taskId: string;
  onHandoff: (preset: HandoffPreset) => void;
};

/**
 * Edit Task's agent area for a task that already has a session. The runner is
 * locked, but the agent can continue in a new session on the same task.
 */
export function StartedTaskAgentHandoff({ taskId, onHandoff }: StartedTaskAgentHandoffProps) {
  const { t } = useTranslation();
  const { sessions, isLoaded } = useTaskSessions(taskId);
  const source = pickHandoffSourceSession(sessions);
  const currentAgent = useCurrentAgent(source?.agent_profile_id);
  const profiles = useHandoffProfiles(taskId, source !== null);
  const hasSelectableProfiles = useHasSelectableAgentProfiles();
  let unavailableReason: string | null = null;
  if (!isLoaded) unavailableReason = t("task:loadingSessions");
  else if (source === null) unavailableReason = t("task:noSessionToContinue");

  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-testid="started-task-agent">
      <span className="text-xs font-medium text-muted-foreground">{t("task:agent")}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span
          className="inline-flex min-w-0 items-center gap-1.5 text-sm"
          data-testid="started-task-current-agent"
        >
          {currentAgent?.agentName && (
            <AgentLogo agentName={currentAgent.agentName} size={14} className="shrink-0" />
          )}
          <span className="min-w-0 wrap-break-word">
            {currentAgent?.label ?? t("common:agent")}
          </span>
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-11 cursor-pointer sm:h-7"
              disabled={unavailableReason !== null}
              data-testid="continue-with-another-agent"
            >
              {t("task:continueWithAnotherAgent")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <HandoffProfileList
              profiles={profiles}
              hasSelectableProfiles={hasSelectableProfiles}
              Item={DropdownMenuItem}
              showDisabledReason
              onSelectProfile={(profileId) => {
                if (source) onHandoff({ sourceSessionId: source.id, targetProfileId: profileId });
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-[11px] text-muted-foreground" data-testid="started-task-agent-hint">
        {unavailableReason ?? t("task:continueWithAnotherAgentHint")}
      </p>
    </div>
  );
}
