import { AuthCallbackHandoff } from "./AuthCallbackHandoff";
import { getInboxZeroCustomSchemeCallbackUrl } from "@/utils/mobile-auth/app-callback-url";

export default async function AuthCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const appUrl = getInboxZeroCustomSchemeCallbackUrl(await searchParams);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      {appUrl ? <AuthCallbackHandoff href={appUrl} /> : null}
      <p className="text-muted-foreground text-sm">
        Return to Inbox Zero to finish signing in.
      </p>
      {appUrl ? (
        <a
          href={appUrl}
          className="text-sm font-medium text-foreground underline underline-offset-4"
        >
          Open Inbox Zero
        </a>
      ) : null}
    </main>
  );
}
