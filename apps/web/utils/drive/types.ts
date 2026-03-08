// ============================================================================
// Core Drive Types
// ============================================================================

export type DriveProviderType = "google" | "microsoft";

export interface DriveFolder {
  id: string;
  name: string;
  parentId?: string;
  path?: string; // Full path for display (e.g., "/Projects/Acme Corp")
  webUrl?: string; // Link to open in browser
}

export interface DriveFile {
  createdAt?: Date;
  folderId?: string;
  id: string;
  mimeType: string;
  name: string;
  size?: number;
  webUrl?: string; // Link to open in browser
}

export interface UploadFileParams {
  content: Buffer;
  filename: string;
  folderId: string;
  mimeType: string;
}

// ============================================================================
// Drive Provider Interface
// ============================================================================

/**
 * Abstraction for cloud drive operations (Google Drive / OneDrive)
 * Follows the same pattern as EmailProvider.
 *
 * Note: We intentionally don't include delete operations to minimize
 * permissions requested from users. "Undo" is handled by marking
 * the filing as rejected in our database - the file stays in their drive.
 */
export interface DriveProvider {
  /**
   * Create a new folder
   */
  createFolder(name: string, parentId?: string): Promise<DriveFolder>;

  /**
   * Get the current access token (may trigger refresh if expired)
   */
  getAccessToken(): string;

  /**
   * Get file metadata by ID
   */
  getFile(fileId: string): Promise<DriveFile | null>;

  /**
   * Get a specific folder by ID
   */
  getFolder(folderId: string): Promise<DriveFolder | null>;

  /**
   * List folders in a parent folder (or root if no parentId)
   */
  listFolders(parentId?: string): Promise<DriveFolder[]>;

  /**
   * Move a file to a different folder
   */
  moveFile(fileId: string, targetFolderId: string): Promise<DriveFile>;
  readonly name: DriveProviderType;

  /**
   * For serialization/debugging
   */
  toJSON(): { name: string; type: string };

  /**
   * Upload a file to a folder
   */
  uploadFile(params: UploadFileParams): Promise<DriveFile>;
}

// ============================================================================
// OAuth Types
// ============================================================================

/**
 * Tokens returned from OAuth code exchange.
 * Used in callback routes when setting up a new DriveConnection.
 */
export interface DriveTokens {
  accessToken: string;
  email: string;
  expiresAt: Date | null;
  refreshToken: string;
}

/**
 * State passed through OAuth flow to identify the user/account.
 */
export interface DriveOAuthState {
  emailAccountId: string;
  nonce: string;
  type: "drive";
}
