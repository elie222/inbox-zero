/**
 * Runs the LLM emulator as a standalone OpenAI-compatible server so the app
 * can be pointed at it during Playwright runs and local development:
 *
 *   pnpm emulate:llm
 *   # then in .env.local
 *   DEFAULT_LLMS=openai-compatible:emulated
 *   OPENAI_COMPATIBLE_BASE_URL=http://127.0.0.1:4006/v1
 *
 * Every request gets a schema-valid "nothing found" answer unless a scripted
 * reply is registered: POST /__emulator/replies with
 * `{ "match": "<prompt substring>", "object": { ... } }` (or `text` /
 * `toolCall`). GET /__emulator/requests lists what the app asked so far.
 */
import { createLlmEmulator } from "../__tests__/emulators/llm";

const PORT = Number(process.env.LLM_EMULATOR_PORT ?? process.argv[2] ?? 4006);

async function main() {
  const emulator = await createLlmEmulator({
    port: PORT,
    modelName: process.env.LLM_EMULATOR_MODEL,
  });

  console.log(`LLM emulator listening on ${emulator.url}`);
  console.log(`  DEFAULT_LLMS=openai-compatible:${emulator.modelName}`);
  console.log(`  OPENAI_COMPATIBLE_BASE_URL=${emulator.url}/v1`);

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, async () => {
      await emulator.close();
      process.exit(0);
    });
  }
}

main().catch((error) => {
  console.error("Failed to start the LLM emulator", error);
  process.exit(1);
});
