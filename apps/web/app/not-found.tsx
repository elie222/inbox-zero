"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ErrorPage } from "@/components/ErrorPage";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Button } from "@/components/ui/button";
import { createClientLogger } from "@/utils/logger-client";

const logger = createClientLogger("not-found");

export default function NotFound() {
  const pathname = usePathname();

  useEffect(() => {
    logger.warn("Page not found", { pathname });
  }, [pathname]);

  return (
    <BasicLayout>
      <ErrorPage
        title="Page Not Found"
        description="The page you are looking for could not be found."
        button={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/">Return Home</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="https://docs.getinboxzero.com">Documentation</Link>
            </Button>
          </div>
        }
      />
    </BasicLayout>
  );
}
