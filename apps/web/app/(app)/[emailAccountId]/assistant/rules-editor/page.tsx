"use client";

import { RulesEditor, type RuleMetadata } from "@/components/rules-editor";
import { ActionType } from "@prisma/client";

// Mock function to simulate AI metadata generation
async function generateRuleMetadata(ruleContent: string): Promise<RuleMetadata> {
  // Simulate API delay
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Generate metadata based on rule content
  const ruleName = ruleContent.slice(0, 50) + (ruleContent.length > 50 ? "..." : "");
  
  // Determine actions based on keywords in the rule
  const actions: RuleMetadata["actions"] = [];
  
  if (ruleContent.toLowerCase().includes("label")) {
    actions.push({
      type: ActionType.LABEL,
      label: "Important",
    });
  }
  
  if (ruleContent.toLowerCase().includes("draft") || ruleContent.toLowerCase().includes("reply")) {
    actions.push({
      type: ActionType.DRAFT_EMAIL,
      content: "Thank you for your email. I'll review this and get back to you shortly.",
    });
  }
  
  if (ruleContent.toLowerCase().includes("archive")) {
    actions.push({
      type: ActionType.ARCHIVE,
    });
  }

  // Default to label action if no specific actions detected
  if (actions.length === 0) {
    actions.push({
      type: ActionType.LABEL,
      label: "Processed",
    });
  }

  return {
    ruleName: `Rule: ${ruleName}`,
    actions,
  };
}

// Mock save function
async function handleSave(title: string, content: any) {
  console.log("Saving document:", { title, content });
  // In a real implementation, this would save to your backend
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

export default function RulesEditorPage() {
  // Example initial content with rules and context
  const exampleContent = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "This is an example rules document showing how to use the editor.",
          },
        ],
      },
      {
        type: "context",
        attrs: {
          content: "",
          id: "context-1",
        },
        content: [
          {
            type: "text",
            text: "I receive many customer support emails that need to be categorized and responded to efficiently. I want to automate common responses while maintaining a personal touch.",
          },
        ],
      },
      {
        type: "rule",
        attrs: {
          content: "",
          metadata: null,
          id: "rule-1",
        },
        content: [
          {
            type: "text",
            text: "When I receive an email asking about pricing, automatically draft a reply with our current pricing information and label it as 'Sales Inquiry'.",
          },
        ],
      },
      {
        type: "rule",
        attrs: {
          content: "",
          metadata: {
            ruleName: "Handle refund requests",
            actions: [
              {
                type: ActionType.LABEL,
                label: "Refund Request",
              },
              {
                type: ActionType.DRAFT_EMAIL,
                content: "I understand you'd like to request a refund. I'll process this for you right away. Please allow 3-5 business days for the refund to appear in your account.",
              },
            ],
          },
          id: "rule-2",
        },
        content: [
          {
            type: "text",
            text: "For emails containing words like 'refund', 'money back', or 'return', label them as 'Refund Request' and draft a polite response acknowledging their request.",
          },
        ],
      },
      {
        type: "context",
        attrs: {
          content: "",
          id: "context-2",
        },
        content: [
          {
            type: "text",
            text: "I also manage a newsletter and need to handle subscription-related emails.",
          },
        ],
      },
      {
        type: "rule",
        attrs: {
          content: "",
          metadata: null,
          id: "rule-3",
        },
        content: [
          {
            type: "text",
            text: "Archive all emails that are automated confirmations or receipts.",
          },
        ],
      },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "You can add more rules and context using the toolbar buttons or by typing /rule or /context.",
          },
        ],
      },
    ],
  };

  return (
    <div className="h-screen flex flex-col">
      <div className="content-container flex-1">
        <RulesEditor
          initialTitle="Customer Support Email Rules"
          initialContent={exampleContent}
          onSave={handleSave}
          generateRuleMetadata={generateRuleMetadata}
        />
      </div>
    </div>
  );
}