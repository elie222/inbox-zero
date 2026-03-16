import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const entriesDir = join(__dirname, "..", "changelog-entries");
const outputFile = join(__dirname, "..", "changelog.mdx");

const HEADER = `---
title: "Changelog"
description: "Latest updates and improvements to Inbox Zero"
---

`;

const files = readdirSync(entriesDir)
  .filter((f) => f.endsWith(".mdx"))
  .sort()
  .reverse();

const entries = files.map((f) => readFileSync(join(entriesDir, f), "utf-8").trimEnd());

writeFileSync(outputFile, HEADER + entries.join("\n\n") + "\n");

console.log(`Built changelog.mdx from ${files.length} entries`);
