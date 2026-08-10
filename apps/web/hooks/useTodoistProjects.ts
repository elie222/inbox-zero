import useSWR from "swr";
import type { GetTodoistProjectsResponse } from "@/app/api/mcp/todoist/projects/route";

export function useTodoistProjects({ enabled }: { enabled: boolean }) {
  return useSWR<GetTodoistProjectsResponse>(
    enabled ? "/api/mcp/todoist/projects" : null,
  );
}
