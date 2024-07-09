import { Title, Text } from "@tremor/react";

export function SectionHeader(props: { title: string; description: string }) {
  return (
    <div>
      <Title>{props.title}</Title>
      <Text className="mt-2">{props.description}</Text>
    </div>
  );
}
