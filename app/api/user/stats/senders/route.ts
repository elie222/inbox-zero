import { z } from "zod";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import prisma from "@/utils/prisma";

export type sendersResponse = Awaited<ReturnType<typeof getSenders>>;

async function getSenders(options: { userId: string }) {
  // 1. get last 500 messages
  // 2. get unique senders and counts
  // 3. store results in redis with history id
}

export async function GET() {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getSenders({ userId: session.user.id });

  return NextResponse.json(result);
}
