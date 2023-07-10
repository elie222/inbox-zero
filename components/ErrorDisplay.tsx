import { ErrorMessage } from "@/utils/error";
import { Panel } from "./Panel";
import Image from "next/image";

export function ErrorDisplay(props: { info?: ErrorMessage }) {
  if (props.info?.message)
    return (
      <NotFound>
        There was an error loading the page: {props.info.message}
      </NotFound>
    );

  if (props.info) {
    return (
      <NotFound>
        There was an error loading the page. Please refresh or contact support
        if the error persists.
      </NotFound>
    );
  }

  return null;
}

const NotFound = (props: { children: React.ReactNode }) => {
  return (
    <div className="text-gray-700">
      <Panel>{props.children}</Panel>
    </div>
  );
};

export const NotLoggedIn = (props: {}) => {
  return (
    <div className="flex flex-col items-center justify-center sm:p-20 md:p-32">
      <div className="text-lg text-gray-700">You are not signed in 😞</div>
      <div className="mt-8">
        <Image
          src="/images/falling.svg"
          alt=""
          width={400}
          height={400}
          unoptimized
        />
      </div>
    </div>
  );
};
