import { redirectToEmailAccountPath } from "@/utils/account";

export default async function BriefsPage() {
  await redirectToEmailAccountPath("/briefs");
}
