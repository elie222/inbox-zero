import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getEmailAccountAccess } from "@/utils/user/email-account-access";
import { ActionType } from "@prisma/client";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import type { RuleMetadata } from "@/components/editor/nodes/RuleNode";

const saveRulesDocumentBody = z.object({
  emailAccountId: z.string(),
  title: z.string(),
  content: z.any(), // TipTap JSON content
});

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json = await request.json();
  const body = saveRulesDocumentBody.parse(json);

  const hasAccess = await getEmailAccountAccess(
    session.user.id,
    body.emailAccountId
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Extract rules from the document content
  const rules: Array<{
    content: string;
    metadata: RuleMetadata;
  }> = [];

  const extractRules = (node: any) => {
    if (node.type === "rule" && node.attrs?.metadata && node.content) {
      const ruleContent = node.content
        .filter((n: any) => n.type === "text")
        .map((n: any) => n.text)
        .join("");

      if (ruleContent.trim() && node.attrs.metadata) {
        rules.push({
          content: ruleContent,
          metadata: node.attrs.metadata,
        });
      }
    }

    if (node.content) {
      node.content.forEach(extractRules);
    }
  };

  extractRules(body.content);

  // Create or update rules in the database
  const createdRules = await Promise.all(
    rules.map(async (rule) => {
      // Check if rule with this name already exists
      const existingRule = await prisma.rule.findFirst({
        where: {
          emailAccountId: body.emailAccountId,
          name: rule.metadata.name,
        },
      });

      if (existingRule) {
        // Update existing rule
        return await prisma.rule.update({
          where: { id: existingRule.id },
          data: {
            instructions: rule.content,
            actions: {
              deleteMany: {},
              create: rule.metadata.actions.map((action) => ({
                type: action.type,
                label: action.label,
                subject: action.subject,
                content: action.content,
                to: action.to,
                cc: action.cc,
                bcc: action.bcc,
                url: action.url,
              })),
            },
          },
          include: { actions: true },
        });
      } else {
        // Create new rule
        return await prisma.rule.create({
          data: {
            emailAccountId: body.emailAccountId,
            name: rule.metadata.name,
            instructions: rule.content,
            enabled: true,
            automate: false, // Start with manual approval required
            runOnThreads: false,
            actions: {
              create: rule.metadata.actions.map((action) => ({
                type: action.type,
                label: action.label,
                subject: action.subject,
                content: action.content,
                to: action.to,
                cc: action.cc,
                bcc: action.bcc,
                url: action.url,
              })),
            },
          },
          include: { actions: true },
        });
      }
    })
  );

  return NextResponse.json({
    success: true,
    rulesCount: createdRules.length,
    rules: createdRules.map((rule) => ({
      id: rule.id,
      name: rule.name,
    })),
  });
});