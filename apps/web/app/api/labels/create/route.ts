import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { z } from "zod";

const createLabelBody = z.object({
  name: z.string(),
  description: z.string().nullish(),
});

export const POST = withEmailProvider(async (request) => {
  const { emailProvider } = request;
  const body = await request.json();
  const { name, description } = createLabelBody.parse(body);

  const label = await emailProvider.createLabel(
    name,
    description ? description : undefined,
  );

  return NextResponse.json({ label });
});
