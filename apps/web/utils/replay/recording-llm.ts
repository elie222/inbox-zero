import type { RecordingSessionHandle } from "./recorder";

// biome-ignore-all lint/suspicious/noExplicitAny: Recording wrappers need to accept arbitrary LLM function signatures

type GenerateFn = (...args: any[]) => Promise<any>;

export function wrapGenerateWithRecording<T extends GenerateFn>(
  generateFn: T,
  session: RecordingSessionHandle,
  label: string,
): T {
  return (async (...args: Parameters<T>) => {
    const [options] = args;
    const startTime = Date.now();

    await session.record("llm-request", {
      label,
      request: {
        system:
          typeof options.system === "string"
            ? options.system
            : "[system-prompt]",
        prompt: options.prompt,
        messages: options.messages,
      },
    });

    const result = await generateFn(...args);
    const duration = Date.now() - startTime;

    await session.record("llm-response", {
      label,
      request: null,
      response: {
        object: result.object,
        text: result.text,
        toolCalls: result.toolCalls,
        usage: result.usage,
      },
      duration,
    });

    return result;
  }) as T;
}

export function wrapStreamWithRecording(
  streamFn: (...args: any[]) => any,
  session: RecordingSessionHandle,
  label: string,
): typeof streamFn {
  return (...args: any[]) => {
    const [options, ...restArgs] = args;

    session
      .record("llm-request", {
        label,
        request: {
          messages: options?.messages,
          tools: options?.tools ? Object.keys(options.tools) : undefined,
        },
      })
      .catch(() => {});

    const originalOnFinish = options?.onFinish;
    const patchedOptions = {
      ...options,
      onFinish: async (result: any) => {
        await session.record("llm-response", {
          label,
          request: null,
          response: {
            text: result.text,
            toolCalls: result.toolCalls,
            steps: result.steps?.map((step: any) => ({
              text: step.text,
              toolCalls: step.toolCalls,
            })),
            usage: result.usage || result.totalUsage,
          },
        });

        return originalOnFinish?.(result);
      },
    };

    return streamFn(patchedOptions, ...restArgs);
  };
}
