import type { BlogPosting, WithContext } from "schema-dts";

type StructuredDataProps = {
  headline: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
  authorUrl: string;
  image: string[];
};

export function StructuredData(props: StructuredDataProps) {
  const jsonLd: WithContext<BlogPosting> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: props.headline,
    image: props.image,
    datePublished: props.datePublished,
    dateModified: props.dateModified,
    author: [
      {
        "@type": "Person",
        name: props.authorName,
        url: props.authorUrl,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: blog
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
