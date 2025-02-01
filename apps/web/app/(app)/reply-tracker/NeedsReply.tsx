import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ThreadTrackerType } from "@prisma/client";

export async function NeedsReply() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const trackers = await prisma.threadTracker.findMany({
    where: {
      userId: session.user.id,
      resolved: false,
      type: ThreadTrackerType.NEEDS_REPLY,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <div>
      <div>{trackers.length}</div>
      <div>
        {trackers.map((tracker) => (
          <div key={tracker.id}>{tracker.threadId}</div>
        ))}
      </div>
    </div>
  );
}
