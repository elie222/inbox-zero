import { reorderMailSplitsBody } from "@/utils/actions/mail-split.validation";
import { withMailSplits } from "@/utils/mail-api/splits";
import { getMailSettings } from "@/utils/split-inbox/settings.server";
import { reorderMailSplits } from "@/utils/split-inbox/splits.server";

export const POST = withMailSplits(
  "mail/v1/splits/reorder",
  async (request, _params, body) => {
    const { ids } = reorderMailSplitsBody.parse(body);
    const { emailAccountId } = request.auth;
    await reorderMailSplits({ emailAccountId, ids });
    const { splits } = await getMailSettings({ emailAccountId });
    return { splits };
  },
);
