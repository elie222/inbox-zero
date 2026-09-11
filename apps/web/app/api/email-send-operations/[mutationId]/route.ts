import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { emailSendOperationResponse } from "@/utils/email-cache/email-send-operation";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export const GET = withAuth(
  "email-send-operation",
  async (request, context) => {
    const { mutationId } = await context.params;
    const emailAccountId = request.headers.get(EMAIL_ACCOUNT_HEADER);
    if (!emailAccountId) return missingOperationResponse();
    const operation = await prisma.emailSendOperation.findUnique({
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

    if (
      !operation ||
      operation.emailAccount.account.userId !== request.auth.userId
    )
      return missingOperationResponse();
    if (operation.status === EmailSendOperationStatus.SENT) {
      return Response.json(
        emailSendOperationResponse.parse({
          status: "sent",
          result: operation.result,
        }),
      );
    }
    if (operation.status === EmailSendOperationStatus.UNCERTAIN) {
      return Response.json(
        emailSendOperationResponse.parse({ status: "uncertain" }),
      );
    }
    return Response.json(
      emailSendOperationResponse.parse({ status: "processing" }),
    );
  },
);

function missingOperationResponse() {
  return Response.json(emailSendOperationResponse.parse({ status: "missing" }));
}
