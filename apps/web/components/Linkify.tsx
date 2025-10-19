import LinkifyReact from "linkify-react";
import Link from "next/link";

const renderLink = ({
  attributes,
  content,
}: {
  attributes: Record<string, unknown>;
  content: string;
}) => {
  const { href, ...props } = attributes;

  return (
    <Link
      href={href}
      {...props}
      target="_blank"
      className="font-semibold hover:underline"
    >
      {content}
    </Link>
  );
};

export function Linkify(props: { children: React.ReactNode }) {
  return (
    <LinkifyReact options={{ render: renderLink }}>
      {props.children}
    </LinkifyReact>
  );
}
