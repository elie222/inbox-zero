import { Message } from "ai"

export type ChatCompletionResponse = {
  choices: { message: Message }[],
  usage: {
    prompt_tokens: number,
    completion_tokens: number,
    total_tokens: number
  }
}