import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailAccount, withEmailProvider } from "@/utils/middleware";
import { sendEmailBody } from "@/utils/types/mail";
import {
  createDraftResource,
  discardDraftResource,
  draftResourceResult,
  readDraftResource,
  updateDraftResource,
} from "@/utils/email/draft-resource";
import {
  accountMismatchResponse,
  mailRequestId,
  protocolVersionFromRequest,
  unsupportedVersionResponse,
} from "@/utils/mail-api/authorization";

const resourceParams = z.object({
  accountId: z.string().min(1),
  resourceKey: z.string().min(1).max(128),
});
const writeBody = z.object({
  content: sendEmailBody,
  providerDraftId: z.string().min(1).max(256).optional(),
});
const discardBody = writeBody.pick({ providerDraftId: true });
const headers = { "Cache-Control": "no-store" };

export const GET = withEmailAccount(
  "mail/v1/draft-resources/read",
  async (request, context) => {
    const { accountId, resourceKey } = resourceParams.parse(
      await context.params,
    );
    const requestId = mailRequestId(request);
    const mismatch =
      accountMismatchResponse(request, accountId, requestId) ??
      unsupportedVersionResponse(
        requestId,
        protocolVersionFromRequest(request),
      );
    if (mismatch) return mismatch;
    const resource = await readDraftResource(accountId, resourceKey);
    return NextResponse.json(
      resource
        ? draftResourceResult(resource)
        : { error: "Draft resource not found." },
      { status: resource ? 200 : 404, headers },
    );
  },
);

export const POST = withEmailProvider(
  "mail/v1/draft-resources/create",
  async (request, context) => {
    const { accountId, resourceKey } = resourceParams.parse(
      await context.params,
    );
    const requestId = mailRequestId(request);
    const mismatch =
      accountMismatchResponse(request, accountId, requestId) ??
      unsupportedVersionResponse(
        requestId,
        protocolVersionFromRequest(request),
      );
    if (mismatch) return mismatch;
    const body = writeBody.parse(await request.json());
    const row = await createDraftResource({
      accountId,
      resourceKey,
      ...body,
      provider: request.emailProvider,
    });
    return NextResponse.json(draftResourceResult(row), { headers });
  },
);

export const PUT = withEmailProvider(
  "mail/v1/draft-resources/update",
  async (request, context) => {
    const { accountId, resourceKey } = resourceParams.parse(
      await context.params,
    );
    const requestId = mailRequestId(request);
    const mismatch =
      accountMismatchResponse(request, accountId, requestId) ??
      unsupportedVersionResponse(
        requestId,
        protocolVersionFromRequest(request),
      );
    if (mismatch) return mismatch;
    const body = writeBody.parse(await request.json());
    const row = await updateDraftResource({
      accountId,
      resourceKey,
      ...body,
      provider: request.emailProvider,
    });
    return NextResponse.json(draftResourceResult(row), { headers });
  },
);

export const DELETE = withEmailProvider(
  "mail/v1/draft-resources/discard",
  async (request, context) => {
    const { accountId, resourceKey } = resourceParams.parse(
      await context.params,
    );
    const requestId = mailRequestId(request);
    const mismatch =
      accountMismatchResponse(request, accountId, requestId) ??
      unsupportedVersionResponse(
        requestId,
        protocolVersionFromRequest(request),
      );
    if (mismatch) return mismatch;
    const body = discardBody.parse(await request.json());
    const row = await discardDraftResource({
      accountId,
      resourceKey,
      ...body,
      provider: request.emailProvider,
    });
    return NextResponse.json(draftResourceResult(row), { headers });
  },
);
