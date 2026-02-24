import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { startRequestTimer } from "@/utils/request-timing";

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
  const requestTimer = startRequestTimer({
    logger: request.logger,
    requestName: "Labels request",
    runningWarnAfterMs: 10_000,
    slowWarnAfterMs: 3000,
  });

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
    requestTimer.logSlowCompletion({ labelCount: unifiedLabels.length });
    return NextResponse.json({ labels: unifiedLabels });
  } catch (error) {
    request.logger.error("Error fetching labels", {
      error,
      durationMs: requestTimer.durationMs(),
    });
    return NextResponse.json({ labels: [] }, { status: 500 });
  } finally {
    requestTimer.stop();
  }
});
