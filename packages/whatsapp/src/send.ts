import { whatsappClientRequest } from "./client";

export type SendWhatsAppTextMessageParams = {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  text: string;
};

type SendWhatsAppTextMessageResponse = {
  messaging_product: string;
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
};

export async function sendWhatsAppTextMessage({
  accessToken,
  phoneNumberId,
  to,
  text,
}: SendWhatsAppTextMessageParams): Promise<SendWhatsAppTextMessageResponse> {
  return whatsappClientRequest<SendWhatsAppTextMessageResponse>({
    accessToken,
    path: `${phoneNumberId}/messages`,
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: text,
      },
    },
  });
}
