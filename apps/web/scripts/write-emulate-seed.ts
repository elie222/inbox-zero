import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeEmulateSeed } from "./emulate-seed";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(SCRIPT_DIR, "../../..");
const DEFAULT_OUTPUT_PATH = resolve(
  SCRIPT_DIR,
  "../.tmp/emulate.generated.json",
);

async function main() {
  const { baseUrl, outputPath } = parseOptions(process.argv.slice(2));
  await writeEmulateSeed(outputPath, baseUrl);
  console.log(`Wrote emulator seed to ${relativeToRoot(outputPath)}`);
}

function parseOptions(args: string[]) {
  let baseUrl: string | undefined;
  let outputPath = DEFAULT_OUTPUT_PATH;

  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];

    if (!value) throw new Error(`Missing value for ${option}`);

    switch (option) {
      case "--base-url":
        baseUrl = value;
        index += 1;
        break;
      case "--output":
        outputPath = resolve(ROOT_DIR, value);
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
    }
  }

  return { baseUrl, outputPath };
}

function relativeToRoot(path: string) {
  return path.replace(`${ROOT_DIR}/`, "");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
