import { Fragment } from "react";
import Link from "next/link";
import clsx from "clsx";
import { useSession, signIn } from "next-auth/react";
import { Menu, Transition } from "@headlessui/react";
import {
  BarChartIcon,
  ChevronDownIcon,
  InboxIcon,
  LogOutIcon,
  MenuIcon,
  Users2Icon,
} from "lucide-react";
import { Button } from "@/components/Button";
import { logOut } from "@/utils/user";
import { env } from "@/env.mjs";

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
  {
    name: "Mail (Beta)",
    href: "/mail",
    icon: InboxIcon,
  },
  { name: "Usage", href: "/usage", icon: BarChartIcon },
  {
    name: "Sign out",
    href: "#",
    icon: LogOutIcon,
    onClick: () => logOut(window.location.origin),
  },
];

export function TopNav(props: { setSidebarOpen: (open: boolean) => void }) {
  return (
    <div className="content-container flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white shadow-sm sm:gap-x-6">
      <button
        type="button"
        className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
        onClick={() => props.setSidebarOpen(true)}
      >
        <span className="sr-only">Open sidebar</span>
        <MenuIcon className="h-6 w-6" aria-hidden="true" />
      </button>

      {/* Separator */}
      <div className="h-6 w-px bg-gray-900/10 lg:hidden" aria-hidden="true" />

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
      <Menu as="div" className="relative">
        <Menu.Button className="-m-1.5 flex items-center p-1.5">
          <span className="sr-only">Open user menu</span>
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="h-8 w-8 rounded-full bg-gray-50"
              src={session.user.image}
              alt="Profile"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-blue-500" />
          )}
          <span className="hidden lg:flex lg:items-center">
            <span
              className="ml-4 text-sm font-semibold leading-6 text-gray-900"
              aria-hidden="true"
            >
              {session.user.name || "Account"}
            </span>
            <ChevronDownIcon
              className="ml-2 h-5 w-5 text-gray-400"
              aria-hidden="true"
            />
          </span>
        </Menu.Button>
        <Transition
          as={Fragment}
          enter="transition ease-out duration-100"
          enterFrom="transform opacity-0 scale-95"
          enterTo="transform opacity-100 scale-100"
          leave="transition ease-in duration-75"
          leaveFrom="transform opacity-100 scale-100"
          leaveTo="transform opacity-0 scale-95"
        >
          <Menu.Items className="absolute right-0 z-20 mt-2.5 w-52 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5 focus:outline-none">
            <Menu.Item>
              <div className="truncate border-b border-gray-200 px-3 pb-2 text-sm">
                {session.user.email}
              </div>
            </Menu.Item>
            {userNavigation.map((item) => (
              <Menu.Item key={item.name}>
                {({ active }) => (
                  <Link
                    href={item.href}
                    className={clsx(
                      active ? "bg-gray-50" : "",
                      "flex items-center px-3 py-1 text-sm leading-6 text-gray-900",
                    )}
                    onClick={item.onClick}
                  >
                    {item.icon && <item.icon className="mr-2 h-4 w-4" />}
                    {item.name}
                  </Link>
                )}
              </Menu.Item>
            ))}
          </Menu.Items>
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
