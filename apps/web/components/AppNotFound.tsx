"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ErrorPage } from "@/components/ErrorPage";
import { Button } from "@/components/ui/button";
import { createClientLogger } from "@/utils/logger-client";

const logger = createClientLogger("not-found-app");

// Signed-in 404s render inside the app shell. The root not-found is wrapped in
// BasicLayout, whose marketing header offers "Log in" and "Get started free" —
// wrong for someone who is already authenticated.
export function AppNotFound() {
  const pathname = usePathname();

  useEffect(() => {
    logger.warn("Page not found", { pathname });
  }, [pathname]);

  return (
    <ErrorPage
      title="Page Not Found"
      description="The page you are looking for could not be found."
      button={
        <Button asChild>
          <Link href="/accounts">Back to your mail</Link>
        </Button>
      }
    />
  );
}
