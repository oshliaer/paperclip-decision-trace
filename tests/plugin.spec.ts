import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("Decision Trace plugin", () => {
  it("health data handler returns ok status", async () => {
    const harness = createTestHarness({ manifest });
    await plugin.definition.setup(harness.ctx);

    const data = await harness.getData<{ status: string }>("health");
    expect(data.status).toBe("ok");
    expect(typeof (data as { checkedAt: string }).checkedAt).toBe("string");
  });

  it("getIssueTree action returns tree from root", async () => {
    const companyId = "company-1";
    const parentIssue = {
      id: "issue-parent",
      identifier: "TST-1",
      title: "Parent issue",
      status: "in_progress",
      priority: "high",
      assigneeAgentId: "agent-1",
      createdByAgentId: "agent-1",
      parentId: null,
      projectId: "proj-1",
      companyId,
    };
    const childIssue = {
      id: "issue-child",
      identifier: "TST-2",
      title: "Child issue",
      status: "todo",
      priority: "medium",
      assigneeAgentId: null,
      createdByAgentId: null,
      parentId: "issue-parent",
      projectId: "proj-1",
      companyId,
    };
    const agent = { id: "agent-1", name: "Chief Engineer", companyId, status: "active" };

    const harness = createTestHarness({ manifest });
    harness.seed({ issues: [parentIssue, childIssue] as any[], agents: [agent] as any[] });
    await plugin.definition.setup(harness.ctx);

    const result = await harness.performAction<{ tree: { id: string; children: unknown[] }; rootId: string; targetId: string }>(
      "getIssueTree",
      { issueId: "issue-child", companyId },
    );

    expect(result.rootId).toBe("issue-parent");
    expect(result.targetId).toBe("issue-child");
    expect(result.tree.id).toBe("issue-parent");
    expect(result.tree.children).toHaveLength(1);
  });
});
