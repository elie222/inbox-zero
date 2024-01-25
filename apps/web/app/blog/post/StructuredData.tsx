type StructuredDataProps = {
  headline: string;
  datePublished: string;
  dateModified: string;
  authorName: string;
  authorUrl: string;
};

export function StructuredData(props: StructuredDataProps) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: props.headline,
    // image: [
    //   "https://example.com/photos/1x1/photo.jpg",
    //   "https://example.com/photos/4x3/photo.jpg",
    //   "https://example.com/photos/16x9/photo.jpg",
    // ],
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
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
