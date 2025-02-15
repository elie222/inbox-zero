"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signIn } from "next-auth/react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import {
  BarChartIcon,
  ChevronDownIcon,
  InboxIcon,
  LogOutIcon,
  RibbonIcon,
  Users2Icon,
} from "lucide-react";
import { Button } from "@/components/Button";
import { logOut } from "@/utils/user";
import { env } from "@/env";
import { cn } from "@/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const userNavigation = [
  ...(env.NEXT_PUBLIC_DISABLE_TINYBIRD
    ? []
    : [
        {
          name: "New Senders",
          href: "/new-senders",
          icon: Users2Icon,
        },
      ]),
  { name: "Usage", href: "/usage", icon: BarChartIcon },
  {
    name: "Mail (Alpha)",
    href: "/mail",
    icon: InboxIcon,
  },
  {
    name: "Early Access",
    href: "/early-access",
    icon: RibbonIcon,
  },
  {
    name: "Sign out",
    href: "#",
    icon: LogOutIcon,
    onClick: () => logOut(window.location.origin),
  },
];

export function TopNav({ trigger }: { trigger: React.ReactNode }) {
  return (
    <div className="content-container flex h-16 shrink-0 items-center gap-x-4 border-b border-border bg-background shadow-sm sm:gap-x-6">
      {trigger}
      {/* Separator */}
      <div className="h-6 w-px bg-border" aria-hidden="true" />

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="ml-auto flex items-center gap-x-4 lg:gap-x-6">
          <ProfileDropdown />
        </div>
      </div>
    </div>
  );
}

function ProfileDropdown() {
  const { data: session, status } = useSession();

  if (session?.user) {
    return (
      <Menu as="div" className="relative z-50">
        <MenuButton className="-m-1.5 flex items-center p-1.5">
          <span className="sr-only">Open user menu</span>
          {session.user.image ? (
            <Image
              width={32}
              height={32}
              className="rounded-full bg-muted"
              src={session.user.image}
              alt="Profile"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-primary" />
          )}
          <span className="hidden lg:flex lg:items-center">
            <span
              className="ml-4 text-sm font-semibold leading-6 text-foreground"
              aria-hidden="true"
            >
              {session.user.name || "Account"}
            </span>
            <ChevronDownIcon
              className="ml-2 h-5 w-5 text-muted-foreground"
              aria-hidden="true"
            />
          </span>
        </MenuButton>
        <Transition
          as="div"
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <MenuItems className="absolute right-0 z-20 mt-2.5 w-52 origin-top-right rounded-md bg-popover py-2 shadow-lg ring-1 ring-border focus:outline-none">
            <MenuItem>
              <div className="truncate border-b border-border px-3 pb-2 text-sm text-muted-foreground">
                {session.user.email}
              </div>
            </MenuItem>
            <MenuItem>{({ focus }) => <ThemeToggle focus={focus} />}</MenuItem>
            {userNavigation.map((item) => (
              <MenuItem key={item.name}>
                {({ focus }) => (
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center px-3 py-1 text-sm leading-6 text-foreground",
                      focus && "bg-accent",
                    )}
                    onClick={item.onClick}
                  >
                    {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                    {item.name}
                  </Link>
                )}
              </MenuItem>
            ))}
          </MenuItems>
        </Transition>
      </Menu>
    );
  }

  return (
    <Button
      color="transparent"
      onClick={() => signIn()}
      loading={status === "loading"}
    >
      Sign in
    </Button>
  );
}
