import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

const manifest: PaperclipPluginManifestV1 = {
  id: "oshliaer.paperclip-decision-trace",
  apiVersion: 1,
  version: "0.1.0",
  displayName: "Decision Trace",
  description: "Visualizes issue decision chains: parent/child tree, delegation arrows, and status timeline.",
  author: "oshliaer",
  categories: ["ui"],
  capabilities: [
    "issues.read",
    "agents.read",
    "events.subscribe",
    "plugin.state.read",
    "plugin.state.write",
    "ui.page.register",
    "ui.detailTab.register",
    "ui.dashboardWidget.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  ui: {
    slots: [
      {
        type: "page",
        id: "decision-trace-page",
        displayName: "Decision Trace",
        exportName: "DecisionTracePage",
        routePath: "decision-trace",
      },
      {
        type: "detailTab",
        id: "issue-decision-trace-tab",
        displayName: "Decision Trace",
        exportName: "IssueDecisionTab",
        entityTypes: ["issue"],
      },
      {
        type: "dashboardWidget",
        id: "decision-trace-widget",
        displayName: "Decision Trace",
        exportName: "DashboardWidget",
      },
    ],
  },
};

export default manifest;
