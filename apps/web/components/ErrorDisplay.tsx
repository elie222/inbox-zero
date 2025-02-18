"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Panel } from "./Panel";
import { logOut } from "@/utils/user";
import { env } from "@/env";

// TODO would be better to have a consistent definition here. didn't want to break things.
export function ErrorDisplay(props: {
  error: { info?: { error: string }; error?: string };
}) {
  if (props.error?.info?.error || props.error?.error)
    return (
      <NotFound>
        <p>There was an error:</p>
        <p>{props.error?.info?.error || props.error?.error}</p>
      </NotFound>
    );

  if (props.error) {
    return (
      <NotFound>
        <p>There was an error.</p>
        <p>
          Please refresh or contact support at{" "}
          <a href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}>
            {env.NEXT_PUBLIC_SUPPORT_EMAIL}
          </a>{" "}
          if the error persists.
        </p>
      </NotFound>
    );
  }

  return null;
}

const NotFound = (props: { children: React.ReactNode }) => {
  return (
    <div className="text-gray-700">
      <Panel>{props.children}</Panel>
    </div>
  );
};

export const NotLoggedIn = () => {
  return (
    <div className="flex flex-col items-center justify-center sm:p-20 md:p-32">
      <div className="text-lg text-gray-700">You are not signed in 😞</div>
      <Button
        variant="outline"
        className="mt-2"
        onClick={() => logOut("/login")}
      >
        Sign in
      </Button>
      <div className="mt-8">
        <Image
          src="/images/illustrations/falling.svg"
          alt=""
          width={400}
          height={400}
          unoptimized
          className="dark:brightness-90 dark:invert"
        />
      </div>
    </div>
  );
};
