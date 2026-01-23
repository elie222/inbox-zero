/**
 * Email Operations Interface for Plugins
 *
 * Provides direct email manipulation capabilities for plugins.
 * These operations require the email:modify capability (verified trust level).
 *
 * All operations are scoped to the user's own mailbox.
 */

/**
 * Result of a label operation
 */
export interface LabelOperationResult {
  success: boolean;
  /** The actual label ID used (may differ from input if created or mapped) */
  labelId?: string;
}

/**
 * Result of a thread/message modification operation
 */
export interface ModifyOperationResult {
  success: boolean;
}

/**
 * Email operations available to plugins.
 * Requires capability: email:modify (verified trust level)
 */
export interface PluginEmailOperations {
  /**
   * Apply a label to an email thread.
   * If the label doesn't exist, it will be created.
   *
   * @param threadId - The ID of the thread to label
   * @param labelName - The name of the label to apply
   * @returns Result with the label ID used
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.applyLabel(ctx.email.id, 'Processed');
   * ```
   */
  applyLabel(
    threadId: string,
    labelName: string,
  ): Promise<LabelOperationResult>;

  /**
   * Remove a label from an email thread.
   *
   * @param threadId - The ID of the thread to unlabel
   * @param labelName - The name of the label to remove
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.removeLabel(threadId, 'Needs Review');
   * ```
   */
  removeLabel(
    threadId: string,
    labelName: string,
  ): Promise<ModifyOperationResult>;

  /**
   * Move a thread to a specific folder.
   * For Gmail, this applies/removes labels. For Outlook, this moves to a folder.
   *
   * @param threadId - The ID of the thread to move
   * @param folderName - The target folder name (e.g., 'Archive', 'Promotions')
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.moveToFolder(threadId, 'Archive');
   * ```
   */
  moveToFolder(
    threadId: string,
    folderName: string,
  ): Promise<ModifyOperationResult>;

  /**
   * Archive a thread (remove from inbox).
   *
   * @param threadId - The ID of the thread to archive
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.archive(threadId);
   * ```
   */
  archive(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Unarchive a thread (move back to inbox).
   *
   * @param threadId - The ID of the thread to unarchive
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.unarchive(threadId);
   * ```
   */
  unarchive(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Mark a thread as read.
   *
   * @param threadId - The ID of the thread to mark as read
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.markAsRead(threadId);
   * ```
   */
  markAsRead(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Mark a thread as unread.
   *
   * @param threadId - The ID of the thread to mark as unread
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.markAsUnread(threadId);
   * ```
   */
  markAsUnread(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Star a thread (add to starred/flagged items).
   *
   * @param threadId - The ID of the thread to star
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.star(threadId);
   * ```
   */
  star(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Unstar a thread (remove from starred/flagged items).
   *
   * @param threadId - The ID of the thread to unstar
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.unstar(threadId);
   * ```
   */
  unstar(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Mark a thread as important (high priority).
   *
   * @param threadId - The ID of the thread to mark as important
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.markAsImportant(threadId);
   * ```
   */
  markAsImportant(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Remove important flag from a thread.
   *
   * @param threadId - The ID of the thread to mark as not important
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.markAsNotImportant(threadId);
   * ```
   */
  markAsNotImportant(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Move a thread to trash.
   *
   * @param threadId - The ID of the thread to trash
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.trash(threadId);
   * ```
   */
  trash(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Mark a thread as spam.
   *
   * @param threadId - The ID of the thread to mark as spam
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.markAsSpam(threadId);
   * ```
   */
  markAsSpam(threadId: string): Promise<ModifyOperationResult>;

  /**
   * Create a new label/category.
   *
   * @param labelName - The name of the label to create
   * @param description - Optional description for the label
   * @returns The ID of the created label
   *
   * @example
   * ```typescript
   * const labelId = await ctx.emailOperations.createLabel('My Custom Label');
   * ```
   */
  createLabel(labelName: string, description?: string): Promise<string>;

  /**
   * Delete a label/category.
   *
   * @param labelName - The name of the label to delete
   *
   * @example
   * ```typescript
   * await ctx.emailOperations.deleteLabel('Old Label');
   * ```
   */
  deleteLabel(labelName: string): Promise<ModifyOperationResult>;

  /**
   * Get the list of available labels/categories.
   *
   * @returns Array of label objects with id and name
   *
   * @example
   * ```typescript
   * const labels = await ctx.emailOperations.listLabels();
   * console.log(labels.map(l => l.name));
   * ```
   */
  listLabels(): Promise<Array<{ id: string; name: string }>>;
}
