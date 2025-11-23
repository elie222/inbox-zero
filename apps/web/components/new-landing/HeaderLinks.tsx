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

const navigation = [
  { name: "Enterprise", href: "/enterprise" },
  { name: "Open Source", href: "/github", target: "_blank" as const },
  { name: "Pricing", href: "/#pricing" },
];

const useCases = [
  {
    title: "Founders",
    href: "/founders",
    description: "Scale your startup while AI handles your inbox",
    icon: RocketIcon,
    iconColor: "text-header-purple-600",
    borderColor: "from-header-purple-200 to-header-purple-300",
    gradient: "from-header-purple-50 to-header-purple-100",
    hoverBg: "hover:bg-header-purple-50/[0.44]",
  },
  {
    title: "Small Business",
    href: "/small-business",
    description: "Grow your business with automated email management",
    icon: BuildingIcon,
    iconColor: "text-header-green-500",
    borderColor: "from-header-green-150 to-header-green-200",
    gradient: "from-header-green-50 to-header-green-100",
    hoverBg: "hover:bg-header-green-50",
  },
  {
    title: "Content Creators",
    href: "/creator",
    description: "Streamline brand partnerships and collaborations",
    icon: UserIcon,
    iconColor: "text-header-blue-600",
    borderColor: "from-header-blue-150 to-header-blue-200",
    gradient: "from-header-blue-50 to-header-blue-100",
    hoverBg: "hover:bg-header-blue-50/50",
  },
  {
    title: "Real Estate",
    href: "/real-estate",
    description: "AI email management for real estate professionals",
    icon: HomeIcon,
    iconColor: "text-header-pink-500",
    borderColor: "from-header-pink-150 to-header-pink-200",
    gradient: "from-header-pink-50 to-header-pink-100",
    hoverBg: "hover:bg-header-pink-50/[0.44]",
  },
  {
    title: "Customer Support",
    href: "/support",
    description: "Deliver faster support with AI-powered responses",
    icon: HeadphonesIcon,
    iconColor: "text-header-orange-600",
    borderColor: "from-header-orange-150 to-header-orange-200",
    gradient: "from-header-orange-50 to-header-orange-100",
    hoverBg: "hover:bg-header-orange-50/50",
  },
  {
    title: "E-commerce",
    href: "/ecommerce",
    description: "Automate order updates and customer communications",
    icon: ShoppingCartIcon,
    iconColor: "text-header-indigo-600",
    borderColor: "from-header-indigo-150 to-header-indigo-200",
    gradient: "from-header-indigo-50 to-header-indigo-100",
    hoverBg: "hover:bg-header-indigo-50/50",
  },
];

export function HeaderLinks() {
  return (
    <div className="hidden lg:flex lg:items-center lg:gap-x-8">
      <NavigationMenu>
        <NavigationMenuList>
          {/* Solutions Dropdown */}
          <NavigationMenuItem>
            <NavigationMenuTrigger className="text-sm font-semibold font-geist leading-6 text-gray-900">
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
                    iconColor={useCase.iconColor}
                    gradient={useCase.gradient}
                    borderColor={useCase.borderColor}
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
                  className="text-sm font-semibold font-geist leading-6 text-gray-900"
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
  iconColor,
  gradient,
  borderColor,
  hoverBg,
  ...props
}: React.ComponentPropsWithoutRef<"li"> & {
  href: string;
  icon: React.ComponentType<any>;
  iconColor: string;
  gradient: string;
  borderColor: string;
  hoverBg: string;
}) {
  return (
    <li {...props}>
      <NavigationMenuLink asChild>
        <Link
          href={href}
          className={cn(
            "group block select-none space-y-1 rounded-xl p-4 leading-none no-underline outline-none transition-all duration-200 focus:bg-accent focus:text-accent-foreground",
            hoverBg,
          )}
        >
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "p-px rounded-lg shadow-sm bg-gradient-to-b",
                borderColor,
              )}
            >
              <div
                className={cn(
                  "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[7px] bg-gradient-to-b shadow-sm transition-transform",
                  gradient,
                )}
              >
                <Icon className={cn("h-4 w-4", iconColor)} />
              </div>
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
