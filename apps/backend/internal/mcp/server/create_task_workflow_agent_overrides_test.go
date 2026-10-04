package mcp

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.3
func TestCreateTaskWorkflowAgentOverridesSchema(t *testing.T) {
	for _, mode := range []string{ModeTask, ModeExternal} {
		t.Run(mode, func(t *testing.T) {
			s := New(&testBackend{}, "", "", 10005, newTestLogger(t), "", false, mode)
			tool, ok := s.mcpServer.ListTools()["create_task_kandev"]
			require.True(t, ok)
			raw, err := json.Marshal(tool.Tool.InputSchema)
			require.NoError(t, err)
			var schema struct {
				Properties map[string]map[string]any
				Required   []string
			}
			require.NoError(t, json.Unmarshal(raw, &schema))
			property := schema.Properties[workflowAgentOverridesArg]
			require.NotNil(t, property)
			assert.Equal(t, "array", property["type"])
			assert.NotContains(t, schema.Required, workflowAgentOverridesArg)
			items, ok := property["items"].(map[string]any)
			require.True(t, ok)
			assert.Equal(t, "object", items["type"])
			assert.ElementsMatch(t, []any{"source_profile_id", "replacement_profile_id"}, items["required"])
			description, _ := property["description"].(string)
			assert.Contains(t, description, "agent_profile_id")
			assert.Contains(t, description, "fixed")
		})
	}
}

// @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.3
func TestCreateTaskForwardsWorkflowAgentOverrides(t *testing.T) {
	backend := &testBackend{response: map[string]any{"id": "child"}}
	s := newTaskModeServer(t, backend, "task-current")

	result := callTool(t, s, "create_task_kandev", map[string]any{
		"title": "Codex child", "parent_id": "self", "start_agent": false,
		workflowAgentOverridesArg: []any{
			map[string]any{"source_profile_id": "claude-opus", "replacement_profile_id": " codex "},
			map[string]any{"source_profile_id": "claude-sonnet", "replacement_profile_id": "codex"},
		},
	})

	require.False(t, result.IsError, resultText(t, result))
	payload, ok := backend.lastPayload.(map[string]any)
	require.True(t, ok)
	assert.Equal(t, map[string]string{"claude-opus": "codex", "claude-sonnet": "codex"}, payload[workflowAgentOverridesArg])
}

// @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.3
func TestCreateTaskOmittedWorkflowAgentOverridesKeepPayload(t *testing.T) {
	for name, value := range map[string]any{"omitted": nil, "empty": []any{}} {
		t.Run(name, func(t *testing.T) {
			backend := &testBackend{response: map[string]any{"id": "child"}}
			s := newTaskModeServer(t, backend, "task-current")
			args := map[string]any{"title": "Child", "parent_id": "self", "start_agent": false}
			if value != nil {
				args[workflowAgentOverridesArg] = value
			}

			result := callTool(t, s, "create_task_kandev", args)

			require.False(t, result.IsError, resultText(t, result))
			payload, ok := backend.lastPayload.(map[string]any)
			require.True(t, ok)
			assert.NotContains(t, payload, workflowAgentOverridesArg)
		})
	}
}

// @covers AC-TASKS-SUBTASK-AGENT-SELECTION-001.3
func TestCreateTaskRejectsInvalidWorkflowAgentOverrides(t *testing.T) {
	for name, value := range map[string]any{
		"not an array":        "claude-opus=codex",
		"entry not an object": []any{"claude-opus"},
		"missing source":      []any{map[string]any{"replacement_profile_id": "codex"}},
		"blank replacement":   []any{map[string]any{"source_profile_id": "claude-opus", "replacement_profile_id": "  "}},
		"non-string id":       []any{map[string]any{"source_profile_id": 7, "replacement_profile_id": "codex"}},
		"duplicate source": []any{
			map[string]any{"source_profile_id": "claude-opus", "replacement_profile_id": "codex"},
			map[string]any{"source_profile_id": " claude-opus", "replacement_profile_id": "gemini"},
		},
	} {
		t.Run(name, func(t *testing.T) {
			backend := &testBackend{response: map[string]any{"id": "child"}}
			s := newTaskModeServer(t, backend, "task-current")

			result := callTool(t, s, "create_task_kandev", map[string]any{
				"title": "Child", "parent_id": "self", "start_agent": false,
				workflowAgentOverridesArg: value,
			})

			require.True(t, result.IsError)
			assert.Contains(t, resultText(t, result), workflowAgentOverridesArg)
			assert.Nil(t, backend.lastPayload, "invalid input must not reach task creation")
		})
	}
}
