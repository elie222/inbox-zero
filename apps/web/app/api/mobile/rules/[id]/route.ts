import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createRuleBody,
  deleteRuleBody,
} from "@/utils/actions/rule.validation";
import { deleteRuleAction, updateRuleAction } from "@/utils/actions/rule";
import { withEmailAccount } from "@/utils/middleware";

const updateBodySchema = z.object({ rule: createRuleBody });

export const PATCH = withEmailAccount(
  "mobile/rules/update",
  async (request, { params }) => {
    const { id } = await params;
    const { rule } = updateBodySchema.parse(await request.json());
    const result = await updateRuleAction(request.auth.emailAccountId, {
      ...rule,
      id,
    });

    if (result?.serverError) {
      return NextResponse.json({ error: result.serverError }, { status: 400 });
    }
    if (!result?.data?.rule) {
      return NextResponse.json(
        { error: "Could not update rule" },
        { status: 500 },
      );
    }

    return NextResponse.json({ rule: result.data.rule });
  },
);

export const DELETE = withEmailAccount(
  "mobile/rules/delete",
  async (request, { params }) => {
    const input = deleteRuleBody.parse(await params);
    const result = await deleteRuleAction(request.auth.emailAccountId, input);

    if (result?.serverError) {
      return NextResponse.json({ error: result.serverError }, { status: 400 });
    }

    return new Response(null, { status: 204 });
  },
);
