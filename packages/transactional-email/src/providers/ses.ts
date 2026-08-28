import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type {
  TransactionalEmailAttachment,
  TransactionalEmailProvider,
  TransactionalEmailProviderResult,
} from "../provider";

const SES_TEST_RECIPIENT = "success@simulator.amazonses.com";

export function createSesTransactionalEmailProvider(): TransactionalEmailProvider {
  const ses = new SESv2Client({});

  return {
    async send(message, options): Promise<TransactionalEmailProviderResult> {
      const attachments = await Promise.all(
        message.attachments?.map(toSesAttachment) ?? [],
      );
      const result = await ses.send(
        new SendEmailCommand({
          Content: {
            Simple: {
              Attachments: attachments.length ? attachments : undefined,
              Body: {
                Html: { Charset: "UTF-8", Data: message.html },
                Text: { Charset: "UTF-8", Data: message.text },
              },
              Headers: message.headers
                ? Object.entries(message.headers).map(([Name, Value]) => ({
                    Name,
                    Value,
                  }))
                : undefined,
              Subject: { Charset: "UTF-8", Data: message.subject },
            },
          },
          Destination: {
            ToAddresses: [options?.test ? SES_TEST_RECIPIENT : message.to],
          },
          EmailTags: message.tags?.map(({ name, value }) => ({
            Name: name,
            Value: value,
          })),
          FromEmailAddress: message.from,
          ReplyToAddresses: message.replyTo ? [message.replyTo] : undefined,
        }),
      );

      return { messageId: result.MessageId };
    },
  };
}

async function toSesAttachment(attachment: TransactionalEmailAttachment) {
  return {
    ContentDisposition: attachment.contentId
      ? ("INLINE" as const)
      : ("ATTACHMENT" as const),
    ContentId: attachment.contentId,
    ContentType: attachment.contentType,
    FileName: getAttachmentFilename(attachment),
    RawContent: await getAttachmentContent(attachment),
  };
}

async function getAttachmentContent(
  attachment: TransactionalEmailAttachment,
): Promise<Uint8Array> {
  if (attachment.content !== undefined) {
    return Buffer.from(attachment.content, "base64");
  }

  if (!attachment.path) {
    throw new Error("Email attachment requires content or a path");
  }

  const response = await fetch(attachment.path);
  if (!response.ok) {
    throw new Error(`Failed to fetch email attachment: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

function getAttachmentFilename(attachment: TransactionalEmailAttachment) {
  if (attachment.filename) return attachment.filename;
  if (!attachment.path) return "attachment";

  const filename = new URL(attachment.path).pathname.split("/").pop();
  return filename ? decodeURIComponent(filename) : "attachment";
}
