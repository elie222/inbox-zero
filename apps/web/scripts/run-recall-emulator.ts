/**
 * Runs the Recall emulator as a standalone server so the app can be pointed at
 * it during local development:
 *
 *   pnpm emulate:recall
 *   # then in .env.local
 *   RECALL_API_KEY=emulator-recall-key
 *   RECALL_BASE_URL=http://127.0.0.1:4004/api/v1
 *
 * Bots are driven from the console rather than by a real call. Type `list` to
 * see them, `advance <botId> <code>` to move one along, and `transcript <botId>`
 * to attach a canned transcript and print the webhook body to POST at
 * /api/recall/webhook.
 */
import { createInterface } from "node:readline";
import {
  createRecallEmulator,
  recallWebhookPayloads,
} from "../__tests__/emulators/recall";

const PORT = Number(process.env.RECALL_EMULATOR_PORT ?? 4004);

const SAMPLE_TRANSCRIPT = [
  {
    participant: {
      id: 1,
      name: "Alice",
      is_host: true,
      email: "alice@example.com",
    },
    words: [
      {
        text: "Let's",
        start_timestamp: { relative: 0 },
        end_timestamp: { relative: 0.4 },
      },
      {
        text: "ship",
        start_timestamp: { relative: 0.4 },
        end_timestamp: { relative: 0.8 },
      },
      {
        text: "it",
        start_timestamp: { relative: 0.8 },
        end_timestamp: { relative: 1 },
      },
    ],
  },
  {
    participant: { id: 2, name: "Bob", is_host: false, email: null },
    words: [
      {
        text: "Agreed",
        start_timestamp: { relative: 1.2 },
        end_timestamp: { relative: 1.8 },
      },
    ],
  },
];

const USAGE = "Commands: list | advance <botId> <code> | transcript <botId>";

async function main() {
  const emulator = await createRecallEmulator({ port: PORT });

  console.log(`Recall emulator listening on ${emulator.url}`);
  console.log(`  RECALL_BASE_URL=${emulator.apiBase}`);
  console.log(`  RECALL_API_KEY=${emulator.apiKey}`);
  console.log(`  RECALL_WEBHOOK_SECRET=${emulator.webhookSecret}`);
  console.log(`\n${USAGE}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  rl.on("line", (line) => {
    const [command, botId, code] = line.trim().split(/\s+/);

    if (command === "list") {
      for (const request of emulator.requests) {
        if (request.method === "POST" && request.path.endsWith("/bot/")) {
          console.log(request.body);
        }
      }
      return;
    }

    if (command === "advance" && botId && code) {
      emulator.advance(botId, code);
      console.log(
        JSON.stringify(recallWebhookPayloads.statusChange(botId, code)),
      );
      return;
    }

    if (command === "transcript" && botId) {
      const transcriptId = emulator.attachTranscript(botId, SAMPLE_TRANSCRIPT);
      console.log(
        JSON.stringify(
          recallWebhookPayloads.transcriptDone(botId, transcriptId),
        ),
      );
      return;
    }

    console.log(USAGE);
  });

  process.on("SIGINT", async () => {
    await emulator.close();
    process.exit(0);
  });
}

main();
