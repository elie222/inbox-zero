import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { callMcpTool } from "@/utils/mcp/call-tool";

export type GetTodoistProjectsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("mcp/todoist/projects", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  return NextResponse.json(await getData(emailAccountId));
});

async function getData(emailAccountId: string) {
  const content = await callMcpTool({
    emailAccountId,
    integration: "todoist",
    toolName: "find-projects",
    args: {},
  });

  return { projects: parseProjects(content) };
}

function parseProjects(content: unknown): Array<{ id: string; name: string }> {
  if (!Array.isArray(content)) return [];

  const projects: Array<{ id: string; name: string }> = [];

  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    if (!("text" in item) || typeof item.text !== "string") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(item.text);
    } catch {
      continue;
    }

    for (const candidate of extractProjectArray(parsed)) {
      if (
        candidate &&
        typeof candidate === "object" &&
        "id" in candidate &&
        "name" in candidate &&
        typeof candidate.name === "string"
      ) {
        projects.push({ id: String(candidate.id), name: candidate.name });
      }
    }
  }

  return projects;
}

function extractProjectArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return [];
  if ("results" in parsed && Array.isArray(parsed.results)) {
    return parsed.results;
  }
  if ("projects" in parsed && Array.isArray(parsed.projects)) {
    return parsed.projects;
  }
  return [];
}
