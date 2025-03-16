import type React from "react";
import { BarList as TremorBarList, Flex, Text } from "@tremor/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const BarList = (props: {
  title: string;
  col1: string;
  col2: string;
  data: {
    name: string;
    value: number;
    href?: string;
    target?: string;
  }[];
  extra?: React.ReactNode;
}) => {
  return (
    <Card className="h-full bg-background">
      <CardHeader>
        <CardTitle className="text-lg">{props.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Flex>
          <Text>{props.col1}</Text>
          <Text>{props.col2}</Text>
        </Flex>
        <TremorBarList data={props.data} className="mt-2" />
        {props.extra}
      </CardContent>
    </Card>
  );
};
