"use server";

import { after } from "next/server";
import { actionClient } from "@/utils/actions/safe-action";
import { generateWrappedBody } from "@/utils/actions/wrapped.validation";
import { generateWrappedData } from "@/utils/wrapped/generate";
import prisma from "@/utils/prisma";
import { WrappedStatus } from "@/generated/prisma/enums";

export const generateWrappedAction = actionClient
  .metadata({ name: "generateWrapped" })
  .schema(generateWrappedBody)
  .action(
    async ({ ctx: { emailAccountId, logger }, parsedInput: { year } }) => {
      logger.info("Generate wrapped requested", { year });

      // Check if already processing
      const existing = await prisma.emailWrapped.findUnique({
        where: {
          emailAccountId_year: { emailAccountId, year },
        },
      });

      if (existing?.status === WrappedStatus.PROCESSING) {
        return { status: "processing" as const };
      }

      // Start generation in the background using next/server after()
      after(async () => {
        try {
          await generateWrappedData(emailAccountId, year);
        } catch (error) {
          logger.error("Background wrapped generation failed", { error });
        }
      });

      return { status: "started" as const };
    },
  );
