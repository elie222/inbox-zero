import clsx from "clsx";

type Color =
  | "gray"
  | "red"
  | "yellow"
  | "green"
  | "blue"
  | "indigo"
  | "purple"
  | "pink";

export function Badge(props: { children: React.ReactNode; color: Color }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset",
        props.color === "gray" && "bg-gray-50 text-gray-600 ring-gray-500/10",
        props.color === "red" && "bg-red-50 text-red-700 ring-red-600/10",
        props.color === "yellow" &&
          "bg-yellow-50 text-yellow-800 ring-yellow-600/20",
        props.color === "green" &&
          "bg-green-50 text-green-700 ring-green-600/10",
        props.color === "blue" && "bg-blue-50 text-blue-700 ring-blue-600/10",
        props.color === "indigo" &&
          "bg-indigo-50 text-indigo-700 ring-indigo-600/10",
        props.color === "purple" &&
          "bg-purple-50 text-purple-700 ring-purple-600/10",
        props.color === "pink" && "bg-pink-50 text-pink-700 ring-pink-600/10"
      )}
    >
      {props.children}
    </span>
  );
}
