"use client";

import type { MDXComponents } from "mdx/types";

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    /* eslint-disable jsx-a11y/alt-text */
    // @ts-ignore
    // img: (props) => <Image width={300} {...props} />,
    // Image: (props) => <Image width={300} {...props} />,
  };
}
