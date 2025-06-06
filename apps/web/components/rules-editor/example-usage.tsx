"use client";

import { RulesEditor } from "./RulesEditor";
import type { RuleMetadata } from "./nodes/RuleNode";

// Example function to generate rule metadata using AI
async function generateRuleMetadata(content: string): Promise<RuleMetadata> {
  // This is where you would call your AI API to generate metadata
  // For now, return a mock response
  await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate API delay

  // Mock AI response
  return {
    name: `Rule: ${content.slice(0, 30)}...`,
    actions: [
      {
        type: "LABEL",
        label: "Generated Label",
      },
      {
        type: "ARCHIVE",
      },
    ],
  };
}

// Example save function
async function handleSave(title: string, content: any): Promise<void> {
  console.log("Saving document:", { title, content });
  // Here you would save to your database
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export function RulesEditorExample() {
  return (
    <div className="h-screen">
      <RulesEditor
        initialTitle="My Email Rules"
        onSave={handleSave}
        generateRuleMetadata={generateRuleMetadata}
      />
    </div>
  );
}
