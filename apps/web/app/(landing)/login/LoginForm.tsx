"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const error = searchParams?.get("error");
  const [clickedGoogle, setClickedGoogle] = useState(false);

  return (
    <div className="px-4 pt-4 sm:px-16">
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
      >
        <span className="flex items-center justify-center">
          <Image
            src="/images/google.svg"
            alt=""
            width={24}
            height={24}
            unoptimized
          />
          <span className="ml-2">Sign in with Google</span>
        </span>
      </Button>
    </div>
  );
}
