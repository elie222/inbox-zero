import {
  updateMailSplitBody,
  deleteMailSplitBody,
} from "@/utils/actions/mail-split.validation";
import { withMailSplits } from "@/utils/mail-api/splits";
import { getMailSettings } from "@/utils/split-inbox/settings.server";
import {
  updateMailSplit,
  deleteMailSplit,
} from "@/utils/split-inbox/splits.server";

export const PATCH = withMailSplits(
  "mail/v1/splits/update",
  async (request, params, body) => {
    const input = updateMailSplitBody.parse({
      ...(body && typeof body === "object" ? body : {}),
      id: params.splitId,
    });
    const { emailAccountId } = request.auth;
    await updateMailSplit({ emailAccountId, ...input });
    const { splits } = await getMailSettings({ emailAccountId });
    return { splits };
  },
);

export const DELETE = withMailSplits(
  "mail/v1/splits/delete",
  async (request, params) => {
    const input = deleteMailSplitBody.parse({ id: params.splitId });
    const { emailAccountId } = request.auth;
    await deleteMailSplit({ emailAccountId, ...input });
    const { splits } = await getMailSettings({ emailAccountId });
    return { splits };
  },
);
