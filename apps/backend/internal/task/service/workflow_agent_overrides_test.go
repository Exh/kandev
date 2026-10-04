package service

import (
	"context"
	"errors"
	"testing"

	settingsmodels "github.com/kandev/kandev/internal/agent/settings/models"
	"github.com/kandev/kandev/internal/task/models"
	wfmodels "github.com/kandev/kandev/internal/workflow/models"
)

type workflowAgentOverrideProfilesStub struct {
	profiles map[string]*settingsmodels.AgentProfile
}

func (s workflowAgentOverrideProfilesStub) GetAgentProfile(_ context.Context, id string) (*settingsmodels.AgentProfile, error) {
	return s.profiles[id], nil
}

func TestNormalizeWorkflowAgentOverridesExpandsDistinctSourcesToFixedSteps(t *testing.T) {
	steps := []*wfmodels.WorkflowStep{
		{ID: "analysis", WorkflowID: "workflow-1", AgentProfileID: "profile-a"},
		{ID: "implement", WorkflowID: "workflow-1", AgentProfileID: "profile-a"},
		{ID: "review", WorkflowID: "workflow-1", AgentProfileID: "profile-a", SessionTarget: &wfmodels.WorkflowSessionTarget{}},
		{ID: "pr", WorkflowID: "workflow-1", AgentProfileID: "profile-b"},
	}
	profiles := workflowAgentOverrideProfilesStub{profiles: map[string]*settingsmodels.AgentProfile{
		"profile-b": {ID: "profile-b", Enabled: true, WorkspaceID: "workspace-1"},
		"profile-c": {ID: "profile-c", Enabled: true, WorkspaceID: "workspace-1"},
	}}

	overrides, err := normalizeWorkflowAgentOverrides(context.Background(), "workspace-1", "workflow-1", map[string]string{
		"profile-a": "profile-b",
		"profile-b": "profile-c",
	}, steps, profiles)
	if err != nil {
		t.Fatalf("normalizeWorkflowAgentOverrides: %v", err)
	}
	if len(overrides.Steps) != 3 {
		t.Fatalf("expanded bindings = %d, want 3", len(overrides.Steps))
	}
	if got, ok := overrides.ReplacementFor("workflow-1", "analysis"); !ok || got != "profile-b" {
		t.Fatalf("analysis replacement = %q, %v", got, ok)
	}
	if got, ok := overrides.ReplacementFor("workflow-1", "implement"); !ok || got != "profile-b" {
		t.Fatalf("implement replacement = %q, %v", got, ok)
	}
	if got, ok := overrides.ReplacementFor("workflow-1", "pr"); !ok || got != "profile-c" {
		t.Fatalf("pr replacement = %q, %v", got, ok)
	}
}

func TestNormalizeWorkflowAgentOverridesRejectsUnknownOrUnavailableChoices(t *testing.T) {
	steps := []*wfmodels.WorkflowStep{{ID: "implement", WorkflowID: "workflow-1", AgentProfileID: "profile-a"}}
	profiles := workflowAgentOverrideProfilesStub{profiles: map[string]*settingsmodels.AgentProfile{
		"profile-disabled": {ID: "profile-disabled", Enabled: false, WorkspaceID: "workspace-1"},
	}}
	for name, requested := range map[string]map[string]string{
		"unknown source":    {"profile-missing": "profile-disabled"},
		"disabled choice":   {"profile-a": "profile-disabled"},
		"empty source":      {"": "profile-disabled"},
		"empty replacement": {"profile-a": ""},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := normalizeWorkflowAgentOverrides(context.Background(), "workspace-1", "workflow-1", requested, steps, profiles); err == nil {
				t.Fatal("normalizeWorkflowAgentOverrides succeeded")
			}
		})
	}
}

type rejectingWorkflowAgentExecutorValidator struct {
	err   error
	calls []string
}

func (v *rejectingWorkflowAgentExecutorValidator) ValidateAgentProfileForExecutor(
	_ context.Context,
	profile *settingsmodels.AgentProfile,
	_ *models.Executor,
	_ *models.ExecutorProfile,
) error {
	v.calls = append(v.calls, profile.ID)
	return v.err
}

func TestCreateTaskRejectsIncompatibleWorkflowOverrideBeforePersistence(t *testing.T) {
	svc, _, repo := createTestService(t)
	ctx := context.Background()
	workspaceID := "workspace-override-compat"
	workflowID := "workflow-override-compat"
	executorID := "executor-override-compat"
	defaultExecutorID := executorID
	if err := repo.CreateWorkspace(ctx, &models.Workspace{
		ID:                workspaceID,
		Name:              "Override compatibility workspace",
		DefaultExecutorID: &defaultExecutorID,
	}); err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	if err := repo.CreateExecutor(ctx, &models.Executor{
		ID:        executorID,
		Name:      "Override compatibility executor",
		Type:      models.ExecutorTypeSSH,
		Status:    models.ExecutorStatusActive,
		Resumable: true,
	}); err != nil {
		t.Fatalf("CreateExecutor: %v", err)
	}
	if err := repo.CreateWorkflow(ctx, &models.Workflow{
		ID:          workflowID,
		WorkspaceID: workspaceID,
		Name:        "Override compatibility workflow",
	}); err != nil {
		t.Fatalf("CreateWorkflow: %v", err)
	}
	svc.SetWorkflowStepGetter(&fakeWorkflowStepGetter{steps: map[string]*wfmodels.WorkflowStep{
		"implement": {
			ID:             "implement",
			WorkflowID:     workflowID,
			AgentProfileID: "source-profile",
		},
	}})
	svc.agentProfiles = workflowAgentOverrideProfilesStub{profiles: map[string]*settingsmodels.AgentProfile{
		"replacement-profile": {
			ID:          "replacement-profile",
			Enabled:     true,
			WorkspaceID: workspaceID,
		},
	}}
	compatibilityErr := errors.New("replacement profile has no SSH credentials")
	validator := &rejectingWorkflowAgentExecutorValidator{err: compatibilityErr}
	svc.agentProfileExecutorValidator = validator

	_, err := svc.CreateTask(ctx, &CreateTaskRequest{
		WorkspaceID: workspaceID,
		WorkflowID:  workflowID,
		Title:       "Must not be persisted",
		ExecutorID:  executorID,
		WorkflowAgentOverrides: map[string]string{
			"source-profile": "replacement-profile",
		},
	})
	if err == nil || !errors.Is(err, models.ErrInvalidWorkflowAgentOverrides) {
		t.Fatalf("CreateTask error = %v, want invalid workflow override", err)
	}
	if !errors.Is(err, compatibilityErr) {
		t.Fatalf("CreateTask error = %v, want compatibility error in chain", err)
	}
	if len(validator.calls) != 1 || validator.calls[0] != "replacement-profile" {
		t.Fatalf("compatibility validator calls = %v, want one replacement validation", validator.calls)
	}
	tasks, err := repo.ListTasks(ctx, workflowID)
	if err != nil {
		t.Fatalf("ListTasks: %v", err)
	}
	if len(tasks) != 0 {
		t.Fatalf("persisted %d task rows after compatibility rejection, want none", len(tasks))
	}
}

type recordingWorkflowAgentExecutorValidator struct {
	executorIDs []string
}

func (v *recordingWorkflowAgentExecutorValidator) ValidateAgentProfileForExecutor(
	_ context.Context,
	_ *settingsmodels.AgentProfile,
	executor *models.Executor,
	_ *models.ExecutorProfile,
) error {
	v.executorIDs = append(v.executorIDs, executor.ID)
	return nil
}

type childOverrideFixture struct {
	svc       *Service
	validator *recordingWorkflowAgentExecutorValidator
	parentID  string
}

func newChildOverrideFixture(t *testing.T) (childOverrideFixture, func(*CreateTaskRequest) (*models.Task, error)) {
	t.Helper()
	svc, _, repo := createTestService(t)
	ctx := context.Background()
	const workspaceID, workflowID = "workspace-child-override", "workflow-child-override"
	defaultExecutorID := "executor-workspace-default"
	if err := repo.CreateWorkspace(ctx, &models.Workspace{
		ID: workspaceID, Name: "Child override workspace", DefaultExecutorID: &defaultExecutorID,
	}); err != nil {
		t.Fatalf("CreateWorkspace: %v", err)
	}
	for _, id := range []string{defaultExecutorID, "executor-parent"} {
		if err := repo.CreateExecutor(ctx, &models.Executor{
			ID: id, Name: id, Type: models.ExecutorTypeSSH, Status: models.ExecutorStatusActive,
		}); err != nil {
			t.Fatalf("CreateExecutor %s: %v", id, err)
		}
	}
	if err := repo.CreateWorkflow(ctx, &models.Workflow{ID: workflowID, WorkspaceID: workspaceID, Name: "Child override workflow"}); err != nil {
		t.Fatalf("CreateWorkflow: %v", err)
	}
	if err := repo.CreateTask(ctx, &models.Task{
		ID: "parent-task", WorkspaceID: workspaceID, WorkflowID: workflowID, Title: "Claude parent", Priority: "medium",
	}); err != nil {
		t.Fatalf("CreateTask parent: %v", err)
	}
	if err := repo.CreateTaskSession(ctx, &models.TaskSession{
		ID: "parent-session", TaskID: "parent-task", State: models.TaskSessionStateRunning,
		AgentProfileID: "claude-opus", ExecutorID: "executor-parent", IsPrimary: true,
	}); err != nil {
		t.Fatalf("CreateTaskSession: %v", err)
	}
	svc.SetWorkflowStepGetter(&fakeWorkflowStepGetter{steps: map[string]*wfmodels.WorkflowStep{
		"implement": {ID: "implement", WorkflowID: workflowID, AgentProfileID: "claude-opus"},
	}})
	svc.agentProfiles = workflowAgentOverrideProfilesStub{profiles: map[string]*settingsmodels.AgentProfile{
		"codex": {ID: "codex", Enabled: true, WorkspaceID: workspaceID},
	}}
	svc.SetWorkspacePolicyAttacher(noOpWorkspacePolicyAttacher{})
	validator := &recordingWorkflowAgentExecutorValidator{}
	svc.agentProfileExecutorValidator = validator
	create := func(req *CreateTaskRequest) (*models.Task, error) {
		req.WorkspaceID, req.WorkflowID, req.ParentID = workspaceID, workflowID, "parent-task"
		if req.Title == "" {
			req.Title = "Codex child"
		}
		req.WorkflowAgentOverrides = map[string]string{"claude-opus": "codex"}
		result, err := svc.CreateTask(ctx, req)
		if err != nil {
			return nil, err
		}
		return result.Task, nil
	}
	return childOverrideFixture{svc: svc, validator: validator, parentID: "parent-task"}, create
}

func TestCreateChildTaskValidatesWorkflowOverrideAgainstInheritedParentExecutor(t *testing.T) {
	fixture, create := newChildOverrideFixture(t)
	if _, err := create(&CreateTaskRequest{WorkspacePolicy: &WorkspacePolicy{Mode: workspaceModeInheritParent}}); err != nil {
		t.Fatalf("CreateTask child: %v", err)
	}
	if len(fixture.validator.executorIDs) != 1 || fixture.validator.executorIDs[0] != "executor-parent" {
		t.Fatalf("validated executors = %v, want the parent's executor", fixture.validator.executorIDs)
	}
}

func TestCreateChildTaskPersistsWorkflowOverrideWithoutChangingParent(t *testing.T) {
	fixture, create := newChildOverrideFixture(t)
	ctx := context.Background()
	child, err := create(&CreateTaskRequest{
		WorkspacePolicy: &WorkspacePolicy{Mode: workspaceModeInheritParent},
		DeferredLaunch:  map[string]interface{}{"intent": "start", "agent_profile_id": "claude-opus"},
	})
	if err != nil {
		t.Fatalf("CreateTask child: %v", err)
	}
	reloaded, err := fixture.svc.tasks.GetTask(ctx, child.ID)
	if err != nil {
		t.Fatalf("GetTask child: %v", err)
	}
	if got, ok := reloaded.WorkflowAgentOverrides.ReplacementFor(reloaded.WorkflowID, "implement"); !ok || got != "codex" {
		t.Fatalf("reloaded child replacement = %q, %v; want codex", got, ok)
	}
	parent, err := fixture.svc.tasks.GetTask(ctx, fixture.parentID)
	if err != nil {
		t.Fatalf("GetTask parent: %v", err)
	}
	if parent.WorkflowAgentOverrides != nil && len(parent.WorkflowAgentOverrides.Steps) > 0 {
		t.Fatalf("parent overrides = %+v, want none", parent.WorkflowAgentOverrides)
	}
}
