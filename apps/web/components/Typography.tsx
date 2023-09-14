import React from "react";

export function PageHeading(props: { children: React.ReactNode }) {
  return (
    <h2 className="font-cal text-2xl font-bold leading-7 text-gray-900 sm:truncate sm:text-3xl">
      {props.children}
    </h2>
  );
}

export function SectionHeader(props: { children: React.ReactNode }) {
  return (
    <h2 className="font-cal text-base font-semibold leading-7">
      {props.children}
    </h2>
  );
}

export function SectionDescription(props: { children: React.ReactNode }) {
  return (
    <p className="mt-1 text-sm leading-6 text-gray-700">{props.children}</p>
  );
}
