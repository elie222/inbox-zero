import React from "react";

export function SectionHeader(props: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold leading-7">{props.children}</h2>
  );
}

export function SectionDescription(props: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-sm leading-6 text-gray-700">{props.children}</p>
  );
}
