import { BulkUnsubscribe } from "./BulkUnsubscribe";
import { checkAndRedirectForUpgrade } from "@/utils/premium/check-and-redirect-for-upgrade";

export default async function BulkUnsubscribePage() {
  await checkAndRedirectForUpgrade();
  return <BulkUnsubscribe />;
}
