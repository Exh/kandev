import { expect } from "../../fixtures/test-base";
import type { Page } from "@playwright/test";
import type { ApiClient } from "../../helpers/api-client";
import type { SeedData } from "../../fixtures/test-base";
import {
  waitForNewWorkflowProfileSession,
  type WorkflowAgentOverrideFixture,
} from "./task-workflow-agent-overrides-helpers";

type Profile = Awaited<ReturnType<ApiClient["createAgentProfile"]>>;

export type ClaudeCodexProfiles = { claude: Profile; codex: Profile };

/**
 * The mock agent stands in for both providers: two profiles with distinct
 * models are enough to prove that a child's profile and model differ from
 * its parent's.
 */
export async function seedClaudeCodexProfiles(
  apiClient: ApiClient,
  suffix: string,
): Promise<ClaudeCodexProfiles> {
  const { agents } = await apiClient.listAgents();
  const agent = agents.find((candidate) => candidate.id !== "dynamic") ?? agents[0];
  if (!agent) throw new Error("the mock-agent fixture has no launchable agent family");
  const [claude, codex] = await Promise.all([
    apiClient.createAgentProfile(agent.id, `${suffix} Claude Opus`, { model: "mock-fast" }),
    apiClient.createAgentProfile(agent.id, `${suffix} Codex`, { model: "mock-slow" }),
  ]);
  return { claude, codex };
}

/** A Claude parent with a started Claude child, both answerable. */
export async function createStartedClaudeChild(
  apiClient: ApiClient,
  seedData: SeedData,
  profiles: ClaudeCodexProfiles,
  title: string,
) {
  const common = {
    description: "/e2e:simple-message",
    workflow_id: seedData.workflowId,
    workflow_step_id: seedData.startStepId,
    repository_ids: [seedData.repositoryId],
  };
  const parent = await apiClient.createTaskWithAgent(
    seedData.workspaceId,
    `${title} parent`,
    profiles.claude.id,
    common,
  );
  const child = await apiClient.createTaskWithAgent(
    seedData.workspaceId,
    title,
    profiles.claude.id,
    { ...common, parent_id: parent.id },
  );
  const claudeSessionId = await waitForNewWorkflowProfileSession(
    apiClient,
    child.id,
    profiles.claude.id,
  );
  return { parent, child, claudeSessionId };
}

/** Both sessions remain, the new one runs Codex, and the runner is unchanged. */
export async function expectCodexSessionBesideClaude(
  apiClient: ApiClient,
  taskId: string,
  profiles: ClaudeCodexProfiles,
  claudeSessionId: string,
) {
  const codexSessionId = await waitForNewWorkflowProfileSession(
    apiClient,
    taskId,
    profiles.codex.id,
    [claudeSessionId],
  );
  const { sessions } = await apiClient.listTaskSessions(taskId);
  const claude = sessions.find((session) => session.id === claudeSessionId);
  const codex = sessions.find((session) => session.id === codexSessionId);
  expect(claude?.agent_profile_id).toBe(profiles.claude.id);
  expect(codex?.agent_profile_id).toBe(profiles.codex.id);
  expect(codex?.executor_id).toBe(claude?.executor_id);
  return codexSessionId;
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * A Claude parent in a workflow whose Implement and PR steps pin Claude. The
 * subtask dialog creates children in the board's workflow, so the board
 * filter points at the fixture workflow.
 */
export async function createClaudeParentInFixedWorkflow(
  apiClient: ApiClient,
  seedData: SeedData,
  fixture: WorkflowAgentOverrideFixture,
  title: string,
) {
  await apiClient.saveUserSettings({
    workspace_id: seedData.workspaceId,
    workflow_filter_id: fixture.workflow.id,
  });
  return apiClient.createTaskWithAgent(seedData.workspaceId, title, fixture.profileA.id, {
    description: "/e2e:simple-message",
    workflow_id: fixture.workflow.id,
    workflow_step_id: fixture.analysisStep.id,
    repository_ids: [seedData.repositoryId],
    executor_profile_id: seedData.worktreeExecutorProfileId,
  });
}

export async function waitForCreatedChildId(page: Page, parentId: string): Promise<string> {
  let childId = "";
  await expect
    .poll(
      () => {
        const match = page.url().match(/\/t\/([^/?#]+)/);
        childId = match && match[1] !== parentId ? match[1] : "";
        return childId;
      },
      { timeout: 15_000, message: "the created subtask did not open" },
    )
    .not.toBe("");
  return childId;
}

/** The child stores the Codex replacement; the parent keeps none. */
export async function expectChildOnlyReplacement(
  apiClient: ApiClient,
  fixture: WorkflowAgentOverrideFixture,
  childId: string,
  parentId: string,
) {
  const child = await apiClient.getTask(childId);
  expect(child.parent_id).toBe(parentId);
  expect(child.workflow_agent_overrides).toMatchObject({
    workflow_id: fixture.workflow.id,
    steps: [
      {
        step_id: fixture.implementStep.id,
        source_profile_id: fixture.profileA.id,
        replacement_profile_id: fixture.profileB.id,
      },
    ],
  });
  const parent = await apiClient.getTask(parentId);
  expect(parent.workflow_agent_overrides?.steps ?? []).toEqual([]);
}
