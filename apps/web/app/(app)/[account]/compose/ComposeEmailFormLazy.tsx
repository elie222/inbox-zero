"use client";

import dynamic from "next/dynamic";
import { Loading } from "@/components/Loading";

// keep bundle size down by importing dynamically on use
export const ComposeEmailFormLazy = dynamic(
  () => import("./ComposeEmailForm").then((mod) => mod.ComposeEmailForm),
  {
    loading: () => <Loading />,
  },
);
