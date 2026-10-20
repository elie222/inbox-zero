import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";

export type DeploymentResponse = { deploymentId: string | null };

export const GET = withError("deployment", async () =>
  NextResponse.json(
    { deploymentId: process.env.NEXT_DEPLOYMENT_ID || null },
    { headers: { "Cache-Control": "no-store" } },
  ),
);
