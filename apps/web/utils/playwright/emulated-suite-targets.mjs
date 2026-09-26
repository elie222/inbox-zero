import { readdirSync, statSync } from "node:fs";
import path from "node:path";

// Keep related behavior together. Mail groups are sized to roughly equal CI
// time because the slowest batch sets the wall-clock time for every PR.
const featureGroups = [
  {
    name: "onboarding",
    specs: [
      "onboarding/control-onboarding.spec.ts",
      "attachments/attachment-onboarding.spec.ts",
    ],
  },
  {
    name: "connected-apps",
    specs: [
      "calendars/calendar-core-flows.spec.ts",
      "channels/channel-routing.spec.ts",
      "integrations/integration-configuration.spec.ts",
      "meetings/meeting-bot-core-flow.spec.ts",
    ],
  },
  {
    name: "automation-rules",
    specs: [
      "automation/manual-rule-management.spec.ts",
      "automation/settings-controls.spec.ts",
      "automation/settings-drafting-knowledge.spec.ts",
      "automation/integration-action.spec.ts",
    ],
  },
  {
    name: "automation-processing",
    specs: [
      "automation/bulk-processing.spec.ts",
      "automation/history-tab.spec.ts",
      "automation/test-tab.spec.ts",
    ],
  },
  {
    name: "mail-desktop",
    specs: [
      "mail/hosted-electron-archive.spec.ts",
      "mail/hosted-electron-send.spec.ts",
      "mail/mail-engine-inspect.spec.ts",
      "mail/mail-queue.spec.ts",
    ],
  },
  {
    name: "mail-send",
    specs: [
      "mail/compose-and-reply.spec.ts",
      "mail/contact-autocomplete.spec.ts",
      "mail/calendar-invitation.spec.ts",
    ],
  },
  {
    name: "mail-composer",
    specs: [
      "mail/composer-editing.spec.ts",
      "mail/draft-send-recovery.spec.ts",
      "mail/draft-deletion.spec.ts",
      "mail/attachment-previews.spec.ts",
    ],
  },
  {
    name: "mail-drafts",
    specs: [
      "mail/scheduled-replies.spec.ts",
      "mail/compose-drafts.spec.ts",
      "mail/server-drafts.spec.ts",
      "mail/message-actions.spec.ts",
    ],
  },
  {
    name: "mail-navigation",
    specs: [
      "mail/command-palette.spec.ts",
      "mail/navigation-and-views.spec.ts",
    ],
  },
  {
    name: "mail-search",
    specs: [
      "mail/search.spec.ts",
      "mail/split-tabs.spec.ts",
      "mail/plain-text-links.spec.ts",
    ],
  },
  {
    name: "mail-reader",
    specs: [
      "mail/reader-visuals.spec.ts",
      "mail/thread-states.spec.ts",
      "mail/reader-transition.spec.ts",
    ],
  },
  {
    name: "mail-triage",
    specs: [
      "mail/archive-reconciliation.spec.ts",
      "mail/triage-actions.spec.ts",
      "mail/assistant-catch-up.spec.ts",
      "mail/starring.spec.ts",
    ],
  },
  {
    name: "mail-threads",
    specs: [
      "mail/thread-navigation.spec.ts",
      "mail/manual-label.spec.ts",
      "mail/message-overflow.spec.ts",
      "mail/offline-loading.spec.ts",
    ],
  },
  {
    name: "mail-preferences",
    specs: [
      "mail/account-selection.spec.ts",
      "mail/cached-settings.spec.ts",
      "mail/layout.spec.ts",
      "mail/theme.spec.ts",
    ],
  },
  {
    name: "account-features",
    specs: [
      "billing/upgrade-to-paid.spec.ts",
      "integrations/custom-mcp-server.spec.ts",
      "chat/first-visit.spec.ts",
      "chat/history-management.spec.ts",
    ],
  },
];

export function expandPlaywrightTargets(paths, appRoot) {
  const files = new Set();
  for (const targetPath of paths) {
    for (const file of getSpecFiles(targetPath, appRoot)) files.add(file);
  }
  return [...files].sort().map((file) => ({
    name: getPlaywrightTargetName(file),
    path: file,
  }));
}

export function batchPlaywrightTargets(targets) {
  const batches = new Map();
  for (const target of targets) {
    const specPath = target.path.replace(
      /^__tests__\/playwright\/emulated\//,
      "",
    );
    const group = featureGroups.find(({ specs }) => specs.includes(specPath));
    // New specs remain covered before an explicit feature group is assigned.
    const name = group?.name ?? specPath.split("/")[0];
    if (!batches.has(name)) batches.set(name, { name, paths: [] });
    batches.get(name).paths.push(target.path);
  }
  return [...batches.values()].map((batch) => ({
    ...batch,
    timeoutMinutes: 4 + batch.paths.length * 8,
  }));
}

/**
 * Result directories are named after the spec path with `/` encoded as `_s`.
 * Existing underscores double up first so the encoding stays reversible.
 */
export function getPlaywrightTargetName(specPath) {
  return specPath
    .replace(/^__tests__\/playwright\/emulated\//, "")
    .replaceAll("_", "__")
    .replaceAll("/", "_s");
}

export function getPlaywrightSpecPathFromTargetName(targetName) {
  let specPath = "";
  for (let index = 0; index < targetName.length; index += 1) {
    if (targetName[index] !== "_") {
      specPath += targetName[index];
      continue;
    }
    const next = targetName[index + 1];
    if (next === "_") {
      specPath += "_";
      index += 1;
    } else if (next === "s") {
      specPath += "/";
      index += 1;
    } else {
      specPath += "_";
    }
  }
  return specPath;
}

function getSpecFiles(targetPath, appRoot) {
  const absolutePath = path.resolve(appRoot, targetPath);
  if (statSync(absolutePath).isFile()) {
    return targetPath.endsWith(".spec.ts") ? [targetPath] : [];
  }
  return readdirSync(absolutePath, { withFileTypes: true }).flatMap((entry) =>
    getSpecFiles(`${targetPath}/${entry.name}`, appRoot),
  );
}
