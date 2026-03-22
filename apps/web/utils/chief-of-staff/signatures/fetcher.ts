const SIGNATURE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export async function getSignatureForAccount(
  emailAccountId: string,
  emailAddress: string,
  gmail: any, // gmail_v1.Gmail
  prisma: any, // PrismaClient
): Promise<string> {
  // 1. Check cache in ChiefOfStaffConfig
  const config = await prisma.chiefOfStaffConfig.findUnique({
    where: { emailAccountId },
  });
  if (
    config?.signatureHtml &&
    config.signatureLastFetched &&
    Date.now() - config.signatureLastFetched.getTime() < SIGNATURE_CACHE_TTL_MS
  ) {
    return config.signatureHtml;
  }

  // 2. Fetch from Gmail API
  const response = await gmail.users.settings.sendAs.get({
    userId: "me",
    sendAsEmail: emailAddress,
  });
  const signature = response.data.signature ?? "";

  // 3. Update cache
  if (config) {
    await prisma.chiefOfStaffConfig.update({
      where: { emailAccountId },
      data: { signatureHtml: signature, signatureLastFetched: new Date() },
    });
  }

  return signature;
}

export function appendSignatureToBody(
  bodyHtml: string,
  signatureHtml: string,
): string {
  if (!signatureHtml) return bodyHtml;
  return `${bodyHtml}<br><br>${signatureHtml}`;
}
