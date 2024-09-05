import React from "react";
import Image from "next/image";
import Link from "next/link";
import { env } from "@/env";

export function TryInboxZero() {
  return (
    <Link href={env.NEXT_PUBLIC_BASE_URL}>
      <div className="rounded-lg border-2 border-blue-400 bg-white shadow-xl transition-transform duration-300 hover:scale-105">
        <h2 className="p-4 text-xl font-semibold">Try Inbox Zero for free!</h2>
        <Image
          src="/images/reach-inbox-zero.png"
          alt="Inbox Zero"
          width={320}
          height={240}
          className="w-full shadow"
        />
        <p className="text- p-4 text-gray-700">
          Let AI handle your emails, unsubscribe from newsletters, and block
          unwanted messages.
        </p>
      </div>
    </Link>
  );
}
