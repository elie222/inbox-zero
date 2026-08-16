import fs from "node:fs";
import {
  getDesktopAssetBaseUrl,
  rewriteUpdateFeedFiles,
  shouldReplaceDesktopUpdateFeed,
} from "./update-feed.ts";

const [command, ...rest] = process.argv.slice(2);

if (command === "--should-replace") {
  const [nextFile, currentFile] = rest;
  if (!nextFile) {
    process.stderr.write(
      "Usage: update-feed-cli --should-replace <next.yml> [current.yml]\n",
    );
    process.exit(1);
  }
  const nextYaml = fs.readFileSync(nextFile, "utf8");
  const currentYaml =
    currentFile && fs.existsSync(currentFile)
      ? fs.readFileSync(currentFile, "utf8")
      : null;
  process.exit(shouldReplaceDesktopUpdateFeed(nextYaml, currentYaml) ? 0 : 2);
}

const directory = command;
const tag = rest[0];
if (!directory || !tag) {
  process.stderr.write("Usage: update-feed-cli <directory> <desktop-v tag>\n");
  process.exit(1);
}

const rewritten = rewriteUpdateFeedFiles(
  directory,
  getDesktopAssetBaseUrl(tag),
);
if (rewritten.length === 0) {
  process.stderr.write(`No electron-updater yml files found in ${directory}\n`);
  process.exit(1);
}
process.stdout.write(`Rewrote ${rewritten.join(", ")}\n`);
