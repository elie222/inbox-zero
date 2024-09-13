import { BulkUnsubscribe } from "./BulkUnsubscribe";
import { redirectToWelcomeUpgrade } from "@/utils/premium/redirect-to-welcome-upgrade";

export default async function BulkUnsubscribePage() {
  const component = await redirectToWelcomeUpgrade();
  if (component) return component;

  return <BulkUnsubscribe />;
}
