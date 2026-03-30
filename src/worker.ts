import { definePlugin, startWorkerRpcHost } from "@paperclipai/plugin-sdk";
import type { Issue, Agent } from "@paperclipai/plugin-sdk/types";

export interface IssueNodeData {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assigneeAgentId: string | null;
  assigneeAgentName: string | null;
  createdByAgentId: string | null;
  createdByAgentName: string | null;
  parentId: string | null;
  children: IssueNodeData[];
}

function buildTree(
  issueMap: Map<string, Issue>,
  childrenMap: Map<string, Issue[]>,
  rootId: string,
  agentMap: Map<string, string>,
  depth = 0,
  maxDepth = 4,
): IssueNodeData | null {
  const issue = issueMap.get(rootId);
  if (!issue) return null;

  const children: IssueNodeData[] = [];
  if (depth < maxDepth) {
    const directChildren = childrenMap.get(rootId) ?? [];
    for (const child of directChildren) {
      const childNode = buildTree(issueMap, childrenMap, child.id, agentMap, depth + 1, maxDepth);
      if (childNode) children.push(childNode);
    }
  }

  return {
    id: issue.id,
    identifier: issue.identifier ?? issue.id.slice(0, 8),
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assigneeAgentId: issue.assigneeAgentId,
    assigneeAgentName: issue.assigneeAgentId ? (agentMap.get(issue.assigneeAgentId) ?? null) : null,
    createdByAgentId: issue.createdByAgentId,
    createdByAgentName: issue.createdByAgentId ? (agentMap.get(issue.createdByAgentId) ?? null) : null,
    parentId: issue.parentId,
    children,
  };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.actions.register("getIssueTree", async (params) => {
      const { issueId, companyId } = params as { issueId: string; companyId: string };

      // Get the target issue
      const issue = await ctx.issues.get(issueId, companyId);
      if (!issue) throw new Error(`Issue ${issueId} not found`);

      // Walk up to find the true root of the hierarchy
      let rootIssue = issue;
      const visited = new Set<string>([issue.id]);
      while (rootIssue.parentId && !visited.has(rootIssue.parentId)) {
        visited.add(rootIssue.parentId);
        const parent = await ctx.issues.get(rootIssue.parentId, companyId);
        if (!parent) break;
        rootIssue = parent;
      }

      // Fetch all issues in the same project to build the full tree
      const allIssues = await ctx.issues.list({
        companyId,
        projectId: issue.projectId ?? undefined,
        limit: 200,
      });

      // Build lookup maps
      const issueMap = new Map<string, Issue>(allIssues.map((i) => [i.id, i]));
      if (!issueMap.has(rootIssue.id)) issueMap.set(rootIssue.id, rootIssue);

      const childrenMap = new Map<string, Issue[]>();
      for (const i of issueMap.values()) {
        if (i.parentId) {
          const siblings = childrenMap.get(i.parentId) ?? [];
          siblings.push(i);
          childrenMap.set(i.parentId, siblings);
        }
      }

      // Build agent name map
      const agents: Agent[] = await ctx.agents.list({ companyId, limit: 100 });
      const agentMap = new Map<string, string>(agents.map((a) => [a.id, a.name]));

      // Build tree from root
      const tree = buildTree(issueMap, childrenMap, rootIssue.id, agentMap);

      return { tree, rootId: rootIssue.id, targetId: issueId };
    });

    ctx.data.register("health", async () => ({
      status: "ok",
      checkedAt: new Date().toISOString(),
    }));
  },

  async onHealth() {
    return { status: "ok", message: "Decision Trace worker is running" };
  },
});

export default plugin;
startWorkerRpcHost({ plugin });
