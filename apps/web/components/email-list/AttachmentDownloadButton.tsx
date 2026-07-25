"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { toastError } from "@/components/Toast";

// The attachment endpoint runs behind withEmailProvider, which requires the
// X-Email-Account-ID header. A plain <a>/target=_blank navigation can't send
// custom headers, so it 403s. Fetch the bytes with the header (cookies ride
// along same-origin) and save them via an object URL instead.
export function AttachmentDownloadButton({
  url,
  filename,
}: {
  url: string;
  filename: string;
}) {
  const { emailAccountId } = useAccount();
  const [downloading, setDownloading] = useState(false);

  const download = async () => {
    setDownloading(true);
    try {
      const response = await fetch(url, {
        headers: { [EMAIL_ACCOUNT_HEADER]: emailAccountId },
      });
      if (!response.ok) throw new Error(`Download failed (${response.status})`);

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : "Could not download attachment",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      Icon={DownloadIcon}
      loading={downloading}
      onClick={download}
    >
      Download
    </Button>
  );
}
