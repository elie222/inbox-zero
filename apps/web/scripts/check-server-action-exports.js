#!/usr/bin/env node

/**
 * Server Action Export Checker
 *
 * A top-level "use server" directive turns every runtime export in that file
 * into a publicly callable Server Action. Keep helper functions in separate
 * server-only modules and export only intentionally callable actions here.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
]);

const violations = [];

for (const file of collectSourceFiles(root)) {
  const content = fs.readFileSync(file, "utf8");
  if (!hasTopLevelUseServer(content)) continue;

  const runtimeExports = findRuntimeExports(content);
  for (const runtimeExport of runtimeExports) {
    if (runtimeExport.kind === "re-export") {
      violations.push({
        file,
        line: runtimeExport.line,
        name: runtimeExport.name,
        reason:
          'Do not use re-exports from a top-level "use server" file; export explicit action names instead.',
      });
      continue;
    }

    if (!runtimeExport.approvedAction) {
      violations.push({
        file,
        line: runtimeExport.line,
        name: runtimeExport.name,
        reason:
          'Runtime exports from top-level "use server" files must be next-safe-action wrappers or explicitly allowed with a server-action-export: allow comment.',
      });
    }
  }
}

if (violations.length === 0) {
  console.log("Server action exports look safe.");
  process.exit(0);
}

console.error(
  `Found ${violations.length} unsafe server action export${
    violations.length === 1 ? "" : "s"
  }:\n`,
);

for (const violation of violations) {
  console.error(
    `${path.relative(root, violation.file)}:${violation.line} ${violation.name}`,
  );
  console.error(`  ${violation.reason}\n`);
}

console.error(
  'Move helpers to a separate server-only module without top-level "use server". For direct exported Server Actions, add a server-action-export: allow comment.',
);
process.exit(1);

function* collectSourceFiles(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignoredDirectories.has(entry.name)) continue;

    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      yield* collectSourceFiles(fullPath);
      continue;
    }

    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      yield fullPath;
    }
  }
}

function hasTopLevelUseServer(content) {
  const source = stripLeadingTrivia(content);
  return /^["']use server["']\s*;?/.test(source);
}

function stripLeadingTrivia(content) {
  let source = content.replace(/^\uFEFF/, "");

  while (true) {
    const trimmed = source.replace(/^\s+/, "");

    if (trimmed.startsWith("//")) {
      const newlineIndex = trimmed.indexOf("\n");
      source = newlineIndex === -1 ? "" : trimmed.slice(newlineIndex + 1);
      continue;
    }

    if (trimmed.startsWith("/*")) {
      const closeIndex = trimmed.indexOf("*/");
      source = closeIndex === -1 ? "" : trimmed.slice(closeIndex + 2);
      continue;
    }

    return trimmed;
  }
}

function findRuntimeExports(content) {
  const exports = [];
  const declarationRegex =
    /^export\s+(?:async\s+)?(function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm;

  for (const match of content.matchAll(declarationRegex)) {
    const declarationKind = match[1];
    const declarationEnd = findDeclarationEnd(content, match.index);
    const declaration = content.slice(match.index, declarationEnd);
    const line = getLineNumber(content, match.index);

    exports.push({
      kind: "declaration",
      name: match[2],
      line,
      approvedAction:
        (declarationKind === "const" && /\.action\s*\(/.test(declaration)) ||
        hasAllowComment(content, line),
    });
  }

  const defaultExportRegex = /^export\s+default\b/gm;
  for (const match of content.matchAll(defaultExportRegex)) {
    exports.push({
      kind: "declaration",
      name: "default",
      line: getLineNumber(content, match.index),
    });
  }

  const reExportAllRegex = /^export\s+\*/gm;
  for (const match of content.matchAll(reExportAllRegex)) {
    exports.push({
      kind: "re-export",
      name: "export *",
      line: getLineNumber(content, match.index),
    });
  }

  const namedExportRegex =
    /^export\s+(type\s+)?\{([^}]+)\}(?:\s+from\s+["'][^"']+["'])?/gm;
  for (const match of content.matchAll(namedExportRegex)) {
    if (match[1]) continue;
    const isFromExport = /\}\s+from\s+["']/.test(match[0]);
    for (const rawSpecifier of match[2].split(",")) {
      const specifier = rawSpecifier.trim();
      if (!specifier || specifier.startsWith("type ")) continue;

      const name = specifier
        .split(/\s+as\s+/)
        .pop()
        .trim();
      exports.push({
        kind: isFromExport ? "re-export" : "declaration",
        name,
        line: getLineNumber(content, match.index),
        approvedAction: false,
      });
    }
  }

  return exports;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}

function hasAllowComment(content, line) {
  const lines = content.split("\n");
  const nearbyLines = lines.slice(Math.max(0, line - 3), line);
  return nearbyLines.some((nearbyLine) =>
    nearbyLine.includes("server-action-export: allow"),
  );
}

function findDeclarationEnd(content, startIndex) {
  const nextExportIndex = content.indexOf("\nexport ", startIndex + 1);
  return nextExportIndex === -1 ? content.length : nextExportIndex;
}
