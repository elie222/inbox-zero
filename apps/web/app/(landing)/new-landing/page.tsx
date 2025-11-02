import { BasicLayout } from "./BasicLayout";
import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  return (
    <BasicLayout>
      <div />
    </BasicLayout>
  );
}
