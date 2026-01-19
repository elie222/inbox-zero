"use client";

import useSWR from "swr";
import type { AgentConfig, AgentConfigWithDocuments } from "../types";

export type AgentConfigResponse = AgentConfigWithDocuments;

export function useAgentConfig() {
  return useSWR<AgentConfigResponse>("/api/user/agent/config");
}

export function useAgentConfigMutation() {
  const { data, mutate } = useAgentConfig();

  const updateConfig = async (updates: Partial<AgentConfig>) => {
    const response = await fetch("/api/user/agent/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error("Failed to update config");
    }

    const updated = await response.json();
    mutate(updated, false);
    return updated;
  };

  return { config: data, updateConfig, mutate };
}
