"use client";

import { Button } from "@/components/ui/button";
import { logOut } from "@/utils/user";

export function WelcomeUpgradeNav() {
  return (
    <nav className="w-full px-6 py-3">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            logOut("/");
          }}
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
        >
          Log out
        </Button>
      </div>
    </nav>
  );
}
