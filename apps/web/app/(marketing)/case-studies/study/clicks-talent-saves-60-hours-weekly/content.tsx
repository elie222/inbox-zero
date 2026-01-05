import {
  CaseStudy,
  type CaseStudyProps,
} from "@/app/(marketing)/case-studies/components/CaseStudy";
import { CaseStudyMDXContent } from "./CaseStudyMDXContent";
import { BlogLayout } from "@/components/layouts/BlogLayout";
import { metadata } from "./content.mdx";

export function Content() {
  const md = metadata as unknown as CaseStudyProps;

  return (
    <BlogLayout>
      <CaseStudy {...md} content={<CaseStudyMDXContent />} />
    </BlogLayout>
  );
}
