import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

export type PluginCatalogResponse = Awaited<ReturnType<typeof getCatalog>>;

export const GET = withEmailAccount(async (_request) => {
  const result = await getCatalog();
  return NextResponse.json(result);
});

async function getCatalog() {
  // TODO: Replace with actual plugin catalog from database or registry
  // For now, return mock data
  const plugins: Array<
    PluginManifest & {
      author?: string;
      trustLevel?: "verified" | "community" | "unverified";
      repositoryUrl?: string;
    }
  > = [
    {
      id: "auto-responder",
      name: "Auto Responder",
      version: "1.0.0",
      description: "Automatically respond to emails based on custom rules",
      author: "Inbox Zero Team",
      trustLevel: "verified",
      repositoryUrl: "https://github.com/inbox-zero/plugin-auto-responder",
      inboxZero: { minVersion: "1.0.0" },
      entry: "index.ts",
      capabilities: ["email:trigger", "email:draft"],
      permissions: {
        email: "full",
      },
    },
    {
      id: "meeting-scheduler",
      name: "Meeting Scheduler",
      version: "2.1.0",
      description: "Schedule meetings from emails and manage your calendar",
      author: "Community",
      trustLevel: "community",
      repositoryUrl: "https://github.com/community/meeting-scheduler",
      inboxZero: { minVersion: "1.0.0" },
      entry: "index.ts",
      capabilities: ["calendar:write", "email:trigger"],
      permissions: {
        email: "metadata",
        calendar: ["read", "write"],
      },
    },
    {
      id: "email-summarizer",
      name: "Email Summarizer",
      version: "1.5.0",
      description: "Generate AI-powered summaries of long email threads",
      author: "Inbox Zero Team",
      trustLevel: "verified",
      repositoryUrl: "https://github.com/inbox-zero/email-summarizer",
      inboxZero: { minVersion: "1.0.0" },
      entry: "index.ts",
      capabilities: ["email:trigger"],
      permissions: {
        email: "full",
      },
    },
  ];

  return { plugins };
}
