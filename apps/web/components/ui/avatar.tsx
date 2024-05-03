"use client";

import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Image
    ref={ref}
    className={cn("aspect-square h-full w-full", className)}
    {...props}
  />
));
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

interface AvatarFallbackColorProps
  extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback> {
  content: string;
}

const AvatarFallbackColor = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  AvatarFallbackColorProps
>(({ content, className, ...props }, ref) => {
  const colors = [
    // "bg-gray-50 text-gray-600 ring-gray-500/10",
    "bg-red-50 text-red-700 ring-red-600/10",
    "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
    "bg-green-50 text-green-700 ring-green-600/10",
    "bg-blue-50 text-blue-700 ring-blue-600/10",
    "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
    "bg-purple-50 text-purple-700 ring-purple-600/10",
    "bg-pink-50 text-pink-700 ring-pink-600/10",
  ];

  const charCode = content.toUpperCase().charCodeAt(0);
  const colorIndex = (charCode - 65) % colors.length;

  return (
    <AvatarFallback
      ref={ref}
      className={cn(`${colors[colorIndex]}`, className)}
      {...props}
    >
      {content}
    </AvatarFallback>
  );
});
AvatarFallbackColor.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback, AvatarFallbackColor };
