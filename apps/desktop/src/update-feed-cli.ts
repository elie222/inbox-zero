import {
  getDesktopAssetBaseUrl,
  rewriteUpdateFeedFiles,
} from "./update-feed.ts";

const directory = process.argv[2];
const tag = process.argv[3];
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
