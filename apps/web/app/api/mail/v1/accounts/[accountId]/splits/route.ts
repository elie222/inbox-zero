import { z } from "zod";
import { createMailSplitBody } from "@/utils/actions/mail-split.validation";
import { withMailSplits } from "@/utils/mail-api/splits";
import { createMailSplitFromPreset } from "@/utils/split-inbox/library.server";
import { getMailSettings } from "@/utils/split-inbox/settings.server";
import { createMailSplitOrThrow } from "@/utils/split-inbox/splits.server";

const bodySchema = z.union([
  z.object({ presetId: z.string().min(1) }),
  createMailSplitBody,
]);

export const POST = withMailSplits(
  "mail/v1/splits/create",
  async (request, _params, body) => {
    const input = bodySchema.parse(body);
    const { emailAccountId } = request.auth;
    if ("presetId" in input) {
      await createMailSplitFromPreset({
        emailAccountId,
        emailProvider: request.emailProvider,
        presetId: input.presetId,
        logger: request.logger,
      });
    } else {
      await createMailSplitOrThrow({ emailAccountId, ...input });
    }
    const { splits } = await getMailSettings({ emailAccountId });
    return { splits };
  },
);
