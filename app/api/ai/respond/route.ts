import { z } from "zod";
import { Configuration, OpenAIApi } from "openai-edge";
import { OpenAIStream, StreamingTextResponse } from "ai";

const respondBody = z.object({ message: z.string() });
export type RespondBody = z.infer<typeof respondBody>;
export type RespondResponse = Awaited<ReturnType<typeof respond>>;

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(config);

export const runtime = "edge";

async function respond(body: RespondBody) {
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k",
    messages: [{
      role: 'system',
      content: 'You are an AI assistant that helps the user respond to their emails. You are friendly, concise, and informal. The user will send you email messages and it is your job to write a response to them.',
    }, {
      role: 'user',
      content: `Please write a response for to this email for me:\n\n###\n\n${body.message}`,
    }],
    stream: true
  });
  return response;
}

export async function POST(request: Request) {
  const json = await request.json();
  const body = respondBody.parse(json);
  const res = await respond(body);

  // Convert the response into a friendly text-stream
  const stream = OpenAIStream(res);
  // Respond with the stream
  return new StreamingTextResponse(stream);
}
