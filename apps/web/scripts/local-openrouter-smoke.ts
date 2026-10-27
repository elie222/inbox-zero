import assert from "node:assert/strict";
import { generateText, Output, tool } from "ai";
import { z } from "zod";
import { getModel } from "../utils/llms/model";

async function main() {
  const selected = getModel({
    aiApiKey: null,
    aiProvider: null,
    aiModel: null,
  });
  const common = {
    model: selected.model,
    maxRetries: 0,
    maxOutputTokens: 4096,
    providerOptions: selected.providerOptions,
    abortSignal: AbortSignal.timeout(120_000),
  };
  const structured = await generateText({
    ...common,
    prompt:
      "Classify this synthetic email: Your purchase receipt for order 123 is attached. Choose receipt or personal.",
    output: Output.object({
      schema: z.object({ category: z.enum(["receipt", "personal"]) }),
    }),
  });
  const classification = await structured.output;
  console.log("Synthetic classification:", JSON.stringify(classification));
  assert.equal(classification.category, "receipt");
  console.log("App provider path: structured email classification passed.");
  const result = await generateText({
    ...common,
    prompt:
      "Classify this synthetic purchase receipt with the classifyEmail tool. Use category receipt.",
    toolChoice: { type: "tool", toolName: "classifyEmail" },
    tools: {
      classifyEmail: tool({
        description: "Classify a synthetic email for a connection test.",
        inputSchema: z.object({ category: z.enum(["receipt", "personal"]) }),
      }),
    },
  });
  assert.equal(result.toolCalls[0]?.toolName, "classifyEmail");
  assert.deepEqual(result.toolCalls[0]?.input, { category: "receipt" });
  console.log(
    "App provider path: tool calling passed. No mailbox accessed or modified.",
  );
}

main().catch((error) => {
  console.error(
    `OpenRouter SDK smoke test failed: ${error.name}: ${error.message}`,
  );
  if (error.text)
    console.error("Synthetic test response:", error.text.slice(0, 1000));
  if (error.finishReason) console.error("Finish reason:", error.finishReason);
  process.exitCode = 1;
});
