import { expect, test } from "../../fixtures/test-base";
import { useRegularMode } from "../../helpers/regular-mode";
import { MobileKanbanPage } from "../../pages/mobile-kanban-page";
import {
  createStartedClaudeChild,
  expectCodexSessionBesideClaude,
  expectNoHorizontalOverflow,
  seedClaudeCodexProfiles,
} from "./subtask-agent-selection-helpers";

// REQ-TASKS-SUBTASK-AGENT-SELECTION-001 (.7, .8, .9) on a phone: the same
// handoff through the mobile task-actions sheet with touch-sized controls.
useRegularMode();

test.describe("Started subtask agent handoff on mobile", () => {
  test("continues a Claude child in a Codex session by touch", async ({
    testPage,
    apiClient,
    seedData,
  }) => {
    test.setTimeout(150_000);
    const profiles = await seedClaudeCodexProfiles(apiClient, "Mobile Handoff");
    const { child, claudeSessionId } = await createStartedClaudeChild(
      apiClient,
      seedData,
      profiles,
      "Mobile handoff child",
    );

    const mobile = new MobileKanbanPage(testPage);
    await mobile.goto();
    await mobile.taskCard(child.id).getByRole("button", { name: "More options" }).tap();
    await testPage
      .locator('[data-slot="dropdown-menu-content"]:visible')
      .getByRole("menuitem", { name: "Edit", exact: true })
      .tap();
    const dialog = testPage.getByTestId("create-task-dialog");
    await expect(dialog).toBeVisible();

    const action = dialog.getByTestId("continue-with-another-agent");
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    await expect(dialog.getByTestId("runner-column-label")).toBeVisible();
    await expectNoHorizontalOverflow(testPage);

    await action.tap();
    const codexItem = testPage.getByTestId(`handoff-profile-${profiles.codex.id}`);
    await expect(codexItem).toBeVisible();
    await codexItem.tap();
    await expect(dialog).toHaveCount(0);

    const handoff = testPage.getByRole("dialog").filter({ hasText: "Hand off to" });
    await expect(handoff).toBeVisible();
    await handoff.getByTestId("task-description-input").fill("/e2e:simple-message");
    await handoff.getByRole("button", { name: "Start Agent" }).tap();
    await expect(handoff).toHaveCount(0, { timeout: 15_000 });

    await expectCodexSessionBesideClaude(apiClient, child.id, profiles, claudeSessionId);
  });
});
