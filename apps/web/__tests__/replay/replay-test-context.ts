import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ReplayFixture, RecordingEntry } from "@/utils/replay/types";
import { getEmailAccount } from "@/__tests__/helpers";
import { createLLMReplay } from "./llm-replay";
import { createEmailProviderReplay } from "./email-provider-replay";

export interface ReplayTestContext {
  emailProvider: EmailProvider;
  emailAccount: EmailAccountWithAI;
  fixture: ReplayFixture;

  llmReplay: ReturnType<typeof createLLMReplay>;
  emailProviderReplay: ReturnType<typeof createEmailProviderReplay>;

  captured: {
    emailApiCalls: Array<{ method: string; args: unknown[] }>;
    llmCalls: Array<{ label: string; prompt: unknown }>;
  };

  getWebhookEntry(): RecordingEntry | undefined;
  getEmailEntries(): RecordingEntry[];
  getLLMEntries(): RecordingEntry[];
}

export function createReplayTestContext(
  fixturePath: string,
  options?: {
    emailAccount?: Partial<EmailAccountWithAI>;
  },
): ReplayTestContext {
  const fullPath = resolve(process.cwd(), fixturePath);
  const raw = readFileSync(fullPath, "utf-8");
  const fixture: ReplayFixture = JSON.parse(raw);

  const emailAccount = getEmailAccount(options?.emailAccount);

  const llmReplay = createLLMReplay(fixture.entries);
  const emailProviderReplay = createEmailProviderReplay(fixture.entries);

  return {
    emailProvider: emailProviderReplay.provider,
    emailAccount,
    fixture,

    llmReplay,
    emailProviderReplay,

    captured: {
      get emailApiCalls() {
        return emailProviderReplay.getCalls();
      },
      get llmCalls() {
        return llmReplay.getCalls();
      },
    },

    getWebhookEntry() {
      return fixture.entries.find((e) => e.type === "webhook");
    },

    getEmailEntries() {
      return fixture.entries.filter(
        (e) => e.type === "email-api-call" || e.type === "email-api-response",
      );
    },

    getLLMEntries() {
      return fixture.entries.filter(
        (e) => e.type === "llm-request" || e.type === "llm-response",
      );
    },
  };
}
