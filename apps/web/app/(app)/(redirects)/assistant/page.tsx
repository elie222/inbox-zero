import { redirectToEmailAccountPath } from "@/utils/account";

export default async function AssistantPage() {
  await redirectToEmailAccountPath("/assistant");
}
