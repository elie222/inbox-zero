export const prefixPath = (emailAccountId: string, path: `/${string}`) => {
  if (emailAccountId) return `/${emailAccountId}${path}`;
  return path;
};
