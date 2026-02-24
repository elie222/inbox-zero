import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";

export type UnifiedLabel = {
  id: string;
  name: string;
  type: string | null;
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
  labelListVisibility?: string;
  messageListVisibility?: string;
};

export type LabelsResponse = {
  labels: UnifiedLabel[];
};

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export const GET = withEmailProvider("labels", async (request) => {
  const { emailProvider } = request;
  const requestStartTime = Date.now();
  const slowRequestLogTimeout = setTimeout(() => {
    request.logger.warn("Labels request still running", {
      elapsedMs: Date.now() - requestStartTime,
    });
  }, 10_000);

  try {
    const labels = await emailProvider.getLabels();
    // Map to unified format
    const unifiedLabels: UnifiedLabel[] = (labels || []).map((label) => ({
      id: label.id,
      name: label.name,
      type: label.type,
      color: label.color,
      labelListVisibility: label.labelListVisibility,
      messageListVisibility: label.messageListVisibility,
    }));
    const durationMs = Date.now() - requestStartTime;
    if (durationMs > 3000) {
      request.logger.warn("Labels request completed slowly", {
        durationMs,
        labelCount: unifiedLabels.length,
      });
    }
    return NextResponse.json({ labels: unifiedLabels });
  } catch (error) {
    request.logger.error("Error fetching labels", {
      error,
      durationMs: Date.now() - requestStartTime,
    });
    return NextResponse.json({ labels: [] }, { status: 500 });
  } finally {
    clearTimeout(slowRequestLogTimeout);
  }
});
