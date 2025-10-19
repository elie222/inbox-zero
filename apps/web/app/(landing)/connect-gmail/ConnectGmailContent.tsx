"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { usePostHog } from "posthog-js/react";
import {
  IconBrandGoogle,
  IconMail,
  IconSparkles,
  IconClock,
} from "@tabler/icons-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { AlertBasic } from "@/components/Alert";
import { useSession } from "@/utils/auth-client";
import useSWR from "swr";

interface ConnectGmailContentProps {
  userName: string;
}

type GetGmailAuthUrlResponse = { url: string };

export function ConnectGmailContent({ userName }: ConnectGmailContentProps) {
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const error = searchParams?.get("error");

  const { data: authUrlData, isLoading: isLoadingAuthUrl } = useSWR<
    GetGmailAuthUrlResponse,
    { error: string }
  >(session?.user ? "/api/google/gmail/auth-url" : null, {
    onError: (error) => {
      console.error("Error fetching Gmail auth URL:", error);
    },
  });

  const handleConnect = async () => {
    posthog?.capture("connect_gmail_clicked", {
      user_name: userName,
    });

    if (authUrlData?.url) {
      setLoading(true);
      window.location.href = authUrlData.url;
    }
  };

  const benefits = [
    {
      icon: <IconMail className="size-5" />,
      text: "Placeholder 1",
    },
    {
      icon: <IconSparkles className="size-5" />,
      text: "Placeholder 2",
    },
    {
      icon: <IconClock className="size-5" />,
      text: "Placeholder 3",
    },
  ];

  return (
    <div className="flex flex-col text-center space-y-6">
      <div className="space-y-4">
        <PageHeading>Connect your inbox.</PageHeading>
        <TypographyP className="text-lg">
          Unlock calm, twice-daily briefs that summarize what matters most —
          securely and privately.
        </TypographyP>
      </div>

      {error && (
        <AlertBasic
          variant="destructive"
          title="Connection failed"
          description="There was an error connecting your Gmail account. Please try again."
        />
      )}

      <div className="grid gap-4 mt-8">
        {benefits.map((benefit, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-gray-50 border border-gray-100"
          >
            <div className="flex-shrink-0 text-blue-600 mt-0.5">
              {benefit.icon}
            </div>
            <div className="text-left">
              <p className="text-sm text-gray-900">{benefit.text}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6">
        <Button
          onClick={handleConnect}
          size="lg"
          className="w-full sm:w-auto px-8"
          loading={loading || isLoadingAuthUrl}
          disabled={!authUrlData?.url}
        >
          <IconBrandGoogle className="mr-2" size={20} />
          Continue with Gmail
        </Button>
      </div>

      <TypographyP className="text-xs text-gray-500 pt-2">
        Inbox Zero{"'"}s use and transfer of information received from Google
        APIs to any other app will adhere to{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          className="underline underline-offset-4 hover:text-gray-900"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </TypographyP>
    </div>
  );
}
