import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { UserPersona } from "@/utils/ai/report/build-user-persona";
import type { EmailSummary } from "@/utils/ai/report/summarize-emails";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";

const logger = createScopedLogger("email-report-actionable-recommendations");

const actionableRecommendationsSchema = z.object({
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

export async function aiGenerateActionableRecommendations(
  emailSummaries: EmailSummary[],
  emailAccount: EmailAccountWithAI,
  userPersona: UserPersona,
): Promise<z.infer<typeof actionableRecommendationsSchema>> {
  const system = `You are an email productivity consultant. Based on the comprehensive email analysis, create specific, actionable recommendations that the user can implement to improve their email workflow.

Organize recommendations by timeline (immediate, short-term, long-term) and include specific implementation details and expected benefits.`;

  const prompt = `### Analysis Summary

**User Persona:** ${userPersona.professionalIdentity.persona}
**Current Priorities:** ${userPersona.currentPriorities.join(", ")}
**Email Volume:** ${emailSummaries.length} emails analyzed

---

Create actionable recommendations in three categories:
1. **Immediate Actions** (can be done today): 4-6 specific actions with time requirements
2. **Short-term Improvements** (this week): 3-4 improvements with timelines and benefits  
3. **Long-term Strategy** (ongoing): 2-3 strategic initiatives with success metrics

Focus on practical, implementable solutions that improve email organization and workflow efficiency.`;

  logger.trace("Input", { system, prompt });

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "email-report-actionable-recommendations",
    modelOptions,
  });

  const result = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: actionableRecommendationsSchema,
  });

  logger.trace("Output", result.object);

  return result.object;
}
