"use client";

import { type ComponentProps, useEffect } from "react";
import { registerOpenComposer } from "@/utils/safe-reload";
import dynamic from "next/dynamic";
import { Loading } from "@/components/Loading";

// keep bundle size down by importing dynamically on use
const ComposeEmailForm = dynamic(
  () => import("./ComposeEmailForm").then((mod) => mod.ComposeEmailForm),
  {
    loading: () => <Loading />,
  },
);

export function ComposeEmailFormLazy(
  props: ComponentProps<typeof ComposeEmailForm>,
) {
  useEffect(registerOpenComposer, []);
  return <ComposeEmailForm {...props} />;
}
