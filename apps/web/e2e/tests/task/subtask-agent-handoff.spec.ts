import { expect, test } from "../../fixtures/test-base";
import { useRegularMode } from "../../helpers/regular-mode";
import { KanbanPage } from "../../pages/kanban-page";
import {
  createStartedClaudeChild,
  expectCodexSessionBesideClaude,
  seedClaudeCodexProfiles,
} from "./subtask-agent-selection-helpers";

// REQ-TASKS-SUBTASK-AGENT-SELECTION-001 (.7, .8, .9): Edit Task on a started
// subtask hands it off to another agent through a new session.
useRegularMode();

test.describe("Started subtask agent handoff", () => {
  test("continues a Claude child in a Codex session without changing its runner", async ({
    testPage,
    apiClient,
    seedData,
  }) => {
    test.setTimeout(150_000);
    const profiles = await seedClaudeCodexProfiles(apiClient, "Desktop Handoff");
    const { child, claudeSessionId } = await createStartedClaudeChild(
      apiClient,
      seedData,
      profiles,
      "Desktop handoff child",
    );

    const kanban = new KanbanPage(testPage);
    await kanban.goto();
    await kanban.openTaskActionsMenu(child.id);
    await testPage.getByRole("menuitem", { name: "Edit", exact: true }).click();
    const dialog = testPage.getByTestId("create-task-dialog");
    await expect(dialog).toBeVisible();

    await expect(dialog.getByTestId("started-task-current-agent")).toContainText("Claude Opus");
    await expect(dialog.getByTestId("started-task-agent-hint")).toContainText(
      "Workflow steps with a fixed agent keep using that agent",
    );
    await expect(dialog.getByTestId("runner-column-label")).toHaveText(
      "Runner (executor and environment)",
    );
    await expect(dialog.getByTestId("runner-ineligible-note")).toContainText(
      "already has a session",
    );

    await dialog.getByTestId("continue-with-another-agent").click();
    await testPage.getByTestId(`handoff-profile-${profiles.codex.id}`).click();
    await expect(dialog).toHaveCount(0);

    const handoff = testPage.getByRole("dialog").filter({ hasText: "Hand off to" });
    await expect(handoff).toBeVisible();
    await expect(handoff).toContainText("Codex");
    await handoff.getByTestId("task-description-input").fill("/e2e:simple-message");
    await handoff.getByRole("button", { name: "Start Agent" }).click();
    await expect(handoff).toHaveCount(0, { timeout: 15_000 });

    await expect(testPage).toHaveURL(new RegExp(`/t/${child.id}`), { timeout: 15_000 });
    await expectCodexSessionBesideClaude(apiClient, child.id, profiles, claudeSessionId);
  });
});
