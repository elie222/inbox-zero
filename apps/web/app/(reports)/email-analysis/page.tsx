"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/Input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Clock,
  Mail,
  TrendingUp,
  Target,
  Zap,
  CheckCircle,
} from "lucide-react";

// Mock data types based on email-analysis-report.mdc
interface ExecutiveSummary {
  userProfile: {
    persona: string;
    confidence: number;
  };
  keyMetrics: {
    totalEmails: number;
    dateRange: string;
    analysisFreshness: string;
  };
  topInsights: Array<{
    insight: string;
    priority: "high" | "medium" | "low";
    icon: string;
  }>;
  quickActions: Array<{
    action: string;
    difficulty: "easy" | "medium" | "hard";
    impact: "high" | "medium" | "low";
  }>;
}

interface EmailActivityOverview {
  dataSources: {
    inbox: number;
    archived: number;
    trash: number;
    sent: number;
  };
}

interface UserPersona {
  professionalIdentity: {
    persona: string;
    supportingEvidence: string[];
  };
  currentPriorities: string[];
}

interface EmailBehavior {
  timingPatterns: {
    peakHours: string[];
    responsePreference: string;
    frequency: string;
  };
  contentPreferences: {
    preferred: string[];
    avoided: string[];
  };
  engagementTriggers: string[];
}

interface ResponsePatterns {
  commonResponses: Array<{
    pattern: string;
    example: string;
    frequency: number;
    triggers: string[];
  }>;
  suggestedTemplates: Array<{
    templateName: string;
    template: string;
    useCase: string;
  }>;
  categoryOrganization: Array<{
    category: string;
    description: string;
    emailCount: number;
    priority: "high" | "medium" | "low";
  }>;
}

interface LabelAnalysis {
  currentLabels: Array<{
    name: string;
    emailCount: number;
    unreadCount: number;
  }>;
  optimizationSuggestions: Array<{
    type: "consolidate" | "rename" | "create" | "delete";
    suggestion: string;
    reason: string;
    impact: "high" | "medium" | "low";
  }>;
}

interface ActionableRecommendations {
  immediateActions: Array<{
    action: string;
    difficulty: "easy" | "medium" | "hard";
    impact: "high" | "medium" | "low";
    timeRequired: string;
  }>;
  shortTermImprovements: Array<{
    improvement: string;
    timeline: string;
    expectedBenefit: string;
  }>;
  longTermStrategy: Array<{
    strategy: string;
    description: string;
    successMetrics: string[];
  }>;
}

interface ComprehensiveAnalysisReport {
  executiveSummary: ExecutiveSummary;
  emailActivityOverview: EmailActivityOverview;
  userPersona: UserPersona;
  emailBehavior: EmailBehavior;
  responsePatterns: ResponsePatterns;
  labelAnalysis: LabelAnalysis;
  actionableRecommendations: ActionableRecommendations;
}

export default function EmailAnalysisPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<ComprehensiveAnalysisReport | null>(
    null,
  );

  const handleAnalyze = async () => {
    if (!email.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch("/api/email-analysis", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userEmail: email.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate report");
      }

      const data = await response.json();
      setReport(data);
    } catch (error) {
      console.error("Error generating report:", error);
      // You might want to show a toast notification here
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8">
      {/* Input Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Generate Email Analysis Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-0">
          <div className="flex gap-2 w-full p-6">
            <div className="flex-1 min-w-0">
              <Input
                name="email"
                type="email"
                placeholder="Enter your email address to generate a comprehensive analysis report"
                registerProps={{
                  value: email,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setEmail(e.target.value),
                }}
                className="w-full"
              />
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={isLoading || !email.trim()}
              className="min-w-[140px] flex-shrink-0"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                "Generate Report"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
                    {report.executiveSummary.userProfile.persona}
                  </p>
                  <p className="text-sm text-gray-500">
                    Confidence: {report.executiveSummary.userProfile.confidence}
                    %
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-900">
                    Total Emails Analyzed
                  </h4>
                  <p className="text-2xl font-bold text-green-600">
                    {report.executiveSummary.keyMetrics.totalEmails.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">
                    {report.executiveSummary.keyMetrics.dateRange}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                  <h4 className="font-semibold text-gray-900">Email Sources</h4>
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
                        {report.emailActivityOverview.dataSources.archived}
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
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Top Insights
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {report.executiveSummary.topInsights.map((insight, index) => (
                    <div
                      key={index}
                      className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <Badge className={getPriorityColor(insight.priority)}>
                        {insight.priority}
                      </Badge>
                      <p className="text-sm text-gray-700">{insight.insight}</p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* User Persona & Communication Style */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                User Persona & Communication Style
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Professional Identity
                </h4>
                <p className="text-lg font-medium text-blue-600 mb-2">
                  {report.userPersona.professionalIdentity.persona}
                </p>
                <div className="space-y-2">
                  {report.userPersona.professionalIdentity.supportingEvidence.map(
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
                  {report.userPersona.currentPriorities.map(
                    (priority, index) => (
                      <Badge key={index} variant="secondary">
                        {priority}
                      </Badge>
                    ),
                  )}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Email Behavior Patterns
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium text-gray-900 mb-2">
                      Timing Patterns
                    </h5>
                    <p className="text-sm text-gray-600">
                      Peak hours:{" "}
                      {report.emailBehavior.timingPatterns.peakHours.join(", ")}
                    </p>
                    <p className="text-sm text-gray-600">
                      Response preference:{" "}
                      {report.emailBehavior.timingPatterns.responsePreference}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium text-gray-900 mb-2">
                      Content Preferences
                    </h5>
                    <p className="text-sm text-gray-600">
                      Preferred:{" "}
                      {report.emailBehavior.contentPreferences.preferred.join(
                        ", ",
                      )}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h5 className="font-medium text-gray-900 mb-2">
                      Engagement Triggers
                    </h5>
                    <div className="space-y-1">
                      {report.emailBehavior.engagementTriggers.map(
                        (trigger, index) => (
                          <p key={index} className="text-sm text-gray-600">
                            • {trigger}
                          </p>
                        ),
                      )}
                    </div>
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
                  {report.responsePatterns.commonResponses.map(
                    (response, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="font-medium text-gray-900">
                            {response.pattern}
                          </h5>
                          <Badge variant="outline">
                            Frequency: {response.frequency}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          "{response.example}"
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {response.triggers.map((trigger, triggerIndex) => (
                            <Badge
                              key={triggerIndex}
                              variant="secondary"
                              className="text-xs"
                            >
                              {trigger}
                            </Badge>
                          ))}
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
                  {report.responsePatterns.categoryOrganization.map(
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
                            className={getPriorityColor(category.priority)}
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
                Current Labels
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {report.labelAnalysis.currentLabels.map((label, index) => (
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
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Suggestions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5" />
                Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Immediate Actions
                </h4>
                <div className="space-y-3">
                  {report.actionableRecommendations.immediateActions.map(
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
                            className={getDifficultyColor(action.difficulty)}
                          >
                            {action.difficulty}
                          </Badge>
                          <Badge className={getPriorityColor(action.impact)}>
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
                  {report.actionableRecommendations.shortTermImprovements.map(
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
                  {report.actionableRecommendations.longTermStrategy.map(
                    (strategy, index) => (
                      <div key={index} className="bg-gray-50 p-4 rounded-lg">
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
    </div>
  );
}
