import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  deletePromptHistory,
  getPromptHistory,
} from "@/app/api/user/prompt-history/controller";
import { withError } from "@/utils/middleware";

export const dynamic = "force-dynamic";

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const history = await getPromptHistory({ userId: session.user.id });

  return NextResponse.json(history);
});

export const DELETE = withError(async (_request, { params }) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  if (!params.id) return NextResponse.json({ error: "Missing id" });

  await deletePromptHistory({ id: params.id, userId: session.user.id });

  return NextResponse.json({ success: true });
});
