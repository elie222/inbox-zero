import { redirectToEmailAccountPath } from "@/utils/account";

export default async function MailPage() {
  await redirectToEmailAccountPath("/mail");
}
