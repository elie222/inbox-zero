import { vi } from "vitest";
import { createMockEmailProvider } from "@/__tests__/mocks/email-provider.mock";
import type { EmailProvider } from "@/utils/email/types";
import type { RecordingEntry } from "@/utils/replay/types";

interface EmailAPIRecord {
  method: string;
  request: unknown;
  response: unknown;
}

export function createEmailProviderReplay(entries: RecordingEntry[]): {
  provider: EmailProvider;
  getCalls: () => Array<{ method: string; args: unknown[] }>;
} {
  const apiRecords = extractEmailAPIPairs(entries);
  const callsByMethod = new Map<string, EmailAPIRecord[]>();
  const callCountByMethod = new Map<string, number>();
  const allCalls: Array<{ method: string; args: unknown[] }> = [];

  for (const record of apiRecords) {
    const existing = callsByMethod.get(record.method) || [];
    existing.push(record);
    callsByMethod.set(record.method, existing);
    callCountByMethod.set(record.method, 0);
  }

  const baseMock = createMockEmailProvider();

  const overrides: Record<string, unknown> = {};

  for (const [method, records] of callsByMethod) {
    overrides[method] = vi.fn(async (...args: unknown[]) => {
      allCalls.push({ method, args });

      const index = callCountByMethod.get(method) || 0;
      if (index >= records.length) {
        throw new Error(
          `No more recorded responses for ${method}(). ` +
            `Expected ${index + 1} calls but only ${records.length} recorded.`,
        );
      }

      callCountByMethod.set(method, index + 1);
      const record = records[index];

      const response = record.response as any;
      if (response?.error) {
        throw new Error(response.message || `${method} failed`);
      }

      return response;
    });
  }

  const provider = { ...baseMock, ...overrides } as EmailProvider;

  return {
    provider,
    getCalls: () => allCalls,
  };
}

function extractEmailAPIPairs(entries: RecordingEntry[]): EmailAPIRecord[] {
  const records: EmailAPIRecord[] = [];
  let pendingCall: { method: string; request: unknown } | null = null;

  for (const entry of entries) {
    if (entry.type === "email-api-call") {
      pendingCall = {
        method: entry.method || "unknown",
        request: entry.request,
      };
    } else if (entry.type === "email-api-response" && pendingCall) {
      records.push({
        method: pendingCall.method,
        request: pendingCall.request,
        response: entry.response,
      });
      pendingCall = null;
    }
  }

  return records;
}
