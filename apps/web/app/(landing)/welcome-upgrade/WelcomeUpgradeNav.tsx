"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { logOut } from "@/utils/user";

export function WelcomeUpgradeNav() {
  return (
    <nav className="w-full px-6 py-4">
      <div className="flex justify-end gap-2">
        <Button asChild variant="ghost">
          <Link href="/settings">Account</Link>
        </Button>
        <Button
          onClick={() => {
            logOut("/");
          }}
          variant="ghost"
        >
          Log out
        </Button>
      </div>
    </nav>
  );
}
