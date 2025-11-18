import type { Metadata } from "next";
import Link from "next/link";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { SquaresPattern } from "@/app/(landing)/home/SquaresPattern";
import { Header } from "@/app/(landing)/home/Header";
import { Footer } from "@/app/(landing)/home/Footer";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { CardBasic } from "@/components/ui/card";
import {
  PageHeading,
  Paragraph,
} from "@/components/new-landing/common/Typography";

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
            <PageHeading>Open Source Friends</PageHeading>
            <Paragraph className="mt-4">
              Some other great Open Source projects to follow
            </Paragraph>
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
        </div>

        <FinalCTA />
        <Footer />
      </>
    );
  } catch (error) {
    console.error(error);
    return <div>Error loading OSS Friends</div>;
  }
}
