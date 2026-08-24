import { MailMutationReceiptStatus } from "@/generated/prisma/enums";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { mailMutationReceiptResponse } from "@/utils/email-cache/mail-mutation-receipt";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export const GET = withAuth(
  "mail-mutation-receipt",
  async (request, context) => {
    const { mutationId } = await context.params;
    const emailAccountId = request.headers.get(EMAIL_ACCOUNT_HEADER);
    if (!emailAccountId) return missingReceiptResponse();
    const receipt = await prisma.mailMutationReceipt.findUnique({
      where: {
        emailAccountId_clientMutationId: {
          clientMutationId: mutationId,
          emailAccountId,
        },
      },
      select: {
        result: true,
        status: true,
        emailAccount: {
          select: { account: { select: { userId: true } } },
        },
      },
    });

    if (!receipt || receipt.emailAccount.account.userId !== request.auth.userId)
      return missingReceiptResponse();
    if (receipt.status === MailMutationReceiptStatus.APPLIED) {
      return Response.json(
        mailMutationReceiptResponse.parse({
          status: "applied",
          result: receipt.result,
        }),
      );
    }
    if (receipt.status === MailMutationReceiptStatus.UNCERTAIN) {
      return Response.json(
        mailMutationReceiptResponse.parse({ status: "uncertain" }),
      );
    }
    return Response.json(
      mailMutationReceiptResponse.parse({ status: "processing" }),
    );
  },
);

function missingReceiptResponse() {
  return Response.json(
    mailMutationReceiptResponse.parse({ status: "missing" }),
  );
}
