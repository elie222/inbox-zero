import {
  AlternativeComparison,
  type AlternativeComparisonProps,
} from "@/app/(marketing)/(alternatives)/components/AlternativeComparison";
import { AlternativeComparisonMDXContent } from "./AlternativeComparisonMDXContent";
import { BlogLayout } from "@/components/layouts/BlogLayout";
import { metadata } from "./content.mdx";

export function Content() {
  const md = metadata as unknown as AlternativeComparisonProps;

  return (
    <BlogLayout>
      <AlternativeComparison
        {...md}
        content={<AlternativeComparisonMDXContent />}
      />
    </BlogLayout>
  );
}
