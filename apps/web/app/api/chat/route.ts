import { withEmailAccount } from "@/utils/middleware";
import { handleChatRequest } from "./handle-chat-request";

export const maxDuration = 800;

export const POST = withEmailAccount("chat", (request) =>
  handleChatRequest(request),
);
