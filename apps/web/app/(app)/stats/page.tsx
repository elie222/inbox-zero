import { Stats } from "./Stats";
import { redirectToWelcomeUpgrade } from "@/utils/premium/redirect-to-welcome-upgrade";

export default async function StatsPage() {
  const component = await redirectToWelcomeUpgrade();
  if (component) return component;

  return <Stats />;
}
