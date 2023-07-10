import React from "react";
import { Loading } from "./Loading";
import { ErrorDisplay } from "./ErrorDisplay";
import { ErrorMessage } from "@/utils/error";

interface LoadingContentProps {
  loading: boolean;
  loadingComponent?: React.ReactNode;
  error?: { info?: ErrorMessage };
  errorComponent?: React.ReactNode;
  children: React.ReactNode;
}

export function LoadingContent(props: LoadingContentProps) {
  if (props.error) {
    return props.errorComponent ? (
      <>{props.errorComponent}</>
    ) : (
      <div className="mt-4">
        <ErrorDisplay info={props.error.info} />
      </div>
    );
  }

  if (props.loading) return <>{props.loadingComponent || <Loading />}</>;

  return <>{props.children}</>;
}
