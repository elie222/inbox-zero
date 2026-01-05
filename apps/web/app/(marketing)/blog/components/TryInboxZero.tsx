import Image from "next/image";
import Link from "next/link";
import { env } from "@/env";

export function TryInboxZero() {
  return (
    <Link
      href={`${env.NEXT_PUBLIC_BASE_URL}/?utm_source=blog&utm_medium=inbox-zero`}
      className="block rounded-lg border-2 border-blue-400 bg-white shadow-xl transition-transform duration-300 hover:scale-105"
    >
      <Image
        src="/images/reach-inbox-zero.png"
        alt="Inbox Zero"
        width={320}
        height={240}
        className="w-full rounded-t-lg shadow"
      />
      <p className="p-4 text-gray-700">
        Let AI handle your emails, unsubscribe from newsletters, and block
        unwanted messages.
      </p>
      <div className="mx-4 mb-4 rounded-md bg-blue-600 px-4 py-2 text-center text-white">
        Try Inbox Zero
      </div>
    </Link>
  );
}
