import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getSharedAttachment } from "@/utils/team-comments/content";

export const GET = withAuth(
  "team-comments/attachment",
  async (request, { params }) => {
    const { conversationId, attachmentRef } = await params;
    const memberId = new URL(request.url).searchParams.get("memberId");
    if (!memberId)
      return NextResponse.json(
        { error: "Member ID required" },
        { status: 400 },
      );
    const result = await getSharedAttachment(
      { userId: request.auth.userId, memberId },
      { conversationId, attachmentRef, logger: request.logger },
    );
    if (!result)
      return NextResponse.json(
        { error: "Attachment unavailable" },
        { status: 404 },
      );
    const filename = Array.from(result.filename).slice(0, 200).join("");
    const fallback =
      filename.replace(/[^\x20-\x7e]|["\\]/g, "_") || "attachment";
    const encoded = encodeURIComponent(filename).replace(
      /['()*]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new Response(result.stream, {
      headers: {
        "Content-Type": result.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
