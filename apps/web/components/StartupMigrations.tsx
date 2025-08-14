import { runStartupMigrations } from "@/utils/startup";

/**
 * Server component that runs startup migrations
 * This component will run on the server side when the app loads
 */
export async function StartupMigrations() {
  // Run migrations on server side during page load
  await runStartupMigrations();

  // Return nothing - this is just for side effects
  return null;
}
