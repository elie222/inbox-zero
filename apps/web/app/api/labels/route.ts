import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("labels");

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

export const GET = withEmailProvider(async (request) => {
  const { emailProvider } = request;

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
    return NextResponse.json({ labels: unifiedLabels });
  } catch (error) {
    logger.error("Error fetching labels", { error });
    return NextResponse.json({ labels: [] }, { status: 500 });
  }
});
