"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAction } from "next-safe-action/hooks";
import { Badge } from "@/components/ui/badge";
import {
  Mail,
  TrendingUp,
  Target,
  Zap,
  CheckCircle,
  Clock,
} from "lucide-react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { LoadingContent } from "@/components/LoadingContent";
import {
  type EmailReportData,
  generateReportAction,
} from "@/utils/actions/report";
import { useState } from "react";
import { toastError, toastSuccess } from "@/components/Toast";

export default function EmailReportPage() {
  const params = useParams();
  const emailAccountId = params.emailAccountId;

  if (typeof emailAccountId !== "string")
    throw new Error("Email account ID is required");

  const [report, setReport] = useState<EmailReportData | null>(null);

  const { executeAsync, isExecuting, result } = useAction(
    generateReportAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        if (result?.data) {
          setReport(result.data);
          toastSuccess({ description: "Report generated successfully" });
        } else {
          toastError({ description: "Failed to generate report" });
        }
      },
      onError: (result) => {
        toastError({
          title: "Failed to generate report",
          description: result.error.serverError || "Unknown error",
        });
      },
    },
  );

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => executeAsync({})} loading={isExecuting}>
            Generate Report
          </Button>

          <LoadingContent
            loading={isExecuting}
            error={
              result?.serverError ? { error: result.serverError } : undefined
            }
          >
            <p className="text-gray-600">
              Comprehensive analysis of your email patterns and personalized
              recommendations.
            </p>

            {/* Report Display */}
            {report && (
              <div className="space-y-8">
                {/* Executive Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Executive Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white p-4 rounded-lg border">
                        <h4 className="font-semibold text-gray-900">
                          Professional Persona
                        </h4>
                        <p className="text-2xl font-bold text-blue-600">
                          {report.executiveSummary?.userProfile.persona}
                        </p>
                        <p className="text-sm text-gray-500">
                          Confidence:{" "}
                          {report.executiveSummary?.userProfile.confidence}%
                        </p>
                      </div>
                      <div className="bg-white p-4 rounded-lg border">
                        <h4 className="font-semibold text-gray-900">
                          Email Sources
                        </h4>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-sm">Inbox:</span>
                            <span className="font-medium">
                              {report.emailActivityOverview.dataSources.inbox}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Archived:</span>
                            <span className="font-medium">
                              {
                                report.emailActivityOverview.dataSources
                                  .archived
                              }
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-sm">Sent:</span>
                            <span className="font-medium">
                              {report.emailActivityOverview.dataSources.sent}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white p-4 rounded-lg border">
                        <h4 className="font-semibold text-gray-900">
                          Quick Actions
                        </h4>
                        <div className="space-y-2">
                          {report.executiveSummary?.quickActions
                            .slice(0, 3)
                            .map((action, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2"
                              >
                                <Badge
                                  className={getDifficultyColor(
                                    action.difficulty,
                                  )}
                                >
                                  {action.difficulty}
                                </Badge>
                                <span className="text-sm text-gray-700">
                                  {action.action}
                                </span>
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Top Insights
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {report.executiveSummary?.topInsights.map(
                          (insight, index) => (
                            <div
                              key={index}
                              className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                            >
                              <span className="text-lg">{insight.icon}</span>
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    className={getPriorityColor(
                                      insight.priority,
                                    )}
                                  >
                                    {insight.priority}
                                  </Badge>
                                </div>
                                <p className="text-sm text-gray-700">
                                  {insight.insight}
                                </p>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* User Persona */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5" />
                      Professional Identity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Professional Identity
                      </h4>
                      <p className="text-lg font-medium text-blue-600 mb-2">
                        {report.userPersona?.professionalIdentity.persona}
                      </p>
                      <div className="space-y-2">
                        {report.userPersona?.professionalIdentity.supportingEvidence.map(
                          (evidence, index) => (
                            <p
                              key={index}
                              className="text-sm text-gray-600 flex items-start gap-2"
                            >
                              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                              {evidence}
                            </p>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Current Priorities
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {report.userPersona?.currentPriorities.map(
                          (priority, index) => (
                            <Badge key={index} variant="secondary">
                              {priority}
                            </Badge>
                          ),
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Email Behavior */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Email Behavior Patterns
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h5 className="font-medium text-gray-900 mb-2">
                          Timing Patterns
                        </h5>
                        <p className="text-sm text-gray-600">
                          Peak hours:{" "}
                          {report.emailBehavior?.timingPatterns.peakHours.join(
                            ", ",
                          )}
                        </p>
                        <p className="text-sm text-gray-600">
                          Response preference:{" "}
                          {
                            report.emailBehavior?.timingPatterns
                              .responsePreference
                          }
                        </p>
                        <p className="text-sm text-gray-600">
                          Frequency:{" "}
                          {report.emailBehavior?.timingPatterns.frequency}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h5 className="font-medium text-gray-900 mb-2">
                          Content Preferences
                        </h5>
                        <p className="text-sm text-gray-600">
                          Preferred:{" "}
                          {report.emailBehavior?.contentPreferences.preferred.join(
                            ", ",
                          )}
                        </p>
                        <p className="text-sm text-gray-600">
                          Avoided:{" "}
                          {report.emailBehavior?.contentPreferences.avoided.join(
                            ", ",
                          )}
                        </p>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <h5 className="font-medium text-gray-900 mb-2">
                          Engagement Triggers
                        </h5>
                        <div className="space-y-1">
                          {report.emailBehavior?.engagementTriggers.map(
                            (trigger, index) => (
                              <p key={index} className="text-sm text-gray-600">
                                • {trigger}
                              </p>
                            ),
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Response Patterns */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Response Patterns & Categories
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Common Response Patterns
                      </h4>
                      <div className="space-y-4">
                        {report.responsePatterns?.commonResponses.map(
                          (response, index) => (
                            <div
                              key={index}
                              className="bg-gray-50 p-4 rounded-lg"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-gray-900">
                                  {response.pattern}
                                </h5>
                                <Badge variant="outline">
                                  {response.frequency}%
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                "{response.example}"
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {response.triggers.map(
                                  (trigger, triggerIndex) => (
                                    <Badge
                                      key={triggerIndex}
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      {trigger}
                                    </Badge>
                                  ),
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Email Categories
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {report.responsePatterns?.categoryOrganization.map(
                          (category, index) => (
                            <div
                              key={index}
                              className="bg-white p-4 rounded-lg border"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <h5 className="font-medium text-gray-900">
                                  {category.category}
                                </h5>
                                <Badge
                                  className={getPriorityColor(
                                    category.priority,
                                  )}
                                >
                                  {category.priority}
                                </Badge>
                              </div>
                              <p className="text-sm text-gray-600 mb-2">
                                {category.description}
                              </p>
                              <p className="text-xs text-gray-500">
                                {category.emailCount} emails
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Label Analysis */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Label Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Current Labels
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                        {report.labelAnalysis.currentLabels.map(
                          (label, index) => (
                            <div
                              key={index}
                              className="bg-white p-3 rounded-lg border text-center"
                            >
                              <p className="font-medium text-gray-900 text-sm mb-1">
                                {label.name}
                              </p>
                              <p className="text-lg font-bold text-blue-600">
                                {label.emailCount}
                              </p>
                              <p className="text-xs text-gray-500">
                                {label.unreadCount} unread
                              </p>
                              <p className="text-xs text-gray-400">
                                {label.threadCount} threads
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Optimization Suggestions
                      </h4>
                      <div className="space-y-3">
                        {report.labelAnalysis.optimizationSuggestions.map(
                          (suggestion, index) => (
                            <div
                              key={index}
                              className="flex items-start justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge
                                    variant="outline"
                                    className="text-xs capitalize"
                                  >
                                    {suggestion.type}
                                  </Badge>
                                  <p className="font-medium text-gray-900">
                                    {suggestion.suggestion}
                                  </p>
                                </div>
                                <p className="text-sm text-gray-600 mb-1">
                                  {suggestion.reason}
                                </p>
                              </div>
                              <Badge
                                className={getImpactColor(suggestion.impact)}
                              >
                                {suggestion.impact} impact
                              </Badge>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Actionable Recommendations */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      Actionable Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Immediate Actions
                      </h4>
                      <div className="space-y-3">
                        {report.actionableRecommendations?.immediateActions.map(
                          (action, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div className="flex-1">
                                <p className="font-medium text-gray-900">
                                  {action.action}
                                </p>
                                <p className="text-sm text-gray-600">
                                  Time required: {action.timeRequired}
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <Badge
                                  className={getDifficultyColor(
                                    action.difficulty,
                                  )}
                                >
                                  {action.difficulty}
                                </Badge>
                                <Badge
                                  className={getImpactColor(action.impact)}
                                >
                                  {action.impact} impact
                                </Badge>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Short-term Improvements
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {report.actionableRecommendations?.shortTermImprovements.map(
                          (improvement, index) => (
                            <div
                              key={index}
                              className="bg-white p-4 rounded-lg border"
                            >
                              <h5 className="font-medium text-gray-900 mb-2">
                                {improvement.improvement}
                              </h5>
                              <p className="text-sm text-gray-600 mb-2">
                                Timeline: {improvement.timeline}
                              </p>
                              <p className="text-sm text-gray-600">
                                {improvement.expectedBenefit}
                              </p>
                            </div>
                          ),
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-gray-900 mb-3">
                        Long-term Strategy
                      </h4>
                      <div className="space-y-4">
                        {report.actionableRecommendations?.longTermStrategy.map(
                          (strategy, index) => (
                            <div
                              key={index}
                              className="bg-gray-50 p-4 rounded-lg"
                            >
                              <h5 className="font-medium text-gray-900 mb-2">
                                {strategy.strategy}
                              </h5>
                              <p className="text-sm text-gray-600 mb-3">
                                {strategy.description}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {strategy.successMetrics.map(
                                  (metric, metricIndex) => (
                                    <Badge
                                      key={metricIndex}
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {metric}
                                    </Badge>
                                  ),
                                )}
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </LoadingContent>
        </CardContent>
      </Card>
    </div>
  );
}

const getPriorityColor = (priority: "high" | "medium" | "low") => {
  switch (priority) {
    case "high":
      return "bg-red-100 text-red-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "low":
      return "bg-green-100 text-green-800";
  }
};

const getDifficultyColor = (difficulty: "easy" | "medium" | "hard") => {
  switch (difficulty) {
    case "easy":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "hard":
      return "bg-red-100 text-red-800";
  }
};

const getImpactColor = (impact: "high" | "medium" | "low") => {
  switch (impact) {
    case "high":
      return "bg-blue-100 text-blue-800";
    case "medium":
      return "bg-purple-100 text-purple-800";
    case "low":
      return "bg-gray-100 text-gray-800";
  }
};
