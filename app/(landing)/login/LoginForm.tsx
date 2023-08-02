"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const error = searchParams?.get("error");
  const [clickedGoogle, setClickedGoogle] = useState(false);

  return (
    <div className="flex flex-col space-y-3 px-4 py-8 sm:px-16">
      <Button
        onClick={() => {
          setClickedGoogle(true);
          signIn("google", {
            consent: error === "RefreshAccessTokenError",
            ...(next && next.length > 0
              ? { callbackUrl: next }
              : { callbackUrl: "/mail" }),
          });
        }}
        loading={clickedGoogle}
        size="2xl"
        // icon={<Google className="h-4 w-4" />}
      >
        Continue with Google
      </Button>
    </div>
  );
}
