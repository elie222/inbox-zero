#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const isCheckMode = process.argv.includes("--check");

syncArtifacts();

function syncArtifacts() {
  const reviewer = readReviewerDefinition();
  const inboxZeroApiSkill = readInboxZeroApiSkill();

  const outputs = [
    {
      path: path.join(rootDir, ".claude/agents/reviewer.md"),
      content: renderClaudeReviewer(reviewer),
    },
    {
      path: path.join(rootDir, ".codex/agents/reviewer.toml"),
      content: renderCodexReviewer(reviewer),
    },
    {
      path: path.join(rootDir, "agents/inbox-zero-api-cli.md"),
      content: renderInboxZeroApiAgent(inboxZeroApiSkill),
    },
    {
      path: path.join(rootDir, ".cursor-plugin/plugin.json"),
      content: renderCursorPlugin(inboxZeroApiSkill),
    },
  ];

  const changedPaths = [];

  for (const output of outputs) {
    const existing = existsSync(output.path)
      ? readFileSync(output.path, "utf8")
      : "";

    if (existing === output.content) continue;

    changedPaths.push(path.relative(rootDir, output.path));

    if (!isCheckMode) {
      writeFileSync(output.path, output.content);
    }
  }

  if (changedPaths.length === 0) {
    console.log("AI artifacts already in sync.");
    return;
  }

  if (isCheckMode) {
    console.error("AI artifacts are out of sync:");
    for (const changedPath of changedPaths) {
      console.error(`- ${changedPath}`);
    }
    process.exit(1);
  }

  console.log("Updated AI artifacts:");
  for (const changedPath of changedPaths) {
    console.log(`- ${changedPath}`);
  }
}

function readReviewerDefinition() {
  const reviewerPath = path.join(rootDir, "agents/reviewer.json");
  return JSON.parse(readFileSync(reviewerPath, "utf8"));
}

function readInboxZeroApiSkill() {
  const skillPath = path.join(rootDir, "clawhub/inbox-zero-api/SKILL.md");
  const skillMarkdown = readFileSync(skillPath, "utf8");
  const frontmatter = parseFrontmatter(skillMarkdown);
  const workflowSteps = extractSectionList(skillMarkdown, "Workflow");

  if (!frontmatter.name || !frontmatter.description || !frontmatter.homepage) {
    throw new Error("clawhub/inbox-zero-api/SKILL.md is missing required frontmatter.");
  }

  if (workflowSteps.length === 0) {
    throw new Error("Failed to extract workflow steps from clawhub/inbox-zero-api/SKILL.md.");
  }

  return {
    name: frontmatter.name,
    description: frontmatter.description,
    homepage: frontmatter.homepage,
    workflowSteps,
  };
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n/);

  if (!match) {
    throw new Error("Missing frontmatter block.");
  }

  const frontmatter = {};

  for (const line of match[1].split("\n")) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key || !rawValue || rawValue.startsWith("{")) continue;

    frontmatter[key] = stripQuotes(rawValue);
  }

  return frontmatter;
}

function extractSectionList(markdown, sectionTitle) {
  const escapedTitle = escapeRegExp(sectionTitle);
  const sectionMatch = markdown.match(
    new RegExp(`## ${escapedTitle}\\n\\n([\\s\\S]*?)(\\n## |$)`),
  );

  if (!sectionMatch) {
    return [];
  }

  return sectionMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, ""));
}

function renderClaudeReviewer(reviewer) {
  return [
    "---",
    `name: ${reviewer.name}`,
    `description: ${reviewer.description}`,
    `tools: ${reviewer.claudeTools.join(", ")}`,
    "---",
    "",
    "You are the reviewer sub-agent.",
    "",
    "Review the current git diff against `main` once implementation is complete and PR-ready.",
    "",
    "Review checklist:",
    ...reviewer.reviewChecklist.map((item) => `- ${item}`),
    "",
    "Output requirements:",
    ...reviewer.outputRequirements.map((item) => `- ${item}`),
    "",
  ].join("\n");
}

function renderCodexReviewer(reviewer) {
  const lines = [
    `You are the reviewer sub-agent. Review the current git diff against \`main\` once implementation is complete and PR-ready.`,
    "",
    "Review checklist:",
    ...reviewer.reviewChecklist.map((item) => `- ${item}`),
    "",
    "Output requirements:",
    ...reviewer.outputRequirements.map((item) => `- ${item}`),
  ];

  return [
    `model = "${reviewer.codexModel}"`,
    `model_reasoning_effort = "${reviewer.codexReasoningEffort}"`,
    'developer_instructions = """',
    ...lines,
    '"""',
    "",
  ].join("\n");
}

function renderInboxZeroApiAgent(skill) {
  return [
    "---",
    "name: inbox-zero-api-cli",
    `description: ${skill.description}`,
    "---",
    "",
    "# Inbox Zero API CLI",
    "",
    "Use `inbox-zero-api` with `--json` for stable output. Require `INBOX_ZERO_API_KEY` for authenticated commands.",
    "",
    ...skill.workflowSteps.map((step, index) => `${index + 1}. ${step}`),
    "",
    "Install: `npm install -g @inbox-zero/api`. See the **inbox-zero-api** skill (`skills/inbox-zero-api/references/cli-reference.md`) for the full mutation flow.",
    "",
  ].join("\n");
}

function renderCursorPlugin(skill) {
  return `${JSON.stringify(
    {
      name: skill.name,
      version: "1.0.0",
      description: `${skill.description} Same skill source as OpenClaw / ClawHub (clawhub/inbox-zero-api).`,
      author: {
        name: "Inbox Zero",
      },
      homepage: skill.homepage,
      repository: "https://github.com/elie222/inbox-zero",
      license: "AGPL-3.0",
      keywords: [
        "inbox-zero",
        "email",
        "api",
        "cli",
        "automation",
        "rules",
        "openclaw",
      ],
    },
    null,
    2,
  )}\n`;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
