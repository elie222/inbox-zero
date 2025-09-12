import useSWR from "swr";

export type TeamsInstallation = {
  id: string;
  tenantId: string;
  tenantName: string | null;
  userEmail: string;
  installedTeams: any[] | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GetTeamsInstallationResponse = {
  installation: TeamsInstallation | null;
};

export function useTeamsInstallation() {
  return useSWR<GetTeamsInstallationResponse>("/api/user/teams/installation");
}