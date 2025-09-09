"use server";

import { headers } from "next/headers";
import { ssoRegistrationBody } from "@/utils/actions/enterprise.validation";
import { adminActionClient } from "@/utils/actions/safe-action";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { registerSSOProvider } from "@/utils/sso/register-sso-provider";
import { validateIdpMetadata } from "@/utils/sso/validate-idp-metadata";

export const registerSSOProviderAction = adminActionClient
  .metadata({ name: "registerSSOProvider" })
  .schema(ssoRegistrationBody)
  .action(
    async ({
      parsedInput: { idpMetadata, organizationName, domain, providerId },
    }) => {
      const session = await auth();
      if (!session?.user?.id) {
        throw new SafeError("Unauthorized");
      }
      const userId = session.user.id;

      if (!validateIdpMetadata(idpMetadata)) {
        throw new SafeError("Invalid IDP metadata XML.");
      }

      return await registerSSOProvider({
        idpMetadata,
        providerId,
        organizationName,
        domain,
        userId,
        headers: await headers(),
      });
    },
  );
