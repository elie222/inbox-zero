import { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Alternatives to Skiff Mail",
  description:
    "Notion recently aqcuired Skiff Mail and is sunsetting it in six months. Here are some good alternatives to consider for your email needs.",
  alternates: {
    canonical: "/blog/post/alternatives-to-skiff-mail",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Alternatives to Skiff Mail"
        datePublished="2024-02-11T08:00:00+00:00"
        dateModified="2024-02-11T08:00:00+00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
        image={[]}
      />
      <Content />
    </>
  );
}
