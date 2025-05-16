import { redirectToEmailAccountPath } from "@/utils/account";

export default async function CleanPage() {
  await redirectToEmailAccountPath("/clean");
}
