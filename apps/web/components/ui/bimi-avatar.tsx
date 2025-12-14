"use client";

import { useState, useCallback, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { cn } from "@/utils";

/**
 * Get the first letter character from a name or email for avatar fallback
 */
export const getFirstLetterCharacter = (name?: string): string => {
  if (!name) return "";
  const match = name.match(/[a-zA-Z]/);
  return match ? match[0].toUpperCase() : "";
};

/**
 * Extract domain from email address
 */
const getDomainFromEmail = (email: string): string => {
  const parts = email.split("@");
  return parts[1] || "";
};

/**
 * Get company logo URL from email domain using Clearbit's logo API
 * Falls back to Google's favicon service for smaller domains
 */
export const getEmailLogo = (email: string): string => {
  const domain = getDomainFromEmail(email);
  if (!domain) return "";

  // Use Clearbit's logo API (free tier) - returns company logos
  return `https://logo.clearbit.com/${domain}`;
};

/**
 * Get fallback favicon URL using Google's favicon service
 */
export const getFaviconUrl = (email: string): string => {
  const domain = getDomainFromEmail(email);
  if (!domain) return "";

  // Google's favicon service as a fallback
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
};

interface BimiAvatarProps {
  email?: string;
  name?: string;
  className?: string;
  fallbackClassName?: string;
  size?: "sm" | "md" | "lg";
  onImageError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/**
 * BIMI Avatar component that displays company logos for email senders
 * Falls back to initials if no logo is found
 */
export function BimiAvatar({
  email,
  name,
  className,
  fallbackClassName,
  size = "md",
  onImageError,
}: BimiAvatarProps) {
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const [faviconLoadFailed, setFaviconLoadFailed] = useState(false);

  const sizeClasses = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  const firstLetter = getFirstLetterCharacter(name || email);

  const logoUrl = useMemo(() => {
    if (!email || logoLoadFailed) return "";
    return getEmailLogo(email);
  }, [email, logoLoadFailed]);

  const faviconUrl = useMemo(() => {
    if (!email || faviconLoadFailed) return "";
    return getFaviconUrl(email);
  }, [email, faviconLoadFailed]);

  const handleLogoError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setLogoLoadFailed(true);
      onImageError?.(e);
    },
    [onImageError],
  );

  const handleFaviconError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      setFaviconLoadFailed(true);
      onImageError?.(e);
    },
    [onImageError],
  );

  // Fallback colors based on first letter
  const colors = [
    "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    "bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400",
    "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400",
    "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400",
    "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-400",
    "bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-400",
  ];

  const colorIndex = firstLetter
    ? (firstLetter.charCodeAt(0) - 65) % colors.length
    : 0;

  if (!email) {
    return (
      <Avatar
        className={cn(
          sizeClasses[size],
          "rounded-full border dark:border-none",
          className,
        )}
      >
        <AvatarFallback
          className={cn(
            "rounded-full font-semibold",
            colors[Math.abs(colorIndex)],
            fallbackClassName,
          )}
        >
          {firstLetter}
        </AvatarFallback>
      </Avatar>
    );
  }

  return (
    <Avatar
      className={cn(
        sizeClasses[size],
        "rounded-full border dark:border-none",
        className,
      )}
    >
      {/* Try Clearbit logo first */}
      {!logoLoadFailed && logoUrl && (
        <AvatarImage
          className="rounded-full bg-white object-contain p-0.5 dark:bg-zinc-800"
          src={logoUrl}
          alt={name || email}
          onError={handleLogoError}
        />
      )}

      {/* Try favicon as second fallback */}
      {logoLoadFailed && !faviconLoadFailed && faviconUrl && (
        <AvatarImage
          className="rounded-full bg-white object-contain p-1 dark:bg-zinc-800"
          src={faviconUrl}
          alt={name || email}
          onError={handleFaviconError}
        />
      )}

      {/* Letter fallback */}
      <AvatarFallback
        className={cn(
          "rounded-full font-semibold",
          colors[Math.abs(colorIndex)],
          fallbackClassName,
        )}
      >
        {firstLetter}
      </AvatarFallback>
    </Avatar>
  );
}
