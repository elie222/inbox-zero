import Image from "next/image";
import Link from "next/link";
import { env } from "@/env";
import { Button } from "@/components/ui/button";

export function TryInboxZero() {
  return (
    <Link
      href={`${env.NEXT_PUBLIC_BASE_URL}/?utm_source=blog&utm_medium=inbox-zero`}
    >
      <div className="rounded-lg border-2 border-blue-400 bg-white shadow-xl transition-transform duration-300 hover:scale-105">
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
        <div className="px-4 pb-4">
          <Button className="w-full" variant="blue">
            Try Inbox Zero
          </Button>
        </div>
      </div>
    </Link>
  );
}
