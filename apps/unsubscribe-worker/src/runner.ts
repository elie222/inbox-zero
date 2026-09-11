import { readFile } from "node:fs/promises";
import { request } from "node:https";
import { z } from "zod";
import {
  jobSchema,
  decisionSchema,
  MAX_JOB_MS,
  type Observation,
} from "./contracts.ts";
import { unsubscribeInBrowser } from "./browser.ts";

const timeout = setTimeout(() => process.exit(1), MAX_JOB_MS);
try {
  const raw = process.argv[2]
    ? await readFile("/tmp/unsubscribe-job.json", "utf8")
    : await readStdin();
  const input = jobSchema
    .extend({
      brokerUrl: z.url(),
      brokerIp: z.ipv4(),
      token: z.string().length(64),
    })
    .parse(JSON.parse(raw));
  const broker = new URL(input.brokerUrl);
  if (broker.protocol !== "https:") throw new Error("TLS required");
  const result = await unsubscribeInBrowser(input, (observation) =>
    requestDecision(observation, input),
  );
  process.stdout.write(JSON.stringify(result));
} catch {
  process.stdout.write(JSON.stringify({ status: "failed" }));
} finally {
  clearTimeout(timeout);
}

async function readStdin() {
  let text = "";
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > 16_000) throw new Error("Input too large");
  }
  return text;
}

function requestDecision(
  observation: Observation,
  input: { brokerUrl: string; brokerIp: string; token: string },
) {
  return new Promise<z.infer<typeof decisionSchema>>((resolve, reject) => {
    const body = JSON.stringify(observation);
    const req = request(
      new URL("/decision", input.brokerUrl),
      {
        method: "POST",
        lookup: (_host, _options, callback) =>
          callback(null, input.brokerIp, 4),
        headers: {
          Authorization: `Bearer ${input.token}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 25_000,
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => {
          text += chunk;
          if (text.length > 8192) req.destroy(new Error("Response too large"));
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            if (response.statusCode !== 200) throw new Error("Decision failed");
            resolve(decisionSchema.parse(JSON.parse(text)));
          } catch {
            reject(new Error("Invalid decision"));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Decision timeout")));
    req.on("error", reject);
    req.end(body);
  });
}
