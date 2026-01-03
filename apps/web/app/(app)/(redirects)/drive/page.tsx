import { redirectToEmailAccountPath } from "@/utils/account";

export default async function DrivePage() {
  await redirectToEmailAccountPath("/drive");
}
