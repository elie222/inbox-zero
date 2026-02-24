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
const LABELS_TIMEOUT_MS = 10_000;

export const GET = withEmailProvider("labels", async (request) => {
  const { emailProvider } = request;

  try {
    const labels = await withTimeout(
      emailProvider.getLabels(),
      LABELS_TIMEOUT_MS,
    );
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
    request.logger.error("Error fetching labels", { error });
    return NextResponse.json({ labels: [] }, { status: 500 });
  }
});

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}
