import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { z } from "zod";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";
import { MailLayout, MailSplitFilterKind } from "@/generated/prisma/enums";

const mailSettingsSchema = z.object({
  layout: z.enum(MailLayout).nullable(),
  expandedPreview: z.boolean(),
  splits: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      order: z.number(),
      matchAll: z.boolean(),
      filters: z.array(
        z.object({
          kind: z.enum(MailSplitFilterKind),
          value: z.string().nullable(),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<MailSettingsResponse>;

export function useMailSettings() {
  const swr = useSWR<MailSettingsResponse>("/api/mail/settings");
  // Persisted responses can predate the current settings format. Wait for
  // revalidation rather than exposing incompatible settings to consumers.
  const data = useMemo(
    () =>
      mailSettingsSchema.safeParse(swr.data).success ? swr.data : undefined,
    [swr.data],
  );

  const { mutate } = swr;
  const hasIncompatibleData = swr.data !== undefined && data === undefined;
  useEffect(() => {
    if (!hasIncompatibleData) return;
    // Hydration mutates SWR and can discard an in-flight request. Clear the
    // incompatible entry and explicitly start a fresh request.
    mutate(undefined, { revalidate: true, throwOnError: false });
  }, [hasIncompatibleData, mutate]);

  return { ...swr, data };
}
