"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NewBarChart } from "@/app/(app)/[emailAccountId]/stats/NewBarChart";
import { format, subDays } from "date-fns";
import { COLORS } from "@/utils/colors";
import { BarListCard } from "@/app/(app)/[emailAccountId]/stats/BarListCard";

// Mock data for demo
const MOCK_TOPICS = [
  {
    topic: "Customer Support",
    count: 342,
    chartColor: COLORS.analytics.blue,
    emoji: "💬",
  },
  {
    topic: "Product Updates",
    count: 256,
    chartColor: COLORS.analytics.purple,
    emoji: "🚀",
  },
  {
    topic: "Billing & Payments",
    count: 189,
    chartColor: COLORS.analytics.green,
    emoji: "💰",
  },
  {
    topic: "Feature Requests",
    count: 167,
    chartColor: COLORS.analytics.lightGreen,
    emoji: "✨",
  },
  {
    topic: "Bug Reports",
    count: 134,
    chartColor: COLORS.analytics.pink,
    emoji: "🐛",
  },
  {
    topic: "Sales Inquiries",
    count: 89,
    chartColor: COLORS.analytics.lightPink,
    emoji: "📈",
  },
  { topic: "General Questions", count: 45, chartColor: "#94A3B8", emoji: "❓" },
];

// Generate mock daily data for past 30 days
function generateDailyData(topicCount: number) {
  const data = [];
  const now = new Date();

  for (let i = 29; i >= 0; i--) {
    const date = subDays(now, i);
    // Generate semi-realistic data with some variance
    const baseCount = topicCount / 30;
    const variance = Math.random() * baseCount * 0.8;
    const count = Math.max(
      0,
      Math.round(baseCount + variance - baseCount * 0.4),
    );

    data.push({
      date: format(date, "yyyy-MM-dd"),
      count: count,
    });
  }

  return data;
}

export function TopicDistribution() {
  const [selectedTopic, setSelectedTopic] = useState<
    (typeof MOCK_TOPICS)[0] | null
  >(null);

  const handleTopicClick = (item: { name: string; value: number }) => {
    const topic = MOCK_TOPICS.find((t) => t.topic === item.name);
    if (topic) {
      setSelectedTopic(topic);
    }
  };

  const tabs = [
    {
      id: "common-topics",
      label: "Common Topics",
      data: MOCK_TOPICS.map((topic) => ({
        name: topic.topic,
        value: topic.count,
        icon: topic.emoji,
      })),
    },
  ];

  return (
    <>
      <BarListCard
        tabs={tabs}
        icon={<MessageSquare className="h-4 w-4 text-neutral-500" />}
        title="Topics"
        onItemClick={handleTopicClick}
      />

      <Dialog
        open={!!selectedTopic}
        onOpenChange={() => setSelectedTopic(null)}
      >
        <DialogContent className="max-w-3xl">
          {selectedTopic && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedTopic.topic}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-sm text-gray-500">Total (30 days)</p>
                    <p className="text-2xl font-bold">
                      {selectedTopic.count.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Average per day</p>
                    <p className="text-2xl font-bold">
                      {Math.round(selectedTopic.count / 30).toLocaleString()}
                    </p>
                  </div>
                </div>
                <NewBarChart
                  data={generateDailyData(selectedTopic.count)}
                  config={{
                    count: { label: "Emails", color: selectedTopic.chartColor },
                  }}
                  xAxisKey="date"
                  period="day"
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
