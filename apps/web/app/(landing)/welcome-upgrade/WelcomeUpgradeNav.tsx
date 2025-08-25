"use client";

import { Button } from "@/components/ui/button";
import { logOut } from "@/utils/user";

export function WelcomeUpgradeNav() {
  return (
    <nav className="w-full px-6 py-4">
      <div className="flex justify-end">
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
