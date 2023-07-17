import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import {
  deletePromptHistory,
  getPromptHistory,
} from "@/app/api/prompt-history/controller";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const history = await getPromptHistory({ userId: session.user.id });

  return NextResponse.json(history);
}

export async function DELETE(_request: Request, params: { id: string }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  await deletePromptHistory({ id: params.id, userId: session.user.id });

  return NextResponse.json({ success: true });
}
