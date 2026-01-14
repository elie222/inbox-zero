/**
 * Type of draft to generate. Each type has different AI prompting behavior.
 * - DEFAULT: Standard reply draft based on thread context
 * - FOLLOW_UP: Follow-up reminder when user is waiting for a response
 */
export enum DraftType {
  DEFAULT = "default",
  FOLLOW_UP = "follow-up",
}
