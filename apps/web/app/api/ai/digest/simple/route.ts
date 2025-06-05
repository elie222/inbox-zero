import { withError } from "@/utils/middleware";
import { handleDigestRequest } from "../route";

export const POST = withError(handleDigestRequest);
