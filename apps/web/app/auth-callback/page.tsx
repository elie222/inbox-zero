import { BRAND_NAME } from "@/utils/branding";
export default function AuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="text-muted-foreground text-sm">
        Return to {BRAND_NAME} to finish signing in.
      </p>
    </main>
  );
}
