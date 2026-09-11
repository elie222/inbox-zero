import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleRuleAction } from "@/utils/actions/rule";
import { withEmailAccount } from "@/utils/middleware";

const bodySchema = z.object({ enabled: z.boolean() });

export const POST = withEmailAccount(
  "mobile/rules/toggle",
  async (request, { params }) => {
    const { id } = await params;
    const { enabled } = bodySchema.parse(await request.json());
    const result = await toggleRuleAction(request.auth.emailAccountId, {
      ruleId: id,
      enabled,
    });

    if (result?.serverError) {
      return NextResponse.json({ error: result.serverError }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  },
);
