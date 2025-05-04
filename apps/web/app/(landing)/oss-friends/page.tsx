import type { Metadata } from "next";
import Link from "next/link";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { Header } from "@/app/(landing)/home/Header";
import { Footer } from "@/app/(landing)/home/Footer";
import { CTA } from "@/app/(landing)/home/CTA";
import { HeroSubtitle, HeroText } from "@/app/(landing)/home/Hero";
import { CardBasic } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Open Source Friends | Inbox Zero",
  description: "Some other great Open Source projects to follow",
  alternates: { canonical: "/oss-friends" },
};

type OSSFriend = {
  href: string;
  name: string;
  description: string;
};

export default async function OSSFriendsPage() {
  try {
    const res = await fetch("https://formbricks.com/api/oss-friends");
    const data: { data: OSSFriend[] } = await res.json();

    return (
      <>
        <Header />
        <SquaresPattern />

        <div className="mx-auto mt-40 max-w-6xl pb-10">
          <div className="text-center">
            <HeroText>Open Source Friends</HeroText>
            <div className="mt-4">
              <HeroSubtitle>
                Some other great Open Source projects to follow
              </HeroSubtitle>
            </div>
          </div>
          <div className="mt-20 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.data?.map((friend) => {
              return (
                <CardBasic key={friend.name}>
                  <TypographyH3>
                    <Link href={friend.href}>{friend.name}</Link>
                  </TypographyH3>
                  <SectionDescription className="mt-4">
                    {friend.description}
                  </SectionDescription>
                  <div className="mt-4">
                    <Button>
                      <Link href={friend.href} target="_blank">
                        Learn more
                      </Link>
                    </Button>
                  </div>
                </CardBasic>
              );
            })}
          </div>
          <div className="mt-8 text-center">
            <Button variant="secondary">
              <Link
                href="https://formbricks.com/clhys1p9r001cpr0hu65rwh17"
                target="_blank"
              >
                Join OSS Friends
              </Link>
            </Button>
          </div>
        </div>

        <CTA />
        <Footer />
      </>
    );
  } catch (error) {
    console.error(error);
    return <div>Error loading OSS Friends</div>;
  }
}
