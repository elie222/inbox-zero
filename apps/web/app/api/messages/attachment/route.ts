import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { attachmentQuery } from "@/app/api/messages/validation";

export const GET = withEmailProvider("messages/attachment", async (request) => {
  const { emailProvider } = request;

  const { searchParams } = new URL(request.url);

  const query = attachmentQuery.parse({
    messageId: searchParams.get("messageId"),
    attachmentId: searchParams.get("attachmentId"),
    mimeType: searchParams.get("mimeType"),
    filename: searchParams.get("filename"),
  });

  const attachmentData = await emailProvider.getAttachment(
    query.messageId,
    query.attachmentId,
  );

  if (!attachmentData.data) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  const decodedData = Buffer.from(attachmentData.data, "base64");

  // Both values come from the query string of a cookie-authenticated GET —
  // a link in a rendered email can pick them. Sanitize before they reach
  // response headers: a quote in the filename escapes the quoted string and
  // smuggles extra Content-Disposition parameters.
  const safeMimeType = /^[\w.+-]+\/[\w.+-]+$/.test(query.mimeType)
    ? query.mimeType
    : "application/octet-stream";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
  const safeFilename = query.filename.replace(/["\\\u0000-\u001f\u007f]/g, "");

  const headers = new Headers();
  headers.set("Content-Type", safeMimeType);
  headers.set("Content-Disposition", `attachment; filename="${safeFilename}"`);

  return new NextResponse(decodedData, { headers });
});
