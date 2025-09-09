"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { createOrganizationBody } from "@/utils/actions/organization.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { headers } from "next/headers";
import { betterAuthConfig } from "@/utils/auth";

export const createOrganizationAction = actionClientUser
  .metadata({ name: "createOrganization" })
  .schema(createOrganizationBody)
  .action(async ({ ctx: { userId }, parsedInput: { name, slug } }) => {
    const nextHeaders = await headers();
    const existingMembership = await prisma.member.findFirst({
      where: { userId },
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

    const organization = await betterAuthConfig.api.createOrganization({
      body: {
        name,
        slug,
      },
      headers: nextHeaders,
    });

    if (!organization) {
      throw new SafeError("Failed to create organization");
    }

    return organization;
  });
