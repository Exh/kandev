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
  expectNoHorizontalOverflow,
  waitForCreatedChildId,
} from "./subtask-agent-selection-helpers";

// REQ-TASKS-SUBTASK-AGENT-SELECTION-001 (.1, .2, .5, .6) on a phone: the same
// child-only choice through touch, inside the full-height subtask dialog.
useRegularMode();

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test.describe("Subtask agent selection on mobile", () => {
  test("selects a Codex child by touch with a reachable footer", async ({
    testPage,
    apiClient,
    seedData,
  }) => {
    test.setTimeout(180_000);
    const fixture = await seedWorkflowAgentOverrideFixture(
      apiClient,
      seedData,
      "Mobile Subtask Agents",
    );
    const parent = await createClaudeParentInFixedWorkflow(
      apiClient,
      seedData,
      fixture,
      "Mobile subtask agents parent",
    );
    const createdTaskIds: string[] = [parent.id];

    try {
      await testPage.goto(`/t/${parent.id}`);
      const session = new SessionPage(testPage);
      await session.waitForLoad();
      await testPage.getByTestId("mobile-task-picker-trigger").tap();
      const taskSheet = testPage.getByRole("dialog", { name: "Tasks" });
      await taskSheet
        .getByTestId("sidebar-task-item")
        .filter({ hasText: "Mobile subtask agents parent" })
        .getByRole("button", { name: "Task actions" })
        .tap();
      await testPage.getByRole("menuitem", { name: "Create Subtask", exact: true }).tap();

      const dialog = testPage.getByTestId("new-subtask-dialog");
      await expect(dialog).toBeVisible();
      const row = dialog.getByTestId(`task-create-workflow-agent-override-${fixture.profileA.id}`);
      await expect(row).toBeVisible({ timeout: 20_000 });
      const selector = row.getByTestId("agent-profile-selector");
      await selector.scrollIntoViewIfNeeded();
      const box = await selector.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      await expectNoHorizontalOverflow(testPage);

      await selector.tap();
      await testPage
        .getByRole("option", { name: new RegExp(escapeRegExp(fixture.profileB.name)) })
        .tap();
      await expect(selector).toContainText(fixture.profileB.name);

      await dialog.getByTestId("subtask-title-input").fill("Mobile Codex child");
      await dialog.getByTestId("subtask-prompt-input").fill("/e2e:simple-message");
      const submit = dialog.getByRole("button", { name: "Create Subtask", exact: true });
      await submit.scrollIntoViewIfNeeded();
      await expect(submit).toBeInViewport();
      await expectNoHorizontalOverflow(testPage);
      await submit.tap();
      await expect(dialog).toHaveCount(0, { timeout: 15_000 });

      const childId = await waitForCreatedChildId(testPage, parent.id);
      createdTaskIds.push(childId);
      await expectChildOnlyReplacement(apiClient, fixture, childId, parent.id);
    } finally {
      await deleteFixtureTasks(apiClient, createdTaskIds.reverse());
    }
  });
});
