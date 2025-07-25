import { z } from "zod";

export const emailSummarySchema = z.object({
  summary: z.string().describe("Brief summary of the email content"),
  sender: z.string().describe("Email sender"),
  subject: z.string().describe("Email subject"),
  category: z
    .string()
    .describe("Category of the email (work, personal, marketing, etc.)"),
});

export const executiveSummarySchema = z.object({
  userProfile: z.object({
    persona: z
      .string()
      .describe(
        "1-5 word persona identification (e.g., 'Tech Startup Founder')",
      ),
    confidence: z
      .number()
      .min(0)
      .max(100)
      .describe("Confidence level in persona identification (0-100)"),
  }),
  topInsights: z
    .array(
      z.object({
        insight: z.string().describe("Key insight about user's email behavior"),
        priority: z
          .enum(["high", "medium", "low"])
          .describe("Priority level of this insight"),
        icon: z.string().describe("Single emoji representing this insight"),
      }),
    )
    .describe("3-5 most important findings from the analysis"),
  quickActions: z
    .array(
      z.object({
        action: z
          .string()
          .describe("Specific action the user can take immediately"),
        difficulty: z
          .enum(["easy", "medium", "hard"])
          .describe("How difficult this action is to implement"),
        impact: z
          .enum(["high", "medium", "low"])
          .describe("Expected impact of this action"),
      }),
    )
    .describe("4-6 immediate actions the user can take"),
});

export const userPersonaSchema = z.object({
  professionalIdentity: z.object({
    persona: z.string().describe("Professional persona identification"),
    supportingEvidence: z
      .array(z.string())
      .describe("Evidence supporting this persona identification"),
  }),
  currentPriorities: z
    .array(z.string())
    .describe("Current professional priorities based on email content"),
});

export const emailBehaviorSchema = z.object({
  timingPatterns: z.object({
    peakHours: z.array(z.string()).describe("Peak email activity hours"),
    responsePreference: z.string().describe("Preferred response timing"),
    frequency: z.string().describe("Overall email frequency"),
  }),
  contentPreferences: z.object({
    preferred: z
      .array(z.string())
      .describe("Types of emails user engages with"),
    avoided: z
      .array(z.string())
      .describe("Types of emails user typically ignores"),
  }),
  engagementTriggers: z
    .array(z.string())
    .describe("What prompts user to take action on emails"),
});

export const responsePatternsSchema = z.object({
  commonResponses: z.array(
    z.object({
      pattern: z.string().describe("Description of the response pattern"),
      example: z.string().describe("Example of this type of response"),
      frequency: z
        .number()
        .describe("Percentage of responses using this pattern"),
      triggers: z
        .array(z.string())
        .describe("What types of emails trigger this response"),
    }),
  ),
  suggestedTemplates: z.array(
    z.object({
      templateName: z.string().describe("Name of the email template"),
      template: z.string().describe("The actual email template text"),
      useCase: z.string().describe("When to use this template"),
    }),
  ),
  categoryOrganization: z.array(
    z.object({
      category: z.string().describe("Email category name"),
      description: z
        .string()
        .describe("What types of emails belong in this category"),
      emailCount: z
        .number()
        .describe("Estimated number of emails in this category"),
      priority: z
        .enum(["high", "medium", "low"])
        .describe("Priority level for this category"),
    }),
  ),
});

export const labelAnalysisSchema = z.object({
  optimizationSuggestions: z.array(
    z.object({
      type: z
        .enum(["create", "consolidate", "rename", "delete"])
        .describe("Type of optimization"),
      suggestion: z.string().describe("Specific suggestion"),
      reason: z.string().describe("Reason for this suggestion"),
      impact: z.enum(["high", "medium", "low"]).describe("Expected impact"),
    }),
  ),
});

export const actionableRecommendationsSchema = z.object({
  immediateActions: z.array(
    z.object({
      action: z.string().describe("Specific action to take"),
      difficulty: z
        .enum(["easy", "medium", "hard"])
        .describe("Implementation difficulty"),
      impact: z.enum(["high", "medium", "low"]).describe("Expected impact"),
      timeRequired: z.string().describe("Time required (e.g., '5 minutes')"),
    }),
  ),
  shortTermImprovements: z.array(
    z.object({
      improvement: z.string().describe("Improvement to implement"),
      timeline: z.string().describe("When to implement (e.g., 'This week')"),
      expectedBenefit: z.string().describe("Expected benefit"),
    }),
  ),
  longTermStrategy: z.array(
    z.object({
      strategy: z.string().describe("Strategic initiative"),
      description: z.string().describe("Detailed description"),
      successMetrics: z.array(z.string()).describe("How to measure success"),
    }),
  ),
});

export type EmailSummary = z.infer<typeof emailSummarySchema>;
