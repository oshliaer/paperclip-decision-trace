import { useState, useEffect } from "react";
import {
  usePluginAction,
  usePluginData,
  type PluginPageProps,
  type PluginDetailTabProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IssueNodeData {
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

interface TreeResult {
  tree: IssueNodeData | null;
  rootId: string;
  targetId: string;
}

// ---------------------------------------------------------------------------
// Status styling
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, { bg: string; border: string; text: string; label: string }> = {
  todo: { bg: "#e0e7ff", border: "#6366f1", text: "#3730a3", label: "Todo" },
  in_progress: { bg: "#fef3c7", border: "#f59e0b", text: "#92400e", label: "In Progress" },
  done: { bg: "#d1fae5", border: "#10b981", text: "#065f46", label: "Done" },
  blocked: { bg: "#fee2e2", border: "#ef4444", text: "#991b1b", label: "Blocked" },
  cancelled: { bg: "#f3f4f6", border: "#9ca3af", text: "#6b7280", label: "Cancelled" },
  backlog: { bg: "#f1f5f9", border: "#94a3b8", text: "#475569", label: "Backlog" },
  in_review: { bg: "#ede9fe", border: "#8b5cf6", text: "#5b21b6", label: "In Review" },
};

// ---------------------------------------------------------------------------
// SVG tree layout
// ---------------------------------------------------------------------------

const NODE_W = 192;
const NODE_H = 76;
const H_GAP = 20;
const V_GAP = 60;

interface LayoutNode {
  node: IssueNodeData;
  x: number;
  y: number;
  children: LayoutNode[];
}

function computeSubtreeWidth(node: IssueNodeData): number {
  if (node.children.length === 0) return NODE_W + H_GAP;
  return Math.max(
    NODE_W + H_GAP,
    node.children.reduce((sum, c) => sum + computeSubtreeWidth(c), 0),
  );
}

function layoutNode(node: IssueNodeData, x: number, y: number): LayoutNode {
  if (node.children.length === 0) {
    return { node, x, y, children: [] };
  }

  const childWidths = node.children.map((c) => computeSubtreeWidth(c));
  const totalChildWidth = childWidths.reduce((s, w) => s + w, 0);
  let childX = x + NODE_W / 2 - totalChildWidth / 2;

  const childLayouts: LayoutNode[] = [];
  for (let i = 0; i < node.children.length; i++) {
    const w = childWidths[i];
    childLayouts.push(layoutNode(node.children[i], childX + w / 2 - NODE_W / 2, y + NODE_H + V_GAP));
    childX += w;
  }

  return { node, x, y, children: childLayouts };
}

function collectNodes(layout: LayoutNode, result: LayoutNode[] = []): LayoutNode[] {
  result.push(layout);
  for (const child of layout.children) collectNodes(child, result);
  return result;
}

function collectEdges(
  layout: LayoutNode,
  result: Array<{ x1: number; y1: number; x2: number; y2: number }> = [],
) {
  for (const child of layout.children) {
    result.push({
      x1: layout.x + NODE_W / 2,
      y1: layout.y + NODE_H,
      x2: child.x + NODE_W / 2,
      y2: child.y,
    });
    collectEdges(child, result);
  }
  return result;
}

function getBounds(nodes: LayoutNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (nodes.length === 0) return { minX: 0, minY: 0, maxX: 400, maxY: 200 };
  return {
    minX: Math.min(...nodes.map((n) => n.x)),
    minY: Math.min(...nodes.map((n) => n.y)),
    maxX: Math.max(...nodes.map((n) => n.x + NODE_W)),
    maxY: Math.max(...nodes.map((n) => n.y + NODE_H)),
  };
}

// ---------------------------------------------------------------------------
// IssueCard (SVG node)
// ---------------------------------------------------------------------------

function IssueCard({ layout, targetId }: { layout: LayoutNode; targetId: string }) {
  const { node } = layout;
  const s = STATUS_STYLES[node.status] ?? STATUS_STYLES.todo;
  const isTarget = node.id === targetId;
  const titleClipped = node.title.length > 24 ? node.title.slice(0, 24) + "…" : node.title;
  const agentName = node.assigneeAgentName ?? null;
  const agentClipped = agentName
    ? agentName.length > 24
      ? agentName.slice(0, 24) + "…"
      : agentName
    : null;

  return (
    <g transform={`translate(${layout.x}, ${layout.y})`}>
      {/* Shadow */}
      <rect x={2} y={2} width={NODE_W} height={NODE_H} rx={8} fill="#0000001a" />
      {/* Background */}
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        fill={s.bg}
        stroke={s.border}
        strokeWidth={isTarget ? 3 : 1.5}
      />
      {/* Status badge */}
      <rect x={8} y={8} width={NODE_W - 16} height={18} rx={4} fill={s.border} />
      <text x={NODE_W / 2} y={21} textAnchor="middle" fill="white" fontSize={10} fontWeight={700}>
        {s.label.toUpperCase()}
      </text>
      {/* Identifier */}
      <text x={8} y={42} fill={s.text} fontSize={11} fontWeight={700}>
        {node.identifier}
      </text>
      {/* Title */}
      <text x={8} y={57} fill="#374151" fontSize={11}>
        {titleClipped}
      </text>
      {/* Assignee */}
      {agentClipped && (
        <text x={8} y={70} fill="#6b7280" fontSize={10}>
          ↳ {agentClipped}
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Tree SVG
// ---------------------------------------------------------------------------

function IssueTreeSVG({ tree, targetId }: { tree: IssueNodeData; targetId: string }) {
  const rootLayout = layoutNode(tree, 0, 0);
  const allNodes = collectNodes(rootLayout);
  const edges = collectEdges(rootLayout);
  const bounds = getBounds(allNodes);

  const PAD = 32;
  const svgWidth = bounds.maxX - bounds.minX + PAD * 2;
  const svgHeight = bounds.maxY - bounds.minY + PAD * 2;
  const offsetX = -bounds.minX + PAD;
  const offsetY = -bounds.minY + PAD;

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      style={{ display: "block" }}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
    >
      <g transform={`translate(${offsetX}, ${offsetY})`}>
        {/* Edges */}
        {edges.map((e, i) => (
          <path
            key={i}
            d={`M ${e.x1} ${e.y1} C ${e.x1} ${(e.y1 + e.y2) / 2}, ${e.x2} ${(e.y1 + e.y2) / 2}, ${e.x2} ${e.y2}`}
            fill="none"
            stroke="#d1d5db"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
        ))}
        {/* Nodes */}
        {allNodes.map((layout) => (
          <IssueCard key={layout.node.id} layout={layout} targetId={targetId} />
        ))}
      </g>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

function Legend() {
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
      {Object.entries(STATUS_STYLES).map(([, s]) => (
        <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 3,
              background: s.bg,
              border: `2px solid ${s.border}`,
            }}
          />
          <span style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared tree view (fetches + renders)
// ---------------------------------------------------------------------------

function IssueTreeView({ issueId, companyId }: { issueId: string; companyId: string }) {
  const [result, setResult] = useState<TreeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getTree = usePluginAction("getIssueTree");

  useEffect(() => {
    if (!issueId || !companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResult(null);

    getTree({ issueId, companyId })
      .then((r) => {
        if (!cancelled) {
          setResult(r as TreeResult);
          setLoading(false);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [issueId, companyId]);

  if (loading) {
    return (
      <div style={centerStyle}>
        <div style={{ color: "#6b7280", fontSize: 14 }}>Loading decision tree…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={centerStyle}>
        <div style={{ color: "#ef4444", fontSize: 14 }}>Error: {error}</div>
      </div>
    );
  }

  if (!result?.tree) {
    return (
      <div style={centerStyle}>
        <div style={{ color: "#9ca3af", fontSize: 14 }}>No tree data available</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <Legend />
      <div
        style={{
          overflow: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 16,
          background: "#fafafa",
        }}
      >
        <IssueTreeSVG tree={result.tree} targetId={result.targetId} />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: "#9ca3af" }}>
        Showing decision tree rooted at {result.rootId === result.targetId ? "this issue" : "the top-level parent"}.
        Bold border = current issue.
      </div>
    </div>
  );
}

const centerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 160,
};

// ---------------------------------------------------------------------------
// Page slot
// ---------------------------------------------------------------------------

export function DecisionTracePage({ context }: PluginPageProps) {
  const [inputValue, setInputValue] = useState("");
  const [activeIssueId, setActiveIssueId] = useState<string | null>(null);
  const companyId = context.companyId ?? "";

  function handleVisualize() {
    const v = inputValue.trim();
    if (v) setActiveIssueId(v);
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 6px", color: "#111827" }}>
        Decision Trace
      </h1>
      <p style={{ color: "#6b7280", margin: "0 0 20px", fontSize: 14 }}>
        Visualize issue decision chains — parent/child hierarchy, delegation, and status flow.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24, maxWidth: 560 }}>
        <input
          type="text"
          placeholder="Paste issue UUID…"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleVisualize()}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #d1d5db",
            borderRadius: 6,
            fontSize: 14,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={handleVisualize}
          disabled={!inputValue.trim()}
          style={{
            padding: "8px 18px",
            background: inputValue.trim() ? "#6366f1" : "#e5e7eb",
            color: inputValue.trim() ? "#fff" : "#9ca3af",
            border: "none",
            borderRadius: 6,
            cursor: inputValue.trim() ? "pointer" : "default",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: "inherit",
          }}
        >
          Visualize
        </button>
      </div>

      {activeIssueId && companyId ? (
        <IssueTreeView issueId={activeIssueId} companyId={companyId} />
      ) : (
        <div
          style={{
            border: "2px dashed #e5e7eb",
            borderRadius: 12,
            padding: 48,
            textAlign: "center",
            color: "#9ca3af",
            fontSize: 14,
          }}
        >
          Enter an issue UUID above to visualize its decision tree
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail tab slot (auto-loads from issue context)
// ---------------------------------------------------------------------------

export function IssueDecisionTab({ context }: PluginDetailTabProps) {
  const { entityId, companyId } = context;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <IssueTreeView issueId={entityId} companyId={companyId ?? ""} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard widget
// ---------------------------------------------------------------------------

export function DashboardWidget(_props: PluginWidgetProps) {
  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Decision Trace</div>
      <div style={{ fontSize: 12, color: "#6b7280" }}>
        Navigate to{" "}
        <span style={{ fontFamily: "monospace", background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>
          /decision-trace
        </span>{" "}
        to visualize issue decision chains, or open the Decision Trace tab on any issue.
      </div>
    </div>
  );
}
