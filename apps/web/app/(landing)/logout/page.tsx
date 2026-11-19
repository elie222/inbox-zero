"use client";

import { useEffect } from "react";
import { logOut } from "@/utils/user";
import { Loading } from "@/components/Loading";
import { ClientBasicLayout } from "@/components/layouts/ClientBasicLayout";

export default function LogoutPage() {
  useEffect(() => {
    logOut("/login");
  }, []);

  return (
    <ClientBasicLayout>
      <Loading />
    </ClientBasicLayout>
  );
}
