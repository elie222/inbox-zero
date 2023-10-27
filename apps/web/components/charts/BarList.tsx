import React from "react";
import {
  BarList as TremorBarList,
  Card,
  Title,
  Flex,
  Text,
} from "@tremor/react";

export const BarList = (props: {
  title: string;
  subtitle?: string;
  col1: string;
  col2: string;
  data: {
    name: string;
    value: number;
    // href: string;
    // icon: () => JSX.Element;
  }[];
  extra?: React.ReactNode;
}) => {
  return (
    <Card>
      <Title>{props.title}</Title>
      {props.subtitle ? <Text>{props.subtitle}</Text> : null}
      <Flex className="mt-4">
        <Text>{props.col1}</Text>
        <Text>{props.col2}</Text>
      </Flex>
      <TremorBarList data={props.data} className="mt-2" />
      {props.extra}
    </Card>
  );
};
