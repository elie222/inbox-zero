"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ErrorPage } from "@/components/ErrorPage";
import { BasicLayout } from "@/components/layouts/BasicLayout";
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
      />
    </BasicLayout>
  );
}
