import { Message } from "ai";

export type ChatCompletionResponse = {
  choices: { message: Message }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type ChatCompletionError = {
  error: {
    message: string;
    type: "tokens" | "invalid_request_error"; // add more as needed
    param: string;
    code: "context_length_exceeded"; // add more as needed
  };
};

// typeguard to check if the response is an error
export function isChatCompletionError(
  response: ChatCompletionResponse | ChatCompletionError
): response is ChatCompletionError {
  return !!(response as ChatCompletionError).error;
}
