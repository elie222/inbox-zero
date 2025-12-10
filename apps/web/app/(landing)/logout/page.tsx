"use client";

import { useEffect } from "react";
import { logOut } from "@/utils/user";
import { Loading } from "@/components/Loading";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export default function LogoutPage() {
  useEffect(() => {
    logOut("/login");
  }, []);

  return (
    <BasicLayout>
      <Loading />
    </BasicLayout>
  );
}
