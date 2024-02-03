import { ErrorPage } from "@/components/ErrorPage";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export default function NotFound() {
  return (
    <BasicLayout>
      <ErrorPage
        title="Page Not Found"
        description="The page you are looking for could not be found."
      />
    </BasicLayout>
  );
}
