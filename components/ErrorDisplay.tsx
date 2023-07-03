import { ErrorMessage } from "@/utils/error";
import { Panel } from "./Panel";

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
