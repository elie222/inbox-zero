"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { cn } from "@/utils";

interface EnableFeatureCardProps {
  title: string;
  description: React.ReactNode;
  extraDescription?: React.ReactNode;
  imageSrc: string;
  imageAlt: string;
  buttonText: string;
  href?: string;
  hideBorder?: boolean;
  onEnable?: () => Promise<void>;
}

export function EnableFeatureCard({
  title,
  description,
  extraDescription,
  imageSrc,
  imageAlt,
  buttonText,
  href,
  hideBorder,
  onEnable,
}: EnableFeatureCardProps) {
  const [loading, setLoading] = useState(false);

  const handleEnable = async () => {
    setLoading(true);
    await onEnable?.();
    setLoading(false);
  };

  return (
    <Card
      className={cn(
        "mx-4 mt-10 max-w-2xl p-6 md:mx-auto",
        hideBorder && "border-none shadow-none",
      )}
    >
      <div className="text-center">
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={200}
          height={200}
          className="mx-auto dark:brightness-90 dark:invert"
          unoptimized
        />

        <TypographyH3 className="mt-2">{title}</TypographyH3>
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          {description}
        </SectionDescription>
        {extraDescription}
        <div className="mt-6">
          {href ? (
            <Button asChild>
              <Link href={href}>{buttonText}</Link>
            </Button>
          ) : (
            <Button loading={loading} onClick={handleEnable}>
              {buttonText}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
