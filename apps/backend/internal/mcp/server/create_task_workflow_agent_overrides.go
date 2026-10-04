package mcp

import (
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
)

const (
	workflowAgentOverridesArg    = "workflow_agent_overrides"
	overrideSourceProfileIDKey   = "source_profile_id"
	overrideReplacementProfileID = "replacement_profile_id"
)

const workflowAgentOverridesDesc = "Optional replacements for fixed agent profiles in the created task's workflow. " +
	"Each entry replaces source_profile_id (a profile pinned on one or more workflow steps) with " +
	"replacement_profile_id for this task only; the parent task and the shared workflow keep their own profiles. " +
	"agent_profile_id chooses the initial agent only where workflow routing permits it, so fixed steps need this input " +
	"to run another agent, for example a Codex profile under a Claude parent. Each source may appear once. " +
	"Unknown sources and unavailable or executor-incompatible replacements are rejected before the task is created. " +
	"Omit to keep the workflow's fixed profiles; the parent's replacements are not inherited."

func workflowAgentOverridesToolOption() mcp.ToolOption {
	return mcp.WithArray(workflowAgentOverridesArg,
		mcp.Description(workflowAgentOverridesDesc),
		mcp.Items(map[string]any{
			typeKey: objType,
			propsKey: map[string]any{
				overrideSourceProfileIDKey: map[string]any{
					typeKey:        stringType,
					descriptionArg: "Fixed agent profile ID used by the workflow's steps.",
				},
				overrideReplacementProfileID: map[string]any{
					typeKey:        stringType,
					descriptionArg: "Agent profile ID that runs those steps for this task.",
				},
			},
			reqKey: []string{overrideSourceProfileIDKey, overrideReplacementProfileID},
		}),
	)
}

// workflowAgentOverridesFromArgs converts the tool's entry array into the
// source-to-replacement map accepted by task creation. A nil map means the
// caller supplied no replacements.
func workflowAgentOverridesFromArgs(args map[string]any) (map[string]string, error) {
	raw, ok := args[workflowAgentOverridesArg]
	if !ok || raw == nil {
		return nil, nil
	}
	entries, ok := raw.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be an array of {%s, %s} objects",
			workflowAgentOverridesArg, overrideSourceProfileIDKey, overrideReplacementProfileID)
	}
	if len(entries) == 0 {
		return nil, nil
	}
	overrides := make(map[string]string, len(entries))
	for i, entry := range entries {
		source, replacement, err := workflowAgentOverrideEntry(i, entry)
		if err != nil {
			return nil, err
		}
		if _, duplicate := overrides[source]; duplicate {
			return nil, fmt.Errorf("%s[%d]: %s %q appears more than once",
				workflowAgentOverridesArg, i, overrideSourceProfileIDKey, source)
		}
		overrides[source] = replacement
	}
	return overrides, nil
}

func workflowAgentOverrideEntry(index int, entry any) (string, string, error) {
	fields, ok := entry.(map[string]any)
	if !ok {
		return "", "", fmt.Errorf("%s[%d] must be an object", workflowAgentOverridesArg, index)
	}
	source, err := workflowAgentOverrideField(index, fields, overrideSourceProfileIDKey)
	if err != nil {
		return "", "", err
	}
	replacement, err := workflowAgentOverrideField(index, fields, overrideReplacementProfileID)
	if err != nil {
		return "", "", err
	}
	return source, replacement, nil
}

func workflowAgentOverrideField(index int, fields map[string]any, key string) (string, error) {
	value, _ := fields[key].(string)
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s[%d].%s must be a non-empty string", workflowAgentOverridesArg, index, key)
	}
	return value, nil
}
