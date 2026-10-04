import { expect, test } from "../../fixtures/test-base";
import { useRegularMode } from "../../helpers/regular-mode";
import { SessionPage } from "../../pages/session-page";
import {
  deleteFixtureTasks,
  seedWorkflowAgentOverrideFixture,
} from "./task-workflow-agent-overrides-helpers";
import {
  createClaudeParentInFixedWorkflow,
  expectChildOnlyReplacement,
  waitForCreatedChildId,
} from "./subtask-agent-selection-helpers";

// REQ-TASKS-SUBTASK-AGENT-SELECTION-001 (.1, .2, .4): a Claude parent's new
// subtask replaces the workflow's fixed Claude step with a Codex profile.
useRegularMode();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Subtask agent selection", () => {
  test("creates a Codex child under a Claude parent without changing the parent", async ({
    testPage,
    apiClient,
    seedData,
  }) => {
    test.setTimeout(180_000);
    await testPage.setViewportSize({ width: 1440, height: 900 });
    const fixture = await seedWorkflowAgentOverrideFixture(apiClient, seedData, "Subtask Agents");
    const parent = await createClaudeParentInFixedWorkflow(
      apiClient,
      seedData,
      fixture,
      "Subtask agents parent",
    );
    const createdTaskIds: string[] = [parent.id];

    try {
      await testPage.goto(`/t/${parent.id}`);
      const session = new SessionPage(testPage);
      await session.waitForLoad();
      await session.waitForChatIdle({ timeout: 30_000 });
      await session.openCreateSubtaskForSidebarTask("Subtask agents parent");

      const dialog = testPage.getByTestId("new-subtask-dialog");
      await expect(dialog).toBeVisible();
      const region = dialog.getByTestId("subtask-workflow-agents");
      await expect(region).toContainText("this subtask only", { timeout: 20_000 });
      const row = region.getByTestId(`task-create-workflow-agent-override-${fixture.profileA.id}`);
      await expect(row).toContainText("Implement");
      await expect(row).toContainText("PR");

      const selector = row.getByTestId("agent-profile-selector");
      await expect(selector).toContainText("Use workflow profile");
      await selector.click();
      const codexOption = testPage.getByRole("option", {
        name: new RegExp(escapeRegExp(fixture.profileB.name)),
      });
      await codexOption.click();
      await expect(selector).toContainText(fixture.profileB.name);

      await dialog.getByTestId("subtask-title-input").fill("Codex child");
      await dialog.getByTestId("subtask-prompt-input").fill("/e2e:simple-message");
      await dialog.getByRole("button", { name: "Create Subtask", exact: true }).click();
      await expect(dialog).toHaveCount(0, { timeout: 15_000 });

      const childId = await waitForCreatedChildId(testPage, parent.id);
      createdTaskIds.push(childId);
      await expectChildOnlyReplacement(apiClient, fixture, childId, parent.id);

      await testPage.reload();
      await session.waitForLoad();
      const implementStep = testPage.getByTestId("workflow-step-Implement");
      await expect(implementStep).toBeVisible();
      await implementStep.hover();
      await expect(
        testPage.getByTestId("workflow-step-popover").getByTestId("workflow-move-preview"),
      ).toContainText("mock-slow");
    } finally {
      await deleteFixtureTasks(apiClient, createdTaskIds.reverse());
    }
  });
});
