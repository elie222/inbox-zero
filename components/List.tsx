import { Button } from "./Button";

export function List(props: {
  items: { id: string; text: string }[];
  onArchive: (id: string) => void;
}) {
  const { items } = props;

  return (
    <ul role="list" className="divide-y divide-gray-800">
      {items.map((item) => (
        <li key={item.id} className="flex justify-between gap-x-6 py-5">
          <div className="flex gap-x-4">
            {/* <img className="h-12 w-12 flex-none rounded-full bg-gray-800" src={person.imageUrl} alt="" /> */}
            <div className="min-w-0 flex-auto">
              <p className="text-sm font-semibold leading-6 text-white">
                {item.text}
              </p>
              {/* <p className="mt-1 truncate text-xs leading-5 text-gray-400">{person.email}</p> */}
            </div>
          </div>
          <div className="hidden sm:flex sm:flex-col sm:items-end">
            <p className="text-sm leading-6 text-white">
              <Button onClick={() => props.onArchive(item.id)}>Archive</Button>
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
