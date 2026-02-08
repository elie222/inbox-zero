import { z } from "zod";
import prisma from "@/utils/prisma";
import { generalizeSubject } from "@/utils/string";
import type { Logger } from "@/utils/logger";

const emailMatcherSchema = z.object({
  field: z.enum(["from", "subject"]),
  value: z.string().min(1),
});

type EmailMatcher = z.infer<typeof emailMatcherSchema>;

type MatchedPattern = {
  patternId: string;
  matcher: EmailMatcher;
  actions: Array<{ actionType: string; actionData: unknown }>;
};

function matchEmail(
  matcher: EmailMatcher,
  headers: { from: string; subject: string },
): boolean {
  if (matcher.field === "from") {
    const lowerValue = matcher.value.toLowerCase();
    const lowerFrom = headers.from.toLowerCase();
    return lowerValue.includes(lowerFrom) || lowerFrom.includes(lowerValue);
  }

  if (matcher.field === "subject") {
    const lowerSubject = headers.subject.toLowerCase();
    const lowerValue = matcher.value.toLowerCase();
    return (
      lowerSubject.includes(lowerValue) ||
      generalizeSubject(lowerSubject).includes(generalizeSubject(lowerValue))
    );
  }

  return false;
}

export async function findMatchingPatterns({
  emailAccountId,
  provider,
  resourceType,
  headers,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  resourceType: string;
  headers: { from: string; subject: string };
  logger: Logger;
}): Promise<MatchedPattern | null> {
  const patterns = await prisma.learnedPattern.findMany({
    where: { emailAccountId, provider, resourceType },
    include: { actions: true },
    orderBy: { createdAt: "asc" },
  });

  for (const pattern of patterns) {
    const parsed = emailMatcherSchema.safeParse(pattern.matcher);
    if (!parsed.success) continue;

    if (matchEmail(parsed.data, headers)) {
      logger.info("Matched learned pattern", { patternId: pattern.id });
      return {
        patternId: pattern.id,
        matcher: parsed.data,
        actions: pattern.actions.map((a) => ({
          actionType: a.actionType,
          actionData: a.actionData,
        })),
      };
    }
  }

  return null;
}
