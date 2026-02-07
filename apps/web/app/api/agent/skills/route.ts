import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetAgentSkillsResponse = Awaited<ReturnType<typeof getSkills>>;

export const GET = withEmailAccount("agent/skills", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getSkills({ emailAccountId });
  return NextResponse.json(result);
});

async function getSkills({ emailAccountId }: { emailAccountId: string }) {
  const skills = await prisma.skill.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      description: true,
      content: true,
      enabled: true,
      version: true,
      useCount: true,
      lastUsedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return { skills };
}
