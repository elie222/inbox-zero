"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { UrlInstallForm } from "@/components/plugins/UrlInstallForm";
import { ArrowLeft } from "lucide-react";

export default function InstallPluginPage() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleBack = useCallback(() => {
    setIsNavigating(true);
    router.back();
  }, [router]);

  const handleSuccess = useCallback(() => {
    router.push("../plugins");
  }, [router]);

  return (
    <div className="content-container">
      <div className="mb-6">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          disabled={isNavigating}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Plugins
        </Button>
        <PageHeader title="Install Plugin from URL" />
      </div>

      <div className="mx-auto max-w-2xl">
        <UrlInstallForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
