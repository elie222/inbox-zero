const SOURCE_INDEX_ATTRIBUTE = "data-source-index";

/**
 * Maps remote image URLs in a draft to signed image-proxy URLs so composing
 * never requests images from the sender's host. Sources stay unmapped when
 * the proxy is unavailable.
 */
export async function resolveRemoteImages(
  sources: string[],
): Promise<Record<string, string | null>> {
  const template = document.createElement("template");
  // Images created in the live document start loading as soon as they get a
  // src, even while detached.
  const inertDocument = template.content.ownerDocument;
  for (const [index, source] of sources.entries()) {
    const image = inertDocument.createElement("img");
    image.setAttribute("src", source);
    image.setAttribute(SOURCE_INDEX_ATTRIBUTE, String(index));
    template.content.append(image);
  }

  const response = await fetch("/api/email/render-html", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ html: template.innerHTML }),
  });
  if (!response.ok) return {};
  const data: { html?: unknown; remoteAssetsProxied?: unknown } =
    await response.json();
  if (data.remoteAssetsProxied !== true || typeof data.html !== "string") {
    return {};
  }

  const rendered = new DOMParser().parseFromString(data.html, "text/html");
  const resolved: Record<string, string | null> = {};
  for (const image of rendered.querySelectorAll(
    `img[${SOURCE_INDEX_ATTRIBUTE}]`,
  )) {
    const source = sources[Number(image.getAttribute(SOURCE_INDEX_ATTRIBUTE))];
    const proxied = image.getAttribute("src");
    if (source && proxied && proxied !== source) resolved[source] = proxied;
  }
  return resolved;
}
