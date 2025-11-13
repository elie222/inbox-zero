"use client";

import { useState } from "react";
import { Dialog, DialogPanel } from "@headlessui/react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import {
  MenuIcon,
  XIcon,
  HomeIcon,
  UserIcon,
  RocketIcon,
  BuildingIcon,
  HeadphonesIcon,
  ShoppingCartIcon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { EXTENSION_URL } from "@/utils/config";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

const navigation = [
  { name: "Enterprise", href: "/enterprise" },
  { name: "Open Source", href: "/github", target: "_blank" as const },
  {
    name: "Extension",
    href: EXTENSION_URL,
    target: "_blank" as const,
  },
  { name: "Pricing", href: "/#pricing" },
];

const useCases = [
  {
    title: "Founders",
    href: "/founders",
    description: "Scale your startup while AI handles your inbox",
    icon: RocketIcon,
    gradient: "from-purple-600 to-blue-600",
    hoverBg: "hover:from-purple-50 hover:to-blue-50",
  },
  {
    title: "Small Business",
    href: "/small-business",
    description: "Grow your business with automated email management",
    icon: BuildingIcon,
    gradient: "from-green-500 to-emerald-600",
    hoverBg: "hover:from-green-50 hover:to-emerald-50",
  },
  {
    title: "Content Creators",
    href: "/creator",
    description: "Streamline brand partnerships and collaborations",
    icon: UserIcon,
    gradient: "from-blue-500 to-cyan-500",
    hoverBg: "hover:from-blue-50 hover:to-cyan-50",
  },
  {
    title: "Real Estate",
    href: "/real-estate",
    description: "AI email management for real estate professionals",
    icon: HomeIcon,
    gradient: "from-purple-500 to-pink-500",
    hoverBg: "hover:from-purple-50 hover:to-pink-50",
  },
  {
    title: "Customer Support",
    href: "/support",
    description: "Deliver faster support with AI-powered responses",
    icon: HeadphonesIcon,
    gradient: "from-orange-500 to-red-500",
    hoverBg: "hover:from-orange-50 hover:to-red-50",
  },
  {
    title: "E-commerce",
    href: "/ecommerce",
    description: "Automate order updates and customer communications",
    icon: ShoppingCartIcon,
    gradient: "from-teal-500 to-cyan-600",
    hoverBg: "hover:from-teal-50 hover:to-cyan-50",
  },
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

        {/* Desktop Navigation */}
        <div className="hidden lg:flex lg:items-center lg:gap-x-8">
          <NavigationMenu>
            <NavigationMenuList>
              {/* Solutions Dropdown */}
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm font-semibold leading-6 text-gray-900">
                  Solutions
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[640px] grid-cols-2 gap-2 p-4">
                    {useCases.map((useCase) => (
                      <EnhancedListItem
                        key={useCase.title}
                        title={useCase.title}
                        href={useCase.href}
                        icon={useCase.icon}
                        gradient={useCase.gradient}
                        hoverBg={useCase.hoverBg}
                      >
                        {useCase.description}
                      </EnhancedListItem>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>

              {/* Regular Navigation Items */}
              {navigation.map((item) => (
                <NavigationMenuItem key={item.name}>
                  <NavigationMenuLink
                    asChild
                    className={navigationMenuTriggerStyle()}
                  >
                    <Link
                      href={item.href}
                      target={item.target}
                      prefetch={item.target !== "_blank"}
                      className="text-sm font-semibold leading-6 text-gray-900"
                    >
                      {item.name}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        </div>

        <div className="hidden gap-2 lg:flex lg:flex-1 lg:justify-end">
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <Link
              href="/login"
              onClick={() => {
                landingPageAnalytics.logInClicked(posthog, "top-nav");
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
                landingPageAnalytics.signUpClicked(posthog, "top-nav");
                setMobileMenuOpen(false);
              }}
            >
              Sign up
            </Link>
          </Button>
        </div>
      </nav>

      {/* Mobile Menu */}
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
                {/* Solutions in Mobile */}
                <div className="space-y-3">
                  <div className="px-3 py-2 text-sm font-semibold text-gray-900">
                    Solutions
                  </div>
                  {useCases.map((useCase) => {
                    const IconComponent = useCase.icon;
                    return (
                      <Link
                        key={useCase.title}
                        href={useCase.href}
                        className="-mx-3 flex items-center gap-3 rounded-lg px-3 py-3 text-sm leading-7 text-gray-600 hover:bg-gray-50"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-r ${useCase.gradient}`}
                        >
                          <IconComponent className="h-4 w-4 text-white" />
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">
                            {useCase.title}
                          </div>
                          <div className="text-xs text-gray-500">
                            {useCase.description}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Regular Navigation in Mobile */}
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    target={item.target}
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
                    landingPageAnalytics.logInClicked(posthog, "top-nav");
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

function EnhancedListItem({
  title,
  children,
  href,
  icon: Icon,
  gradient,
  hoverBg,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & {
  href: string;
  icon: React.ComponentType<any>;
  gradient: string;
  hoverBg: string;
}) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className={cn(
            "group block select-none space-y-1 rounded-xl p-4 leading-none no-underline outline-none transition-all duration-200 hover:bg-gradient-to-r focus:bg-accent focus:text-accent-foreground",
            hoverBg,
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-r shadow-sm transition-transform",
                gradient,
              )}
            >
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-none text-gray-900 group-hover:text-gray-800">
                {title}
              </div>
              <p className="mt-1 text-sm leading-snug text-gray-600 group-hover:text-gray-700">
                {children}
              </p>
            </div>
          </div>
        </Link>
      </NavigationMenuLink>
    </li>
  );
}
