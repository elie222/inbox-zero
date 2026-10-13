import { withAccountApiKey } from "@/utils/api-middleware";
import { handleChatRequest } from "@/app/api/chat/handle-chat-request";

export const maxDuration = 800;

export const POST = withAccountApiKey(
  "v1/assistant/chat",
  ["ASSISTANT_CHAT"],
  async (request) =>
    handleChatRequest(
      Object.assign(request, {
        auth: {
          userId: request.apiAuth.userId,
          emailAccountId: request.apiAuth.emailAccountId,
          email: request.apiAuth.email,
        },
      }),
      { attachmentDeliveryEnabled: true },
    ),
);
