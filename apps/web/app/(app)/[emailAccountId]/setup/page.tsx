import { Suspense } from "react";
import {
  ConversionAnalyticsScript,
  ConversionQueryParamEvents,
} from "@/components/ConversionAnalytics";
import { LoadStats } from "@/providers/StatLoaderProvider";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { SetupContent } from "./SetupContent";

export default async function SetupPage(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  return (
    <>
      <Suspense>
        <ConversionQueryParamEvents />
      </Suspense>
      <ConversionAnalyticsScript />
      <SetupContent />
      <LoadStats loadBefore showToast={false} />
    </>
  );
}
