"use client";

import { cn } from "@/utils";
import Image from "next/image";
import { useState } from "react";
import { getDomain } from "tldts";

function getFavicon(apexDomain: string) {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${apexDomain}&size=64`;
}

interface FallbackIconProps {
  seed: string;
}

export function FallbackIcon({ seed }: FallbackIconProps) {
  const hash = seed.split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const gradients = [
    "from-blue-300 to-blue-700",
    "from-purple-300 to-purple-700",
    "from-green-300 to-green-700",
    "from-emerald-300 to-emerald-700",
    "from-yellow-300 to-yellow-700",
    "from-orange-300 to-orange-700",
    "from-red-300 to-red-700",
    "from-indigo-300 to-indigo-700",
    "from-pink-300 to-pink-700",
    "from-fuchsia-300 to-fuchsia-700",
    "from-rose-300 to-rose-700",
    "from-sky-300 to-sky-700",
    "from-teal-300 to-teal-700",
    "from-violet-300 to-violet-700",
  ];

  const gradientIndex = hash % gradients.length;

  return (
    <div
      className={cn(
        "rounded-full size-5 z-10 bg-gradient-to-r",
        gradients[gradientIndex],
      )}
    />
  );
}

interface DomainIconProps {
  domain: string;
}

export function DomainIcon({ domain }: DomainIconProps) {
  const apexDomain = getDomain(domain) || domain;
  const domainFavicon = getFavicon(apexDomain);
  const [fallbackEnabled, setFallbackEnabled] = useState(false);

  return (
    <div className="size-5 overflow-hidden relative">
      {fallbackEnabled || !domainFavicon ? (
        <FallbackIcon seed={domain} />
      ) : (
        <Image
          width={20}
          height={20}
          src={domainFavicon}
          alt="favicon"
          className="z-10 rounded-full"
          onError={() => setFallbackEnabled(true)}
        />
      )}
    </div>
  );
}

interface SenderIconProps {
  domain: string;
  name: string;
}

function getInitials(name: string): string {
  const parts = name.split(/[\s@]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (parts[0]?.[0] || "?").toUpperCase();
}

export function SenderIcon({ domain, name }: SenderIconProps) {
  const apexDomain = getDomain(domain) || domain;
  const domainFavicon = apexDomain ? getFavicon(apexDomain) : null;
  const [fallbackEnabled, setFallbackEnabled] = useState(false);
  const initials = getInitials(name);

  const hash = (domain || name).split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const gradients = [
    "from-blue-400 to-blue-600",
    "from-purple-400 to-purple-600",
    "from-green-400 to-green-600",
    "from-emerald-400 to-emerald-600",
    "from-yellow-400 to-yellow-600",
    "from-orange-400 to-orange-600",
    "from-red-400 to-red-600",
    "from-indigo-400 to-indigo-600",
    "from-pink-400 to-pink-600",
    "from-fuchsia-400 to-fuchsia-600",
    "from-rose-400 to-rose-600",
    "from-sky-400 to-sky-600",
    "from-teal-400 to-teal-600",
    "from-violet-400 to-violet-600",
  ];

  const gradientIndex = hash % gradients.length;

  return (
    <div className="size-8 overflow-hidden relative flex-shrink-0 rounded-md">
      {fallbackEnabled || !domainFavicon ? (
        <div
          className={cn(
            "size-8 flex items-center justify-center text-white font-semibold text-xs bg-gradient-to-br",
            gradients[gradientIndex],
          )}
        >
          {initials}
        </div>
      ) : (
        <Image
          width={32}
          height={32}
          src={domainFavicon}
          alt={`${name} icon`}
          className="z-10 rounded-md object-cover"
          onError={() => setFallbackEnabled(true)}
        />
      )}
    </div>
  );
}
