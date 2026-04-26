type AppErrorBoundaryLogContextInput = {
  error: Pick<Error & { digest?: string }, "digest" | "name">;
  params: {
    emailAccountId?: string | string[];
    ruleId?: string | string[];
  };
  pathname: string;
  searchParams: Iterable<[string, string]>;
};

const SAFE_SEARCH_PARAM_KEYS = new Set(["ruleId", "tab"]);

export function getAppErrorBoundaryLogContext({
  error,
  params,
  pathname,
  searchParams,
}: AppErrorBoundaryLogContextInput) {
  const emailAccountId = getSingleRouteParam(params.emailAccountId);
  const ruleId = getSingleRouteParam(params.ruleId);
  const { safeSearchParams, searchParamKeys } =
    getSearchParamContext(searchParams);

  return {
    ...(error.digest ? { digest: error.digest } : {}),
    errorName: error.name,
    ...(emailAccountId ? { emailAccountId } : {}),
    pathname,
    ...(ruleId ? { ruleId } : {}),
    ...(Object.keys(safeSearchParams).length > 0 ? { safeSearchParams } : {}),
    ...(searchParamKeys.length > 0 ? { searchParamKeys } : {}),
  };
}

function getSingleRouteParam(value?: string | string[]) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getSearchParamContext(searchParams: Iterable<[string, string]>) {
  const safeSearchParams: Record<string, string> = {};
  const searchParamKeys = new Set<string>();

  for (const [key, value] of searchParams) {
    searchParamKeys.add(key);

    if (SAFE_SEARCH_PARAM_KEYS.has(key) && !(key in safeSearchParams)) {
      safeSearchParams[key] = value;
    }
  }

  return {
    safeSearchParams,
    searchParamKeys: Array.from(searchParamKeys),
  };
}
