import { NextResponse } from "next/server";
import { getSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import {
  createLabel,
  createLabelBody,
} from "@/app/api/google/labels/create/controller";

export const POST = withError(async (request: Request) => {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = createLabelBody.parse(json);
  const label = await createLabel(body);

  return NextResponse.json(label);
});
