"use client";

import { Agentation as AgentationComponent } from "agentation";

export function Agentation() {
  if (process.env.NODE_ENV !== "development") return null;
  return <AgentationComponent />;
}
