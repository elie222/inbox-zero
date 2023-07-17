import { format, parseISO } from "date-fns";

export function LegalPage(props: {
  date: string;
  title: string;
  content: string;
}) {
  const { date, title, content } = props;

  return (
    <article className="mx-auto max-w-xl py-8">
      <div className="mb-8 text-center">
        <time dateTime={date} className="mb-1 text-xs text-gray-600">
          {format(parseISO(date), "LLLL d, yyyy")}
        </time>
        <h1 className="text-3xl font-bold">{title}</h1>
      </div>
      <div
        className="[&>*:last-child]:mb-0 [&>*]:mb-3"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </article>
  );
}
