"use client";

import { useEffect, useState } from "react";
import { sso, signIn } from "@/utils/auth-client";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/Button";
import { SectionDescription } from "@/components/Typography";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WELCOME_PATH } from "@/utils/config";
import { env } from "@/env";

export function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams?.get("next");
  const error = searchParams?.get("error");

  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingMicrosoft, setLoadingMicrosoft] = useState(false);
  const [loadingOkta, setLoadingOkta] = useState(false);

  useEffect(() => {
    const initializeOkta = async () => {
      await sso.register({
        providerId: "okta",
        issuer: "https://integrator-9554919.okta.com",
        domain: "getinboxzero.com",
        oidcConfig: {
          clientId: env.OKTA_CLIENT_ID || "",
          clientSecret: env.OKTA_CLIENT_SECRET || "",
          discoveryEndpoint:
            "https://integrator-9554919.okta.com/.well-known/openid-configuration",
          scopes: ["openid", "profile", "email"],
          pkce: true,
        },
        mapping: {
          id: "sub",
          email: "email",
          emailVerified: "email_verified",
          name: "name",
          image: "picture",
        },
      });
    };

    initializeOkta();
  }, []);

  const handleGoogleSignIn = async () => {
    setLoadingGoogle(true);
    await signIn.social({
      provider: "google",
      errorCallbackURL: "/login/error",
      callbackURL: next && next.length > 0 ? next : WELCOME_PATH,
      ...(error === "RequiresReconsent" ? { consent: true } : {}),
    });
    setLoadingGoogle(false);
  };

  const handleMicrosoftSignIn = async () => {
    setLoadingMicrosoft(true);
    await signIn.social({
      provider: "microsoft",
      errorCallbackURL: "/login/error",
      callbackURL: next && next.length > 0 ? next : WELCOME_PATH,
      ...(error === "RequiresReconsent" ? { consent: true } : {}),
    });
    setLoadingMicrosoft(false);
  };

  const handleOktaSignIn = async () => {
    setLoadingOkta(true);
    try {
      await signIn.sso({
        providerId: "okta",
        callbackURL: next && next.length > 0 ? next : WELCOME_PATH,
      });
    } catch (error) {
      console.error("Okta sign-in failed:", error);
    } finally {
      setLoadingOkta(false);
    }
  };

  return (
    <div className="flex flex-col justify-center gap-2 px-4 sm:px-16">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="2xl">
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
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in</DialogTitle>
          </DialogHeader>
          <SectionDescription>
            Inbox Zero{"'"}s use and transfer of information received from
            Google APIs to any other app will adhere to{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="underline underline-offset-4 hover:text-gray-900"
            >
              Google API Services User Data
            </a>{" "}
            Policy, including the Limited Use requirements.
          </SectionDescription>
          <div>
            <Button loading={loadingGoogle} onClick={handleGoogleSignIn}>
              I agree
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Button
        size="2xl"
        loading={loadingMicrosoft}
        onClick={handleMicrosoftSignIn}
      >
        <span className="flex items-center justify-center">
          <Image
            src="/images/microsoft.svg"
            alt=""
            width={24}
            height={24}
            unoptimized
          />
          <span className="ml-2">Sign in with Microsoft</span>
        </span>
      </Button>

      <Button size="2xl" loading={loadingOkta} onClick={handleOktaSignIn}>
        <span className="flex items-center justify-center">
          {/* <Image
            src="/images/okta.svg"
            alt=""
            width={24}
            height={24}
            unoptimized
          /> */}
          <span className="ml-2">SSO with Okta</span>
        </span>
      </Button>
    </div>
  );
}
