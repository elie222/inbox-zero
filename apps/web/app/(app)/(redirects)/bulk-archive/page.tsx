import { redirectToEmailAccountPath } from "@/utils/account";

export default async function BulkArchivePage() {
  await redirectToEmailAccountPath("/bulk-archive");
}
