import { redirectToEmailAccountPath } from "@/utils/account";

export default async function CalendarsPage() {
  await redirectToEmailAccountPath("/calendars");
}
