import { defineDocumentType, makeSource } from "contentlayer/source-files";

export const LegalPost = defineDocumentType(() => ({
  name: "LegalPost",
  filePathPattern: `**/legal/*.md`,
  fields: {
    title: {
      type: "string",
      required: true,
    },
    updatedAt: {
      type: "string",
      required: true,
    },
  },
  computedFields: {
    url: { type: "string", resolve: (post) => `/${post._raw.flattenedPath}` },
  },
}));

export default makeSource({
  contentDirPath: "content",
  documentTypes: [LegalPost],
});
