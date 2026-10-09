import { withMailSplits } from "@/utils/mail-api/splits";
import { getMailSplitPresets } from "@/utils/split-inbox/library.server";

export const GET = withMailSplits(
  "mail/v1/splits/presets",
  async (request) => ({
    presets: await getMailSplitPresets({
      emailAccountId: request.auth.emailAccountId,
      emailProvider: request.emailProvider,
    }),
  }),
);
