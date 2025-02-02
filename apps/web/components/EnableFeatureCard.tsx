"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import Link from "next/link";

interface EnableFeatureCardProps {
  title: string;
  description: string;
  imageSrc: string;
  imageAlt: string;
  buttonText: string;
  href?: string;
  onEnable?: () => void;
}

export function EnableFeatureCard({
  title,
  description,
  imageSrc,
  imageAlt,
  buttonText,
  href,
  onEnable,
}: EnableFeatureCardProps) {
  return (
    <Card className="mx-4 mt-10 max-w-2xl p-6 md:mx-auto">
      <div className="text-center">
        <Image
          src={imageSrc}
          alt={imageAlt}
          width={200}
          height={200}
          className="mx-auto"
        />

        <TypographyH3 className="mt-2">{title}</TypographyH3>
        <SectionDescription className="mt-2">{description}</SectionDescription>
        <div className="mt-6">
          {href ? (
            <Button asChild>
              <Link href={href}>{buttonText}</Link>
            </Button>
          ) : (
            <Button onClick={onEnable}>{buttonText}</Button>
          )}
        </div>
      </div>
    </Card>
  );
}
