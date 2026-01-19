// Microsoft Graph Drive scopes
// https://learn.microsoft.com/en-us/graph/permissions-reference#files-permissions

export const MICROSOFT_DRIVE_SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "offline_access", // Required for refresh tokens
  "Files.ReadWrite", // Read and write files in user's OneDrive
  // Note: We intentionally don't request Files.ReadWrite.All (all files user can access)
  // to minimize permissions. Files.ReadWrite covers OneDrive + shared files.
] as const;

// Google Drive scopes
// https://developers.google.com/drive/api/guides/api-specific-auth

export const GOOGLE_DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/drive.file", // Access files created by or opened with the app
  // Note: We use drive.file instead of drive (full access) to minimize permissions
  // This allows us to create files and access files the user explicitly opens with our app
] as const;
