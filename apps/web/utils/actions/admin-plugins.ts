"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { updatePluginAllowlistBody } from "@/utils/actions/admin-plugins.validation";
import prisma from "@/utils/prisma";
import { auth } from "@/utils/auth";
import { isAdmin } from "@/utils/admin";

export const updatePluginAllowlistAction = actionClientUser
  .metadata({ name: "updatePluginAllowlist" })
  .schema(updatePluginAllowlistBody)
  .action(async ({ parsedInput: { mode, allowedPlugins } }) => {
    const session = await auth();

    if (!isAdmin({ email: session?.user.email })) {
      throw new Error("Unauthorized: Admin access required");
    }

    // for now, we'll store this in organization metadata
    // in a multi-tenant setup, this would apply to the admin's organization
    // in a single-tenant setup, this applies instance-wide

    // find the first organization (single-tenant assumption for now)
    const org = await prisma.organization.findFirst();

    if (!org) {
      // no organization yet - create one for instance-wide settings
      await prisma.organization.create({
        data: {
          name: "Default Organization",
          slug: "default",
          allowedPlugins: mode === "selected" ? (allowedPlugins ?? []) : [],
        },
      });
    } else {
      await prisma.organization.update({
        where: { id: org.id },
        data: {
          allowedPlugins: mode === "selected" ? (allowedPlugins ?? []) : [],
        },
      });
    }

    return { success: true };
  });
