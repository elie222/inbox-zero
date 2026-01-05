import { DocumentTextIcon } from "@sanity/icons";
import { defineField, defineType } from "sanity";

export const markdownDocumentType = defineType({
  name: "markdownDocument",
  title: "Markdown Document",
  type: "document",
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: {
        source: "title",
      },
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 3,
    }),
    defineField({
      name: "content",
      title: "Markdown Content",
      type: "markdown",
      description:
        "GitHub flavored markdown with image upload support. You can drag images directly into the editor or use the image button.",
      options: {
        // Custom image URL function - adds width parameter for responsive images
        imageUrl: (imageAsset) => `${imageAsset.url}?w=800&fit=max`,
      },
    }),
    defineField({
      name: "publishedAt",
      title: "Published At",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
    }),
  ],
  preview: {
    select: {
      title: "title",
      subtitle: "description",
    },
  },
});
