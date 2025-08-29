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

  // Note: SSO provider registration requires authentication
  // It will be handled after the user signs in through another method
  // (Google, Microsoft, or email/password)

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

  // Register Okta SSO provider on component mount
  useEffect(() => {
    const registerOktaProvider = async () => {
      try {
        console.log("Registering Okta SSO provider...");
        await sso.register({
          providerId: "okta",
          issuer: "https://integrator-9554919.okta.com",
          domain: "getinboxzero.com",
          oidcConfig: {
            clientId: env.NEXT_PUBLIC_OKTA_CLIENT_ID || "",
            clientSecret: env.NEXT_PUBLIC_OKTA_CLIENT_SECRET || "",
            authorizationEndpoint:
              "https://integrator-9554919.okta.com/oauth2/v1/authorize",
            tokenEndpoint:
              "https://integrator-9554919.okta.com/oauth2/v1/token",
            jwksEndpoint: "https://integrator-9554919.okta.com/oauth2/v1/keys",
            discoveryEndpoint:
              "https://integrator-9554919.okta.com/.well-known/openid-configuration",
            scopes: ["openid", "email", "profile"],
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
        console.log("Okta SSO provider registered successfully");
      } catch (error) {
        console.error("Failed to register Okta SSO provider:", error);
      }
    };

    registerOktaProvider();
  }, []);

  const handleOktaSignIn = async () => {
    setLoadingOkta(true);
    try {
      const res = await signIn.sso({
        providerId: "okta",
        callbackURL: next && next.length > 0 ? next : WELCOME_PATH,
      });
      console.log("SSO sign-in response:", res);
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
