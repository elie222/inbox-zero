import { format, parseISO } from "date-fns";
import { Prose } from "@/app/blog/components/Prose";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export function BlogPost(props: {
  date: string;
  title: string;
  author: string;
  content: React.ReactNode;
}) {
  const { date, title, author, content } = props;

  return (
    <BasicLayout>
      <article className="mx-auto max-w-xl py-20">
        {/* <div className="text-center">
          <time dateTime={date} className="mb-1 text-xs text-gray-600">
            {format(parseISO(date), "LLLL d, yyyy")}
          </time>
          <p className="text-sm font-semibold">by {author}</p>
        </div> */}
        <div className="mt-12">
          <Prose>{content}</Prose>
        </div>
      </article>
    </BasicLayout>
  );
}
