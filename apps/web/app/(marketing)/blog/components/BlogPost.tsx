import { Prose } from "@/app/(marketing)/blog/components/Prose";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Card, CardContent } from "@/components/ui/card";

export function BlogPost(props: {
  date: string;
  title: string;
  author: string;
  content: React.ReactNode;
}) {
  const { content } = props;

  return (
    <BasicLayout>
      <article className="mx-auto max-w-3xl px-6 py-20">
        {/* <div className="text-center">
          <time dateTime={date} className="mb-1 text-xs text-gray-600">
            {format(parseISO(date), "LLLL d, yyyy")}
          </time>
          <p className="text-sm font-semibold">by {author}</p>
        </div> */}
        <Card>
          <CardContent className="pt-6">
            <Prose className="prose-a:font-semibold prose-a:text-blue-500 prose-a:no-underline hover:prose-a:underline">
              {content}
            </Prose>
          </CardContent>
        </Card>
      </article>
    </BasicLayout>
  );
}
