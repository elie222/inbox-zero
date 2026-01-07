import type { ReactNode } from "react";
import Image from "next/image";
import { Card, CardFooter } from "@/components/ui/card";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";

type FeatureItem = {
  icon: ReactNode;
  title: string;
  description: string;
};

export function SetupCard({
  imageSrc,
  imageAlt,
  title,
  description,
  features,
  children,
}: {
  imageSrc: string;
  imageAlt: string;
  title: string;
  description: string;
  features: FeatureItem[];
  children: ReactNode;
}) {
  return (
    <Card className="mx-4 mt-10 max-w-lg p-6 md:mx-auto">
      <Image
        src={imageSrc}
        alt={imageAlt}
        width={200}
        height={200}
        className="mx-auto dark:brightness-90 dark:invert"
        unoptimized
      />

      <div className="text-center">
        <TypographyH3 className="mt-2">{title}</TypographyH3>
        <SectionDescription className="mx-auto mt-2 max-w-prose">
          {description}
        </SectionDescription>
      </div>

      <ItemGroup className="mt-6">
        {features.map((feature) => (
          <Item key={feature.title}>
            {feature.icon}
            <ItemContent>
              <ItemTitle>{feature.title}</ItemTitle>
              <ItemDescription>{feature.description}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>

      <CardFooter className="mt-6 flex flex-col items-center gap-4">
        {children}
      </CardFooter>
    </Card>
  );
}
