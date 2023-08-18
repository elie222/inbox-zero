import React from "react";
import {
  BarList as TremorBarList,
  Card,
  Title,
  Bold,
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
    <Card className="max-w-lg">
      <Title>{props.title}</Title>
      {props.subtitle ? <Text>{props.subtitle}</Text> : null}
      <Flex className="mt-4">
        <Text>
          <Bold>{props.col1}</Bold>
        </Text>
        <Text>
          <Bold>{props.col2}</Bold>
        </Text>
      </Flex>
      <TremorBarList data={props.data} className="mt-2" />
      {props.extra}
    </Card>
  );
};
