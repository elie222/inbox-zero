import { withError } from "@/utils/middleware";
import { POST as handleDigestRequest } from "../route";

export const POST = withError(handleDigestRequest);
