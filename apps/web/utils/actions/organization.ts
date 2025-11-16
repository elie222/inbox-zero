"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { createOrganizationBody } from "@/utils/actions/organization.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const createOrganizationAction = actionClient
  .metadata({ name: "createOrganization" })
  .inputSchema(createOrganizationBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { name, slug } }) => {
    const existingMembership = await prisma.member.findFirst({
      where: { emailAccountId },
      select: { id: true },
    });

    if (existingMembership) {
      throw new SafeError(
        "You are already a member of an organization. You can only be part of one organization at a time.",
      );
    }

    const existingOrganization = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existingOrganization) {
      throw new SafeError(
        "An organization with this slug already exists. Please choose a different slug.",
      );
    }

    const organization = await prisma.organization.create({
      data: { name, slug },
      select: { id: true, name: true, slug: true, createdAt: true },
    });

    await prisma.member.create({
      data: {
        organizationId: organization.id,
        emailAccountId,
        role: "owner",
      },
    });

    return organization;
  });
