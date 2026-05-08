#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const allowedRedirectHelper = path.join(root, "utils", "redirect.ts");
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
const restrictedRedirectPatterns = [
  {
    pattern: /\bwindow\s*\.\s*location\s*\.\s*href\s*=/g,
    message: "Use redirectToSafeUrl instead of assigning window.location.href.",
  },
  {
    pattern: /\bwindow\s*\.\s*location\s*\.\s*(assign|replace)\s*\(/g,
    message:
      "Use redirectToSafeUrl instead of calling window.location redirects directly.",
  },
  {
    pattern: /(?<![\w$.])location\s*\.\s*href\s*=/g,
    message: "Use redirectToSafeUrl instead of assigning location.href.",
  },
  {
    pattern: /(?<![\w$.])location\s*\.\s*(assign|replace)\s*\(/g,
    message:
      "Use redirectToSafeUrl instead of calling location redirects directly.",
  },
];

const violations = [];

for (const file of collectSourceFiles(root)) {
  if (file === allowedRedirectHelper) continue;

  const content = fs.readFileSync(file, "utf8");
  for (const { pattern, message } of restrictedRedirectPatterns) {
    pattern.lastIndex = 0;

    for (const match of content.matchAll(pattern)) {
      violations.push({
        file,
        line: getLineNumber(content, match.index),
        match: match[0],
        message,
      });
    }
  }
}

if (violations.length === 0) {
  console.log("Client redirects use the safe redirect helper.");
  process.exit(0);
}

console.error(
  `Found ${violations.length} direct client redirect ${
    violations.length === 1 ? "sink" : "sinks"
  }:\n`,
);

for (const violation of violations) {
  console.error(`${path.relative(root, violation.file)}:${violation.line}`);
  console.error(`  ${violation.match}`);
  console.error(`  ${violation.message}\n`);
}

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

function getLineNumber(content, index) {
  return content.slice(0, index).split("\n").length;
}
