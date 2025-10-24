"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, CheckCircle, XCircle, Info } from "lucide-react";

interface MigrationStats {
  totalUsers: number;
  processedUsers: number;
  successfulMigrations: number;
  skippedUsers: number;
  failedUsers: number;
  rulesUpdated: number;
  errors: Array<{ userId: string; error: string }>;
}

interface MigrationStatus {
  totalUsers: number;
  migratedUsers: number;
  pendingUsers: number;
  migrationProgress: number;
}

export function DigestMigrationAdmin() {
  const [isRunning, setIsRunning] = useState(false);
  const [isDryRun, setIsDryRun] = useState(true);
  const [migrationStats, setMigrationStats] = useState<MigrationStats | null>(
    null,
  );
  const [migrationStatus, setMigrationStatus] =
    useState<MigrationStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runMigration = async (dryRun: boolean) => {
    setIsRunning(true);
    setError(null);
    setMigrationStats(null);

    try {
      const response = await fetch("/api/admin/digest-migration", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dryRun }),
      });

      const result = await response.json();

      if (result.success) {
        setMigrationStats(result.stats);
        if (!dryRun) {
          // Refresh status after actual migration
          await getStatus();
        }
      } else {
        setError(result.message || "Migration failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsRunning(false);
    }
  };

  const getStatus = async () => {
    try {
      const response = await fetch("/api/admin/digest-migration", {
        method: "PUT",
      });

      const result = await response.json();

      if (result.success) {
        setMigrationStatus(result.status);
      }
    } catch (err) {
      console.error("Failed to get status:", err);
    }
  };

  const handleDryRun = () => {
    setIsDryRun(true);
    runMigration(true);
  };

  const handleRunMigration = () => {
    setIsDryRun(false);
    runMigration(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Digest Migration</CardTitle>
          <CardDescription>
            Enable digest emails for default categories (Newsletter, Receipt,
            Calendar, Notification, To Reply) for existing users who haven't
            customized their rules.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {migrationStatus && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {migrationStatus.totalUsers}
                </div>
                <div className="text-sm text-muted-foreground">Total Users</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {migrationStatus.migratedUsers}
                </div>
                <div className="text-sm text-muted-foreground">Migrated</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {migrationStatus.pendingUsers}
                </div>
                <div className="text-sm text-muted-foreground">Pending</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {migrationStatus.migrationProgress.toFixed(1)}%
                </div>
                <div className="text-sm text-muted-foreground">Progress</div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleDryRun}
              disabled={isRunning}
              variant="outline"
            >
              {isRunning && isDryRun ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Info className="w-4 h-4 mr-2" />
              )}
              Dry Run
            </Button>

            <Button
              onClick={handleRunMigration}
              disabled={isRunning}
              variant="destructive"
            >
              {isRunning && !isDryRun ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              Run Migration
            </Button>

            <Button
              onClick={getStatus}
              disabled={isRunning}
              variant="secondary"
            >
              Refresh Status
            </Button>
          </div>

          {error && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {migrationStats && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {isDryRun ? "Dry Run Results" : "Migration Results"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="text-center">
                    <div className="text-xl font-bold">
                      {migrationStats.totalUsers}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Users
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">
                      {migrationStats.successfulMigrations}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Successful
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-orange-600">
                      {migrationStats.skippedUsers}
                    </div>
                    <div className="text-sm text-muted-foreground">Skipped</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-red-600">
                      {migrationStats.failedUsers}
                    </div>
                    <div className="text-sm text-muted-foreground">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold">
                      {migrationStats.rulesUpdated}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Rules Updated
                    </div>
                  </div>
                </div>

                {migrationStats.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-red-600 mb-2">Errors:</h4>
                    <div className="space-y-1">
                      {migrationStats.errors.slice(0, 5).map((error, index) => (
                        <div key={index} className="text-sm text-red-600">
                          User {error.userId}: {error.error}
                        </div>
                      ))}
                      {migrationStats.errors.length > 5 && (
                        <div className="text-sm text-muted-foreground">
                          ... and {migrationStats.errors.length - 5} more errors
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Migration Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">Newsletter</Badge>
              <Badge variant="outline">Receipt</Badge>
              <Badge variant="outline">Calendar</Badge>
              <Badge variant="outline">Notification</Badge>
              <Badge variant="outline">To Reply</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              These categories will have digest enabled for users who have the
              default system rules and haven't heavily customized their setup.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
