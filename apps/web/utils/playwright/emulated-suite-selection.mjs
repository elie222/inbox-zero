import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expandPlaywrightTargets } from "./emulated-suite-targets.mjs";

export const fullSuites = [
  "attachments",
  "automation",
  "calendars",
  "channels",
  "chat",
  "cleanup/analytics.spec.ts",
  "cleanup/bulk-archive.spec.ts",
  "cleanup/bulk-unsubscribe.spec.ts",
  "integrations",
  "mail",
  "meetings",
  "onboarding",
  "settings",
];

const suiteEntryFiles = new Map([
  ["attachments", ["app/(app)/[emailAccountId]/drive/page.tsx"]],
  ["automation", ["app/(app)/[emailAccountId]/automation/page.tsx"]],
  ["calendars", ["app/(app)/[emailAccountId]/calendars/page.tsx"]],
  ["channels", ["app/(app)/[emailAccountId]/channels/page.tsx"]],
  ["chat", ["app/(app)/[emailAccountId]/assistant/page.tsx"]],
  ["cleanup/analytics.spec.ts", ["app/(app)/[emailAccountId]/stats/page.tsx"]],
  [
    "cleanup/bulk-archive.spec.ts",
    ["app/(app)/[emailAccountId]/bulk-archive/page.tsx"],
  ],
  [
    "cleanup/bulk-unsubscribe.spec.ts",
    ["app/(app)/[emailAccountId]/bulk-unsubscribe/page.tsx"],
  ],
  ["integrations", ["app/(app)/[emailAccountId]/integrations/page.tsx"]],
  [
    "mail",
    [
      "app/(app)/[emailAccountId]/mail/layout.tsx",
      "app/(app)/[emailAccountId]/mail/page.tsx",
      "app/(app)/[emailAccountId]/debug/mail-queue/page.tsx",
      "app/(app)/[emailAccountId]/debug/page.tsx",
      "app/(app)/[emailAccountId]/settings/page.tsx",
    ],
  ],
  ["meetings", ["app/(app)/[emailAccountId]/meetings/page.tsx"]],
  ["onboarding", ["app/(app)/[emailAccountId]/onboarding/page.tsx"]],
  [
    "settings",
    [
      "app/(app)/settings/page.tsx",
      "app/(app)/[emailAccountId]/settings/page.tsx",
    ],
  ],
]);

const sharedAppEntryFiles = [
  "app/layout.tsx",
  "app/(app)/layout.tsx",
  "app/(app)/error.tsx",
  "app/(app)/[emailAccountId]/error.tsx",
];

// Shared feature entry points have focused coverage; their imported foundations
// still use the dependency graph's broad fallback.
const sharedFeatureMappings = [
  {
    files: [
      "components/CommandK.tsx",
      "hooks/useCommandPaletteCommands.ts",
      "store/command-palette.ts",
    ],
    targets: [
      "mail/command-palette.spec.ts",
      "mail/starring.spec.ts",
      "mail/theme.spec.ts",
      "settings/settings-dialog.spec.ts",
    ],
  },
];

const directSuiteMappings = [
  ["app/(redirects)/assistant/", ["chat"]],
  ["app/(redirects)/automation/", ["automation"]],
  ["app/(redirects)/bulk-archive/", ["cleanup/bulk-archive.spec.ts"]],
  ["app/(redirects)/bulk-unsubscribe/", ["cleanup/bulk-unsubscribe.spec.ts"]],
  ["app/(redirects)/quick-bulk-archive/", ["cleanup/bulk-archive.spec.ts"]],
  ["app/(redirects)/stats/", ["cleanup/analytics.spec.ts"]],
  ["app/(redirects)/integrations/", ["integrations"]],
  ["app/(redirects)/calendars/", ["calendars"]],
  ["app/(redirects)/meetings/", ["meetings"]],
  ["app/(redirects)/onboarding/", ["onboarding"]],
  ["app/(redirects)/setup/", ["onboarding"]],
  ["app/(redirects)/mail/", ["mail"]],
  ["app/(redirects)/drive/", ["attachments"]],
  ["app/(redirects)/channels/", ["channels"]],
  ["app/(app)/[emailAccountId]/drive/", ["attachments"]],
  ["app/(app)/[emailAccountId]/automation/", ["automation"]],
  ["app/(app)/[emailAccountId]/assistant/", ["automation"]],
  ["app/(app)/[emailAccountId]/calendars/", ["calendars"]],
  ["app/(app)/[emailAccountId]/channels/", ["channels"]],
  ["app/(app)/[emailAccountId]/compose/", ["mail"]],
  ["app/(app)/[emailAccountId]/stats/", ["cleanup/analytics.spec.ts"]],
  [
    "app/(app)/[emailAccountId]/bulk-archive/",
    ["cleanup/bulk-archive.spec.ts"],
  ],
  [
    "app/(app)/[emailAccountId]/bulk-unsubscribe/",
    ["cleanup/bulk-unsubscribe.spec.ts"],
  ],
  ["app/(app)/[emailAccountId]/integrations/", ["integrations"]],
  ["app/(app)/[emailAccountId]/mail/", ["mail"]],
  ["app/(app)/[emailAccountId]/meetings/", ["meetings"]],
  ["app/(app)/[emailAccountId]/onboarding/", ["onboarding"]],
  ["app/(app)/[emailAccountId]/setup/", ["onboarding"]],
  ["app/(app)/[emailAccountId]/settings/", ["mail", "settings"]],
  ["app/(app)/settings/", ["settings"]],
  ["components/assistant-chat/", ["chat"]],
  ["components/bulk-archive/", ["cleanup/bulk-archive.spec.ts"]],
  ["components/drive/", ["attachments"]],
  ["components/email-list/", ["mail"]],
];

const sourceExtensions = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
];

export function selectChangedPlaywrightTargets(changedFilesInput, appRoot) {
  if (!changedFilesInput?.trim()) {
    return {
      runFullSuite: true,
      reason: "No pull-request change list was provided.",
      targetFiles: [],
    };
  }

  const changedFiles = normalizeChangedFiles(changedFilesInput);
  const highRiskFile = changedFiles.find(isFullSuiteFile);
  if (highRiskFile) {
    return {
      runFullSuite: true,
      reason: `${highRiskFile.repoPath} affects shared Playwright infrastructure.`,
      targetFiles: [],
    };
  }

  const targetFiles = new Set();
  const productFiles = [];

  for (const file of changedFiles) {
    if (isEmulatedSpecFile(file.appPath)) {
      if (existsSync(path.join(appRoot, file.appPath))) {
        targetFiles.add(file.appPath);
      }
      continue;
    }

    if (isEmulatedSupportFile(file.appPath)) {
      for (const boundary of getChangedSupportBoundaries(file.appPath)) {
        targetFiles.add(getPlaywrightTargetPath(boundary));
      }
      continue;
    }

    if (isBrowserSourceFile(file.appPath) && !isNonRuntimeFile(file.appPath)) {
      productFiles.push(file);
    }
  }

  if (productFiles.length) {
    const { dependenciesBySuite, sharedDependencies } =
      getDependenciesBySuite(appRoot);
    const uncoveredFiles = [];
    const focusedSharedFiles = [];

    for (const file of productFiles) {
      const directlyAffectedSuites = getDirectlyAffectedSuites(file.appPath);
      const fileExists = existsSync(path.join(appRoot, file.appPath));
      if (!fileExists && !directlyAffectedSuites.length) {
        return {
          runFullSuite: true,
          reason: `${file.repoPath} was deleted or cannot be analyzed.`,
          targetFiles: [],
        };
      }

      const sharedFeature = sharedFeatureMappings.find(({ files }) =>
        files.includes(file.appPath),
      );
      if (fileExists && sharedFeature) {
        const featureTargets = sharedFeature.targets.map(
          getPlaywrightTargetPath,
        );
        if (
          featureTargets.every((target) =>
            existsSync(path.join(appRoot, target)),
          )
        ) {
          for (const target of featureTargets) targetFiles.add(target);
          focusedSharedFiles.push(file.repoPath);
          continue;
        }
      }

      const affectedSuites = directlyAffectedSuites.length
        ? directlyAffectedSuites
        : fullSuites.filter((suite) =>
            dependenciesBySuite.get(suite).files.has(file.appPath),
          );

      if (!affectedSuites.length) {
        uncoveredFiles.push(file.repoPath);
        continue;
      }

      for (const suite of affectedSuites) {
        const canNarrow =
          fileExists &&
          !sharedDependencies.has(file.appPath) &&
          !suiteEntryFiles.get(suite).includes(file.appPath);
        const features = canNarrow
          ? dependenciesBySuite
              .get(suite)
              .features.filter(({ files }) => files.has(file.appPath))
          : [];
        if (features.length) {
          for (const { target } of features) targetFiles.add(target);
        } else {
          targetFiles.add(getPlaywrightTargetPath(suite));
        }
      }
    }

    const uncoveredReason = uncoveredFiles.length
      ? ` No emulated E2E area covers: ${uncoveredFiles.join(", ")}.`
      : "";
    const sharedFeatureReason = focusedSharedFiles.length
      ? ` Focused shared-feature coverage: ${focusedSharedFiles.join(", ")}.`
      : "";

    return {
      runFullSuite: false,
      reason: targetFiles.size
        ? `Selected E2E features and fallback areas from the pull request's changed files.${sharedFeatureReason}${uncoveredReason}`
        : `The changed files do not affect emulated browser coverage.${uncoveredReason}`,
      targetFiles: [...targetFiles],
    };
  }

  return {
    runFullSuite: false,
    reason: targetFiles.size
      ? "Selected E2E areas from the pull request's changed files."
      : "The changed files do not affect emulated browser coverage.",
    targetFiles: [...targetFiles],
  };
}

function getDirectlyAffectedSuites(appPath) {
  if (appPath === "app/(app)/[emailAccountId]/assistant/page.tsx") {
    return ["chat"];
  }

  return directSuiteMappings.flatMap(([prefix, suites]) =>
    appPath.startsWith(prefix) ? suites : [],
  );
}

function getDependenciesBySuite(appRoot) {
  const importsByFile = new Map();

  return {
    sharedDependencies: collectDependencies(
      sharedAppEntryFiles,
      appRoot,
      importsByFile,
    ),
    dependenciesBySuite: new Map(
      fullSuites.map((suite) => [
        suite,
        {
          files: collectDependencies(
            [...sharedAppEntryFiles, ...suiteEntryFiles.get(suite)],
            appRoot,
            importsByFile,
          ),
          features: getFeatureCoverage(suite, appRoot, importsByFile),
        },
      ]),
    ),
  };
}

function getFeatureCoverage(suite, appRoot, importsByFile) {
  const target = getPlaywrightTargetPath(suite);
  const coveragePath = path.join(appRoot, target, "coverage.json");
  if (!existsSync(coveragePath)) return [];

  let coverage;
  try {
    coverage = JSON.parse(readFileSync(coveragePath, "utf8"));
  } catch {
    return [];
  }
  if (!coverage || typeof coverage !== "object" || Array.isArray(coverage)) {
    return [];
  }
  const specs = expandPlaywrightTargets([target], appRoot);
  // A new spec or renamed component must not silently disappear from PR coverage.
  if (
    Object.keys(coverage).length !== specs.length ||
    specs.some(({ path: spec }) => {
      const entries = coverage[spec.slice(target.length + 1)];
      return (
        !Array.isArray(entries) ||
        !entries.length ||
        entries.some(
          (file) =>
            typeof file !== "string" || !existsSync(path.join(appRoot, file)),
        )
      );
    })
  )
    return [];

  return specs.map(({ path: spec }) => ({
    target: spec,
    files: collectDependencies(
      coverage[spec.slice(target.length + 1)],
      appRoot,
      importsByFile,
    ),
  }));
}

function collectDependencies(entryFiles, appRoot, importsByFile) {
  const dependencies = new Set();
  const pendingFiles = [...entryFiles];

  while (pendingFiles.length) {
    const file = pendingFiles.pop();
    if (dependencies.has(file)) continue;
    dependencies.add(file);

    const imports = getLocalImports(file, appRoot, importsByFile);
    for (const importedFile of imports) {
      if (!dependencies.has(importedFile)) pendingFiles.push(importedFile);
    }
  }

  return dependencies;
}

function getLocalImports(file, appRoot, importsByFile) {
  const cachedImports = importsByFile.get(file);
  if (cachedImports) return cachedImports;

  const absolutePath = path.join(appRoot, file);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    importsByFile.set(file, []);
    return [];
  }

  const source = readFileSync(absolutePath, "utf8");
  const importedFiles = ts.preProcessFile(source, true, true).importedFiles;
  const resolvedImports = importedFiles
    .map(({ fileName }) => resolveLocalImport(fileName, file, appRoot))
    .filter(Boolean);
  importsByFile.set(file, resolvedImports);
  return resolvedImports;
}

function resolveLocalImport(importPath, importer, appRoot) {
  let candidate;
  if (importPath.startsWith("@/")) {
    candidate = importPath.slice(2);
  } else if (importPath.startsWith(".")) {
    candidate = path.join(path.dirname(importer), importPath);
  } else {
    return;
  }

  for (const extension of sourceExtensions) {
    const file = `${candidate}${extension}`;
    const absolutePath = path.join(appRoot, file);
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      return normalizePath(file);
    }
  }

  for (const extension of sourceExtensions.slice(1)) {
    const file = path.join(candidate, `index${extension}`);
    const absolutePath = path.join(appRoot, file);
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      return normalizePath(file);
    }
  }
}

function normalizeChangedFiles(changedFilesInput) {
  return [
    ...new Set(
      changedFilesInput
        .split(/\r?\n/)
        .map((file) => normalizePath(file.trim()))
        .filter(Boolean),
    ),
  ].map((repoPath) => ({
    repoPath,
    appPath: repoPath.replace(/^apps\/web\//, ""),
  }));
}

function isFullSuiteFile({ repoPath, appPath }) {
  if (
    appPath.startsWith("__tests__/playwright/emulated/setup/") ||
    isSharedEmulatedSupportFile(appPath)
  ) {
    return true;
  }

  return (
    repoPath === ".github/workflows/playwright.yml" ||
    repoPath.startsWith(".github/actions/setup-ci-dependencies/") ||
    repoPath === "apps/web/emulate.playwright.config.yaml" ||
    repoPath === "apps/web/playwright.config.mjs" ||
    repoPath === "apps/web/env.ts" ||
    repoPath === "apps/web/instrumentation.ts" ||
    repoPath === "apps/web/package.json" ||
    repoPath === "pnpm-lock.yaml" ||
    repoPath === "scripts/pnpm-install-without-desktop.sh" ||
    repoPath.startsWith("apps/web/next.config.") ||
    repoPath === "apps/web/__tests__/playwright/run-emulated-suite.mjs" ||
    (repoPath.startsWith("apps/web/utils/playwright/") &&
      !isNonRuntimeFile(appPath))
  );
}

function isBrowserSourceFile(appPath) {
  return [
    "app/",
    "components/",
    "hooks/",
    "providers/",
    "store/",
    "styles/",
    "utils/",
    "lib/",
  ].some((prefix) => appPath.startsWith(prefix));
}

function isNonRuntimeFile(appPath) {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(appPath) ||
    /(?:^|\/)README(?:\.[^/]*)?$/.test(appPath)
  );
}

function getChangedSupportBoundaries(file) {
  const boundary = getChangedFileBoundary(file);
  if (boundary.startsWith("cleanup/")) {
    return fullSuites.filter((suite) => suite.startsWith("cleanup/"));
  }
  return [boundary];
}

function getChangedFileBoundary(file) {
  const relativePath = file.replace(/^__tests__\/playwright\/emulated\//, "");
  if (relativePath.startsWith("cleanup/")) return relativePath;
  return relativePath.split("/")[0];
}

function getPlaywrightTargetPath(target) {
  if (target.startsWith("__tests__/playwright/")) return target;
  return `__tests__/playwright/emulated/${target}`;
}

function isEmulatedSpecFile(file) {
  return /^__tests__\/playwright\/emulated\/.*\.spec\.[cm]?[jt]sx?$/.test(file);
}

function isEmulatedSupportFile(file) {
  return (
    file.startsWith("__tests__/playwright/emulated/") &&
    !file.startsWith("__tests__/playwright/emulated/setup/") &&
    !isEmulatedSpecFile(file)
  );
}

function isSharedEmulatedSupportFile(file) {
  if (!isEmulatedSupportFile(file)) return false;
  const relativePath = file.replace(/^__tests__\/playwright\/emulated\//, "");
  return !relativePath.includes("/");
}

function normalizePath(file) {
  return file.replaceAll(path.sep, "/").replace(/^\.\//, "");
}
