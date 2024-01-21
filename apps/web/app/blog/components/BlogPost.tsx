import { format, parseISO } from "date-fns";
import { Prose } from "@/app/blog/components/Prose";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export function BlogPost(props: {
  date: string;
  title: string;
  content: React.ReactNode;
}) {
  const { date, title, content } = props;

  return (
    <BasicLayout>
      <article className="mx-auto max-w-xl py-8">
        <div className="mb-8 text-center">
          <time dateTime={date} className="mb-1 text-xs text-gray-600">
            {format(parseISO(date), "LLLL d, yyyy")}
          </time>
          {/* <h1 className="text-3xl font-bold">{title}</h1> */}
        </div>
        <Prose>{content}</Prose>
      </article>
    </BasicLayout>
  );
}
