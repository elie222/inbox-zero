import path from "node:path";
import { pathToFileURL } from "node:url";
import { expandPlaywrightTargets } from "../utils/playwright/emulated-suite-targets.mjs";

const { fullSuites, selectChangedPlaywrightTargets } = await import(
  process.argv[2]
    ? pathToFileURL(path.resolve(process.argv[2])).href
    : "../utils/playwright/emulated-suite-selection.mjs"
);
const appRoot = path.resolve(import.meta.dirname, "..");
const mail = "apps/web/app/(app)/[emailAccountId]/mail/";
const scenarios = {
  "Split tabs": [`${mail}SplitTabs.tsx`],
  "Nested split picker": [`${mail}NewSplitDialog.tsx`],
  "Sender profile": [`${mail}SenderContextPanel.tsx`],
  "Sender profile hook": [`${mail}use-public-contact-context.ts`],
  "Label picker": [`${mail}LabelPickerDialog.tsx`],
  Sidebar: [`${mail}MailSidebar.tsx`],
  "Split tabs and sender profile": [
    `${mail}SplitTabs.tsx`,
    `${mail}SenderContextPanel.tsx`,
  ],
  "Mail shell": [`${mail}MailShell.tsx`],
  "Shared button": ["apps/web/components/ui/button.tsx"],
  Lockfile: ["pnpm-lock.yaml"],
};

const results = Object.entries(scenarios).map(([scenario, changedFiles]) => {
  const selection = selectChangedPlaywrightTargets(
    changedFiles.join("\n"),
    appRoot,
  );
  const targets = selection.runFullSuite
    ? fullSuites.map((suite) => `__tests__/playwright/emulated/${suite}`)
    : selection.targetFiles;
  const specs = expandPlaywrightTargets(targets, appRoot).map(
    ({ path }) => path,
  );
  return { scenario, changedFiles, specCount: specs.length, specs };
});
console.log(JSON.stringify(results, null, 2));
