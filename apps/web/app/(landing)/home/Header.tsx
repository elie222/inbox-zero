"use client";

import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { MenuIcon, XIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

const navigation = [
  { name: "Features", href: "/#features" },
  { name: "FAQ", href: "/#faq" },
  { name: "Open Source", href: "/github", target: "_blank" as const },
  { name: "Affiliates", href: "/affiliates", target: "_blank" as const },
  { name: "Pricing", href: "/#pricing" },
];

export function Header({ className }: { className?: string }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const posthog = usePostHog();

  return (
    <header className={cn("absolute inset-x-0 top-0 z-50", className)}>
      <nav
        className="flex items-center justify-between px-6 py-4 lg:px-8"
        aria-label="Global"
      >
        <div className="flex lg:flex-1">
          <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Inbox Zero</span>
            <Logo className="h-4 w-auto" />
          </Link>
        </div>
        <div className="flex lg:hidden">
          <button
            type="button"
            className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-gray-700"
            onClick={() => setMobileMenuOpen(true)}
          >
            <span className="sr-only">Open main menu</span>
            <MenuIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        <div className="hidden lg:flex lg:gap-x-12">
          {navigation.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              target={item.target}
              prefetch={item.target !== "_blank"}
              className="text-sm font-semibold leading-6 text-gray-900"
            >
              {item.name}
            </Link>
          ))}
        </div>
        <div className="hidden gap-2 lg:flex lg:flex-1 lg:justify-end">
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <Link
              href="/login"
              onClick={() => {
                posthog.capture("Clicked Log In", { position: "top-nav" });
                setMobileMenuOpen(false);
              }}
            >
              Log in
            </Link>
          </Button>
          <Button size="sm" variant="blue" className="rounded-full" asChild>
            <Link
              href="/login"
              onClick={() => {
                posthog.capture("Clicked Sign Up", { position: "top-nav" });
                setMobileMenuOpen(false);
              }}
            >
              Sign up
            </Link>
          </Button>

          {/* <Link
            href="/login"
            className="text-sm font-semibold leading-6 text-gray-900"
          >
            Log in <span aria-hidden="true">&rarr;</span>
          </Link> */}
        </div>
      </nav>
      <Dialog
        as="div"
        className="lg:hidden"
        open={mobileMenuOpen}
        onClose={setMobileMenuOpen}
      >
        <div className="fixed inset-0 z-50" />
        <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-white px-6 py-6 sm:max-w-sm sm:ring-1 sm:ring-gray-900/10">
          <div className="flex items-center justify-between">
            <Link href="#" className="-m-1.5 p-1.5">
              <span className="sr-only">Inbox Zero</span>
              <Logo className="h-4 w-auto" />
            </Link>
            <button
              type="button"
              className="-m-2.5 rounded-md p-2.5 text-gray-700"
              onClick={() => setMobileMenuOpen(false)}
            >
              <span className="sr-only">Close menu</span>
              <XIcon className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-6 flow-root">
            <div className="-my-6 divide-y divide-gray-500/10">
              <div className="space-y-2 py-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className="-mx-3 block rounded-lg px-3 py-2 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
              <div className="py-6">
                <Link
                  href="/login"
                  className="-mx-3 block rounded-lg px-3 py-2.5 text-base font-semibold leading-7 text-gray-900 hover:bg-gray-50"
                  onClick={() => {
                    posthog.capture("Clicked Log In", { position: "top-nav" });
                    setMobileMenuOpen(false);
                  }}
                >
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </DialogPanel>
      </Dialog>
    </header>
  );
}
