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

function formatDate(filename) {
  const [year, month, day] = filename.replace(".mdx", "").split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error("Missing frontmatter");
  const meta = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(": ");
    meta[key.trim()] = rest.join(": ").replace(/^"|"$/g, "");
  }
  return { meta, content: match[2].trim() };
}

function escapeAttr(str) {
  return str.replace(/"/g, "&quot;");
}

function buildUpdate(filename, { meta, content }) {
  const indented = content
    .split("\n")
    .map((line) => (line ? `  ${line}` : ""))
    .join("\n");
  const label = formatDate(filename);
  return `<Update label="${escapeAttr(label)}" description="${escapeAttr(meta.description)}">\n${indented}\n</Update>`;
}

const files = readdirSync(entriesDir)
  .filter((f) => f.endsWith(".mdx"))
  .sort()
  .reverse();

const entries = files.map((f) => {
  const raw = readFileSync(join(entriesDir, f), "utf-8");
  return buildUpdate(f, parseFrontmatter(raw));
});

writeFileSync(outputFile, `${HEADER}${entries.join("\n\n")}\n`);

console.log(`Built changelog.mdx from ${files.length} entries`);
