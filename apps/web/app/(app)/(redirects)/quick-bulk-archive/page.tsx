import { redirectToEmailAccountPath } from "@/utils/account";

export default async function QuickBulkArchivePage() {
  await redirectToEmailAccountPath("/quick-bulk-archive");
}
