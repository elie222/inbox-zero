import { vi } from "vitest";
import type { RecordingEntry } from "@/utils/replay/types";

interface LLMCallRecord {
  label: string;
  request: unknown;
  response: unknown;
}

export function createLLMReplay(entries: RecordingEntry[]) {
  const llmPairs = extractLLMPairs(entries);
  const callsByLabel = new Map<string, LLMCallRecord[]>();
  const callCountByLabel = new Map<string, number>();
  const allCalls: Array<{ label: string; prompt: unknown }> = [];

  for (const pair of llmPairs) {
    const existing = callsByLabel.get(pair.label) || [];
    existing.push(pair);
    callsByLabel.set(pair.label, existing);
    callCountByLabel.set(pair.label, 0);
  }

  function getNextResponse(label: string): unknown {
    const recordings = callsByLabel.get(label);
    if (!recordings || recordings.length === 0) {
      throw new Error(
        `No recorded LLM response for label "${label}". ` +
          `Available labels: ${[...callsByLabel.keys()].join(", ")}`,
      );
    }

    const index = callCountByLabel.get(label) || 0;
    if (index >= recordings.length) {
      throw new Error(
        `No more recorded LLM responses for label "${label}". ` +
          `Expected ${index + 1} calls but only ${recordings.length} recorded.`,
      );
    }

    callCountByLabel.set(label, index + 1);
    const recording = recordings[index];
    allCalls.push({ label, prompt: recording.request });
    return recording.response;
  }

  const mockGenerateObject = vi.fn(async (options: any) => {
    const label = options._replayLabel || "unknown";
    const response = getNextResponse(label) as any;
    return {
      object: response.object,
      usage: response.usage || { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
      rawResponse: undefined,
    };
  });

  const mockGenerateText = vi.fn(async (options: any) => {
    const label = options._replayLabel || "unknown";
    const response = getNextResponse(label) as any;

    if (response.toolCalls?.length && options.tools) {
      for (const toolCall of response.toolCalls) {
        const toolImpl = options.tools[toolCall.toolName];
        if (typeof toolImpl?.execute === "function") {
          await toolImpl.execute(toolCall.input);
        }
      }
    }

    return {
      text: response.text || "",
      toolCalls: response.toolCalls || [],
      usage: response.usage || { promptTokens: 0, completionTokens: 0 },
      finishReason: "stop",
      rawResponse: undefined,
    };
  });

  function createMockGenerateObject({ label }: { label: string }) {
    return async (options: any) => {
      return mockGenerateObject({ ...options, _replayLabel: label });
    };
  }

  function createMockGenerateText({ label }: { label: string }) {
    return async (options: any) => {
      return mockGenerateText({ ...options, _replayLabel: label });
    };
  }

  return {
    mockGenerateObject,
    mockGenerateText,
    createMockGenerateObject,
    createMockGenerateText,
    getCalls: () => allCalls,
    getCallCount: (label: string) => callCountByLabel.get(label) || 0,
  };
}

function extractLLMPairs(entries: RecordingEntry[]): LLMCallRecord[] {
  const pairs: LLMCallRecord[] = [];
  const pendingRequests = new Map<
    string,
    Array<{ label: string; request: unknown }>
  >();

  for (const entry of entries) {
    if (entry.type === "llm-request") {
      const label = entry.label || "unknown";
      const queue = pendingRequests.get(label) || [];
      queue.push({
        label: entry.label || "unknown",
        request: entry.request,
      });
      pendingRequests.set(label, queue);
    } else if (entry.type === "llm-response") {
      const label = entry.label || "unknown";
      const queue = pendingRequests.get(label);
      const pendingRequest = queue?.shift();

      if (!pendingRequest) continue;

      if (!queue?.length) {
        pendingRequests.delete(label);
      }

      pairs.push({
        label: pendingRequest.label,
        request: pendingRequest.request,
        response: entry.response,
      });
    }
  }

  return pairs;
}
