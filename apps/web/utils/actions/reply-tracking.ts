"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import prisma from "@/utils/prisma";

const resolveThreadTrackerSchema = z.object({
  threadId: z.string(),
});

type ResolveThreadTrackerBody = z.infer<typeof resolveThreadTrackerSchema>;

export const resolveThreadTrackerAction = withActionInstrumentation(
  "resolveThreadTracker",
  async (unsafeData: ResolveThreadTrackerBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      resolveThreadTrackerSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await prisma.threadTracker.updateMany({
      where: {
        threadId: data.threadId,
        userId,
      },
      data: {
        resolved: true,
      },
    });

    revalidatePath("/reply-tracker");

    return { success: true };
  },
);
