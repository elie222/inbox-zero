"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";

// Declare the custom element type
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & { "agent-id": string },
        HTMLElement
      >;
    }
  }
}

interface ElevenLabsConvaiProps {
  agentId: string;
  className?: string;
}

export const ElevenLabsConvai = ({
  agentId,
  className,
}: ElevenLabsConvaiProps) => {
  const scriptLoaded = useRef(false);
  const router = useRouter();

  useEffect(() => {
    // Add event listener for the widget
    const widget = document.querySelector("elevenlabs-convai");
    if (widget) {
      const handleCall = (event: any) => {
        console.log("ElevenLabs Convai call event:", event.detail);

        event.detail.config.clientTools = {
          startCleaner: ({
            archive,
            olderThanDays,
            instructions,
          }: {
            archive: string;
            olderThanDays: number;
            instructions: string;
          }) => {
            const encodedArchive = encodeURIComponent(archive);
            const encodedOlderThanDays = encodeURIComponent(olderThanDays);
            const encodedInstructions = encodeURIComponent(instructions);

            const searchParams = new URLSearchParams({
              archive: encodedArchive,
              olderThanDays: encodedOlderThanDays,
              instructions: encodedInstructions,
            });
            const path = `/cleaner?${searchParams.toString()}`;

            router.push(path);
          },
        };
      };

      widget.addEventListener("elevenlabs-convai:call", handleCall);

      // Cleanup function
      return () => {
        widget.removeEventListener("elevenlabs-convai:call", handleCall);
        scriptLoaded.current = false;
      };
    }
  }, [router]);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <style jsx global>{`
        elevenlabs-convai {
          position: relative !important;
          bottom: auto !important;
          right: auto !important;
        }
      `}</style>
      <elevenlabs-convai agent-id={agentId} className={className} />
      <Script
        src="https://elevenlabs.io/convai-widget/index.js"
        strategy="lazyOnload"
        onLoad={() => {
          scriptLoaded.current = true;
        }}
      />
    </div>
  );
};
