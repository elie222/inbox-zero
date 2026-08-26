import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { EMAIL_SEND_LIMITS, sendEmailBody } from "@/utils/types/mail";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { executeStagedDurableEmailSend } from "@/utils/email/email-attachment-staging";
import {
  durableEmailSendBody,
  durableMultipartEmailSendPayload,
  durableStagedEmailSendBody,
} from "@/utils/email/durable-email-send.validation";

export type SendMessageResponse = {
  success: true;
  messageId: string;
  threadId: string;
};

export type DurableSendMessageResponse = Awaited<
  ReturnType<typeof executeDurableEmailSend>
>;

/**
 * REST equivalent of `sendEmailAction` for clients that cannot call server
 * actions. JSON requests accept either `sendEmailBody` or its durable envelope.
 * Durable clients can instead send multipart attachment bytes alongside a
 * content-free envelope in the `payload` field.
 */
export const POST = withEmailAccount("messages/send", async (request) => {
  const providerName = await getProviderName(
    request.auth.emailAccountId,
    request.auth.userId,
  );
  let emailProviderPromise: ReturnType<typeof createEmailProvider> | undefined;
  const getEmailProvider = () => {
    emailProviderPromise ??= createEmailProvider({
      emailAccountId: request.auth.emailAccountId,
      provider: providerName,
      logger: request.logger,
    });
    return emailProviderPromise;
  };
  if (isMultipartRequest(request)) {
    validateMultipartContentLength(request.headers.get("content-length"));
    const input = await parseDurableMultipartRequest(request);
    const result = await executeDurableEmailSend({
      emailAccountId: request.auth.emailAccountId,
      getEmailProvider,
      input,
      provider: providerName,
    });
    return NextResponse.json(result);
  }

  const json: unknown = await request.json();
  if (isDurableSend(json)) {
    if (hasStagedAttachments(json)) {
      const input = durableStagedEmailSendBody.parse(json);
      const result = await executeStagedDurableEmailSend({
        emailAccountId: request.auth.emailAccountId,
        getEmailProvider,
        input,
        provider: providerName,
      });
      return NextResponse.json(result);
    }
    const input = durableEmailSendBody.parse(json);
    const result = await executeDurableEmailSend({
      emailAccountId: request.auth.emailAccountId,
      getEmailProvider,
      input,
      provider: providerName,
    });
    return NextResponse.json(result);
  }
  const body = sendEmailBody.parse(json);

  try {
    const emailProvider = await getEmailProvider();
    const result = await emailProvider.sendEmailWithHtml(body);

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    } satisfies SendMessageResponse);
  } catch (error) {
    request.logger.error("Failed to send email", {
      error,
      threadId: body.replyToEmail?.threadId,
      emailAccountId: request.auth.emailAccountId,
    });
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
});

async function getProviderName(emailAccountId: string, userId: string) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId, userId },
    select: { account: { select: { provider: true } } },
  });
  return z.string().min(1).parse(emailAccount?.account.provider);
}

function isDurableSend(value: unknown): value is { mutationId: unknown } {
  return typeof value === "object" && value !== null && "mutationId" in value;
}

function hasStagedAttachments(value: unknown) {
  if (typeof value !== "object" || value === null || !("email" in value)) {
    return false;
  }
  const email = value.email;
  if (
    typeof email !== "object" ||
    email === null ||
    !("attachments" in email)
  ) {
    return false;
  }
  return (
    Array.isArray(email.attachments) &&
    email.attachments.some(
      (attachment) =>
        typeof attachment === "object" &&
        attachment !== null &&
        "stagedAttachmentId" in attachment,
    )
  );
}

function isMultipartRequest(request: Request) {
  return (
    request.headers
      .get("content-type")
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() === "multipart/form-data"
  );
}

function validateMultipartContentLength(value: string | null) {
  if (value === null) return;
  const contentLength = z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine(Number.isSafeInteger)
    .parse(value);
  validateMultipartRequestSize(contentLength);
}

async function parseDurableMultipartRequest(request: Request) {
  const formData = await readBoundedMultipartFormData(request);
  z.array(z.enum(["payload", "attachment"])).parse([...formData.keys()]);

  const [payload] = z.tuple([z.string()]).parse(formData.getAll("payload"));
  const input = durableMultipartEmailSendPayload.parse(payload);
  const files = z
    .array(z.instanceof(File))
    .parse(formData.getAll("attachment"));
  const metadata = input.email.attachments ?? [];

  z.number()
    .refine((count) => count === metadata.length)
    .parse(files.length);
  for (const [index, file] of files.entries()) {
    const attachment = metadata[index];
    z.object({
      filename: z.literal(attachment.filename),
      mimeType: z.literal(attachment.mimeType.toLowerCase()),
      size: z.literal(attachment.size),
    }).parse({
      filename: file.name,
      mimeType: file.type.toLowerCase(),
      size: file.size,
    });
  }

  const estimatedSerializedBytes =
    new TextEncoder().encode(payload).byteLength +
    metadata.reduce(
      (total, attachment) => total + 4 * Math.ceil(attachment.size / 3),
      0,
    );
  z.number()
    .max(EMAIL_SEND_LIMITS.maxSerializedPayloadBytes)
    .parse(estimatedSerializedBytes);

  const attachments = [];
  for (const [index, { mimeType, ...attachment }] of metadata.entries()) {
    attachments.push({
      ...attachment,
      content: Buffer.from(await files[index].arrayBuffer()).toString("base64"),
      contentType: mimeType,
    });
  }

  return durableEmailSendBody.parse({
    ...input,
    email: {
      ...input.email,
      attachments:
        input.email.attachments === undefined ? undefined : attachments,
    },
  });
}

async function readBoundedMultipartFormData(request: Request) {
  const body = z
    .custom<ReadableStream<Uint8Array>>((value) => Boolean(value))
    .parse(request.body);
  const reader = body.getReader();
  let receivedBytes = 0;
  const boundedBody = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        reader.releaseLock();
        controller.close();
        return;
      }
      try {
        receivedBytes += value.byteLength;
        validateMultipartRequestSize(receivedBytes);
        controller.enqueue(value);
      } catch (error) {
        reader.releaseLock();
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });

  const contentType = z.string().parse(request.headers.get("content-type"));
  const multipartResponse = new Response(boundedBody, {
    headers: { "content-type": contentType },
  });
  return multipartResponse.formData();
}

function validateMultipartRequestSize(length: number) {
  z.number()
    .refine(
      (value) => value <= EMAIL_SEND_LIMITS.maxSerializedPayloadBytes,
      "The multipart request is too large.",
    )
    .parse(length);
}
