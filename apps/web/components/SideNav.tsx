"use client";

import { Fragment } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Dialog, Transition } from "@headlessui/react";
import clsx from "clsx";
import {
  ArchiveBoxArrowDownIcon,
  ChartBarIcon,
  ChatBubbleBottomCenterTextIcon,
  Cog6ToothIcon,
  InboxIcon,
  LightBulbIcon,
  SparklesIcon,
  StarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Logo } from "@/components/Logo";

const navigation = [
  { name: "Mail", href: "/mail", icon: InboxIcon },
  {
    name: "Planned",
    href: "/planned",
    icon: SparklesIcon,
  },
  {
    name: "Stats",
    href: "/stats",
    icon: ChartBarIcon,
  },
  // {
  //   name: "Subscriptions",
  //   href: "/stats",
  //   icon: ChartBarIcon,
  // },
  // {
  //   name: "No reply",
  //   href: "/no-reply",
  //   icon: ChatBubbleBottomCenterTextIcon,
  // },
  // {
  //   name: "Filters",
  //   href: "/filters",
  //   icon: ChartBarIcon,
  // },
  // {
  //   name: "Bulk Archive",
  //   href: "/bulk-archive",
  //   icon: ArchiveBoxArrowDownIcon,
  // },
];

const bottomLinks = [
  { name: "Star on GitHub", href: "/github", icon: StarIcon },
  { name: "Feature Requests", href: "/feature-requests", icon: LightBulbIcon },
  { name: "Settings", href: "/settings", icon: Cog6ToothIcon },
];

export function SideNav(props: {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) {
  return (
    <>
      <div className="h-full">
        <Transition.Root show={props.sidebarOpen} as={Fragment}>
          <Dialog
            as="div"
            className="relative z-50 lg:hidden"
            onClose={props.setSidebarOpen}
          >
            <Transition.Child
              as={Fragment}
              enter="transition-opacity ease-linear duration-300"
              enterFrom="opacity-0"
              enterTo="opacity-100"
              leave="transition-opacity ease-linear duration-300"
              leaveFrom="opacity-100"
              leaveTo="opacity-0"
            >
              <div className="fixed inset-0 bg-black/80" />
            </Transition.Child>

            <div className="fixed inset-0 flex">
              <Transition.Child
                as={Fragment}
                enter="transition ease-in-out duration-300 transform"
                enterFrom="-translate-x-full"
                enterTo="translate-x-0"
                leave="transition ease-in-out duration-300 transform"
                leaveFrom="translate-x-0"
                leaveTo="-translate-x-full"
              >
                <Dialog.Panel className="relative mr-16 flex w-full max-w-xs flex-1">
                  <Transition.Child
                    as={Fragment}
                    enter="ease-in-out duration-300"
                    enterFrom="opacity-0"
                    enterTo="opacity-100"
                    leave="ease-in-out duration-300"
                    leaveFrom="opacity-100"
                    leaveTo="opacity-0"
                  >
                    <div className="absolute left-full top-0 flex w-16 justify-center pt-5">
                      <button
                        type="button"
                        className="-m-2.5 p-2.5"
                        onClick={() => props.setSidebarOpen(false)}
                      >
                        <span className="sr-only">Close sidebar</span>
                        <XMarkIcon
                          className="h-6 w-6 text-white"
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  </Transition.Child>

                  <Sidebar isMobile />
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </Dialog>
        </Transition.Root>

        <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-60 lg:flex-col 2xl:w-72">
          <Sidebar isMobile={false} />
        </div>

        <main className="flex h-full flex-col lg:pl-60 2xl:pl-72">
          {props.topBar}

          {props.children}
        </main>
      </div>
    </>
  );
}

function Sidebar(props: { isMobile: boolean }) {
  const path = usePathname();

  return (
    <div
      className={clsx(
        "flex grow flex-col gap-y-5 overflow-y-auto bg-black px-6 pb-4",
        {
          "ring-1 ring-white/10": props.isMobile,
        }
      )}
    >
      <Link href="/mail">
        <div className="flex h-16 shrink-0 items-center text-white">
          <Logo className="h-4" />
        </div>
      </Link>
      <nav className="flex flex-1 flex-col">
        <ul role="list" className="flex flex-1 flex-col gap-y-7">
          <li>
            <ul role="list" className="-mx-2 space-y-1">
              {navigation.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    className={clsx(
                      item.href === path
                        ? "bg-gray-800 text-white"
                        : "text-gray-400 hover:bg-gray-800 hover:text-white",
                      "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6"
                    )}
                  >
                    <item.icon
                      className="h-6 w-6 shrink-0"
                      aria-hidden="true"
                    />
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </li>

          {/* <PromptHistory /> */}

          <li className="mt-auto">
            <ul role="list" className="-mx-2 space-y-1">
              {bottomLinks.map((link) => {
                return (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className={clsx(
                        "group flex gap-x-3 rounded-md p-2 text-sm font-semibold leading-6",
                        link.href === path
                          ? "bg-gray-800 text-white"
                          : "text-gray-400 hover:bg-gray-800 hover:text-white"
                      )}
                    >
                      <link.icon
                        className="h-6 w-6 shrink-0"
                        aria-hidden="true"
                      />
                      {link.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </li>
        </ul>
      </nav>
    </div>
  );
}
