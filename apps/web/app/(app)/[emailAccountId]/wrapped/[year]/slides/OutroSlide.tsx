"use client";

import { motion } from "framer-motion";
import { Sparkles, Share2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SlideProps } from "./types";

export function OutroSlide({ data, year }: SlideProps) {
  const params = useParams<{ emailAccountId: string }>();

  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 p-8">
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 150 }}
        className="mb-8"
      >
        <Sparkles className="h-20 w-20 text-yellow-400" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-4xl md:text-6xl font-bold text-white text-center mb-4"
      >
        That's a Wrap!
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="text-xl text-white/70 text-center max-w-md mb-8"
      >
        Thanks for an amazing {year}. Here's to an even better {year + 1}!
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
        className="flex flex-col sm:flex-row gap-4"
      >
        <Button
          size="lg"
          className="bg-white text-purple-900 hover:bg-white/90"
          onClick={() => {
            const shareText = `Check out my ${year} Email Wrapped! 📧\n\n📬 ${data.volume.emailsReceived.toLocaleString()} emails received\n📤 ${data.volume.emailsSent.toLocaleString()} emails sent\n⏱️ ${data.aiImpact.hoursSaved}+ hours saved with AI\n\n#EmailWrapped #InboxZero`;
            const shareUrl = window.location.href;

            if (navigator.share) {
              navigator.share({
                title: `My ${year} Email Wrapped`,
                text: shareText,
                url: shareUrl,
              });
            } else {
              navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
            }
          }}
        >
          <Share2 className="mr-2 h-4 w-4" />
          Share Your Wrapped
        </Button>

        <Button
          size="lg"
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
          asChild
        >
          <Link href={`/${params.emailAccountId}/assistant`}>
            Back to Inbox
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-16 text-center"
      >
        <p className="text-sm text-white/40">
          Generated on{" "}
          {new Date(data.generatedAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </motion.div>
    </div>
  );
}
