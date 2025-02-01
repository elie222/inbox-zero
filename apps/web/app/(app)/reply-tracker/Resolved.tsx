import { redirect } from "next/navigation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ReplyTrackerEmails } from "@/app/(app)/reply-tracker/ReplyTrackerEmails";

export async function Resolved() {
  const session = await auth();
  if (!session?.user.id) redirect("/login");

  const trackers = await prisma.threadTracker.findMany({
    where: {
      userId: session.user.id,
      resolved: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <ReplyTrackerEmails
      trackers={trackers}
      userEmail={session.user.email || ""}
    />
  );
}
