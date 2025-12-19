// ============================================================================
// Core Drive Types
// ============================================================================

export interface DriveFolder {
  id: string;
  name: string;
  path?: string; // Full path for display (e.g., "/Projects/Acme Corp")
  parentId?: string;
  webUrl?: string; // Link to open in browser
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  folderId?: string;
  webUrl?: string; // Link to open in browser
  createdAt?: Date;
}

export interface UploadFileParams {
  filename: string;
  mimeType: string;
  content: Buffer;
  folderId: string;
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
  readonly name: "google" | "microsoft";

  /**
   * For serialization/debugging
   */
  toJSON(): { name: string; type: string };

  // -------------------------------------------------------------------------
  // Folder Operations
  // -------------------------------------------------------------------------

  /**
   * List folders in a parent folder (or root if no parentId)
   */
  listFolders(parentId?: string): Promise<DriveFolder[]>;

  /**
   * Get a specific folder by ID
   */
  getFolder(folderId: string): Promise<DriveFolder | null>;

  /**
   * Create a new folder
   */
  createFolder(name: string, parentId?: string): Promise<DriveFolder>;

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  /**
   * Upload a file to a folder
   */
  uploadFile(params: UploadFileParams): Promise<DriveFile>;

  /**
   * Get file metadata by ID
   */
  getFile(fileId: string): Promise<DriveFile | null>;

  // -------------------------------------------------------------------------
  // Token Management
  // -------------------------------------------------------------------------

  /**
   * Get the current access token (may trigger refresh if expired)
   */
  getAccessToken(): string;
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
  refreshToken: string;
  expiresAt: Date | null;
  email: string;
}

/**
 * State passed through OAuth flow to identify the user/account.
 */
export interface DriveOAuthState {
  emailAccountId: string;
  type: "drive";
  nonce: string;
}
