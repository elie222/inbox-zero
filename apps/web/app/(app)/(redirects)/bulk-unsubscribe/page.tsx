import { redirectToEmailAccountPath } from "@/utils/account";

export default async function BulkUnsubscribePage() {
  await redirectToEmailAccountPath("/bulk-unsubscribe");
}
