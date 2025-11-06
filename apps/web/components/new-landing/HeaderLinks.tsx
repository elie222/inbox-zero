"use client";

import Link from "next/link";
import {
  HomeIcon,
  UserIcon,
  RocketIcon,
  BuildingIcon,
  HeadphonesIcon,
  ShoppingCartIcon,
} from "lucide-react";
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

export function HeaderLinks() {
  return (
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
