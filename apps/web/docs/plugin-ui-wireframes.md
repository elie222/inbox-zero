# Plugin System UI Wireframes

Detailed ASCII wireframes for implementing the plugin system UI in Inbox Zero.

---

## 1. Plugin Library (Browse/Discovery)

```
+-----------------------------------------------------------------------------------+
|  Inbox Zero                                                    [?] [Settings] [U] |
+-----------------------------------------------------------------------------------+
|         |                                                                         |
|  Inbox  |  PLUGIN LIBRARY                                         [Install URL]   |
|  -----  |                                                                         |
|  Sent   |  +-------------------------------------------------------------------+  |
|  Drafts |  |  [Q] Search plugins...                              [Filter v]   |  |
|  Trash  |  +-------------------------------------------------------------------+  |
|         |                                                                         |
|  -----  |  +-------------+  +-------------+  +-------------+  +-------------+     |
|  Labels |  | All         |  | Productivity|  | AI-Powered  |  | Security    |     |
|         |  | (47)        |  | (12)        |  | (8)         |  | (5)         |     |
|  Rules  |  +-------------+  +-------------+  +-------------+  +-------------+     |
|  -----  |                                                                         |
| >Plugins|  Showing 47 plugins                          Sort: [Most Popular v]     |
|         |                                                                         |
|         |  +----------------------------------+  +----------------------------------+
|         |  |  +----+                          |  |  +----+                          |
|         |  |  |icon|  Smart Unsubscribe       |  |  |icon|  Calendar Sync Pro       |
|         |  |  +----+  by EmailTools Inc.      |  |  +----+  by Productivity Labs    |
|         |  |          [Verified] [Popular]    |  |          [Verified]              |
|         |  |                                  |  |                                  |
|         |  |  Automatically detect and        |  |  Two-way sync between your       |
|         |  |  unsubscribe from newsletters    |  |  calendar and email events.      |
|         |  |  with one click. AI-powered...   |  |  Never miss a meeting...         |
|         |  |                                  |  |                                  |
|         |  |                        [Install] |  |                        [Install] |
|         |  +----------------------------------+  +----------------------------------+
|         |                                                                         |
|         |  +----------------------------------+  +----------------------------------+
|         |  |  +----+                          |  |  +----+                          |
|         |  |  |icon|  Email Analytics         |  |  |icon|  Template Manager        |
|         |  |  +----+  by DataViz Co.          |  |  +----+  by Quick Reply          |
|         |  |          [Verified] [New]        |  |          [Community]             |
|         |  |                                  |  |                                  |
|         |  |  Track open rates, response      |  |  Create and manage reusable      |
|         |  |  times, and email patterns.      |  |  email templates. Insert with    |
|         |  |  Beautiful dashboards...         |  |  keyboard shortcuts...           |
|         |  |                                  |  |                                  |
|         |  |                        [Install] |  |                        [Install] |
|         |  +----------------------------------+  +----------------------------------+
|         |                                                                         |
|         |  +-----------------------------------------------------------------------+
|         |  |  [<]  Page 1 of 8   [1] [2] [3] ... [8]  [>]                          |
|         |  +-----------------------------------------------------------------------+
+-----------------------------------------------------------------------------------+
```

### Plugin Card Component:
```
+------------------------------------------+
|  +------+                                |
|  | ICON |  Plugin Name                   |
|  | 48px |  by Author Name                |
|  +------+  [Badge] [Badge] [Badge]       |
|                                          |
|  Short description text that explains    |
|  what this plugin does. Maximum two      |
|  lines with ellipsis overflow...         |
|                                          |
|  +------------------------------------+  |
|  |            [Install]               |  |
|  +------------------------------------+  |
+------------------------------------------+

Badges:
  [Verified]  - Green background, checkmark icon
  [Popular]   - Blue background, trending icon
  [New]       - Purple background, sparkle icon
  [AI]        - Gradient, AI chip icon
  [Community] - Gray background, users icon
```

---

## 2. Plugin Detail Page

```
+-----------------------------------------------------------------------------------+
|  Inbox Zero                                                    [?] [Settings] [U] |
+-----------------------------------------------------------------------------------+
|         |                                                                         |
|  Inbox  |  [< Back to Library]                                                    |
|  -----  |                                                                         |
|  Sent   |  +-------------------------------------------------------------------+  |
|  Drafts |  |                                                                   |  |
|  Trash  |  |  +--------+                                                       |  |
|         |  |  |  ICON  |  Smart Unsubscribe                                    |  |
|  -----  |  |  |  64px  |  by EmailTools Inc.                                   |  |
|  Labels |  |  +--------+                                                       |  |
|         |  |                                                                   |  |
|  Rules  |  |  [Verified Publisher]  [AI-Powered]  [Popular]                    |  |
|  -----  |  |                                                                   |  |
| >Plugins|  |  +-------------------------+  +-------------------------+         |  |
|         |  |  |       [Install]         |  |    [View Source]        |         |  |
|         |  |  +-------------------------+  +-------------------------+         |  |
|         |  |                                                                   |  |
|         |  +-------------------------------------------------------------------+  |
|         |                                                                         |
|         |  +-------------------------------------------------------------------+  |
|         |  | [Overview] | [Permissions] | [Changelog] | [Support]              |  |
|         |  +-------------------------------------------------------------------+  |
|         |                                                                         |
|         |  OVERVIEW                                                               |
|         |  -----------------------------------------------------------------------+
|         |                                                                         |
|         |  Automatically detect and manage newsletter subscriptions in your       |
|         |  inbox. Smart Unsubscribe uses AI to identify subscription emails       |
|         |  and gives you one-click unsubscribe capabilities.                      |
|         |                                                                         |
|         |  KEY FEATURES                                                           |
|         |  - AI-powered newsletter detection                                      |
|         |  - One-click unsubscribe from any email                                 |
|         |  - Subscription dashboard to track all newsletters                      |
|         |  - Bulk unsubscribe from multiple lists at once                         |
|         |                                                                         |
|         |  SCREENSHOTS                                                            |
|         |  +---------------+  +---------------+  +---------------+                |
|         |  | [Screenshot1] |  | [Screenshot2] |  | [Screenshot3] |                |
|         |  +---------------+  +---------------+  +---------------+                |
|         |                                                                         |
|         |  PERMISSIONS SUMMARY                      [View Full Permissions]       |
|         |  +-------------------------------------------------------------------+  |
|         |  |  [✓] Read email headers              Low Risk                     |  |
|         |  |  [✓] Read email body content         Medium Risk                  |  |
|         |  |  [✓] Add labels to emails            Low Risk                     |  |
|         |  |  [✓] Make HTTP requests              Medium Risk                  |  |
|         |  +-------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Permissions Tab:
```
+-----------------------------------------------------------------------+
|  PERMISSIONS & DATA ACCESS                                            |
+-----------------------------------------------------------------------+
|                                                                       |
|  This plugin requests the following permissions:                      |
|                                                                       |
|  EMAIL ACCESS                                                         |
|  +----------------------------------------------------------------+  |
|  |  [✓] emails:read                                                |  |
|  |      Read email content and metadata                            |  |
|  |      Risk: [====----] Medium                                    |  |
|  |      Why needed: To analyze emails for newsletters              |  |
|  +----------------------------------------------------------------+  |
|  |  [✓] labels:write                                               |  |
|  |      Create and apply labels                                    |  |
|  |      Risk: [==------] Low                                       |  |
|  |      Why needed: To organize newsletter emails                  |  |
|  +----------------------------------------------------------------+  |
|                                                                       |
|  +----------------------------------------------------------------+  |
|  |  RISK SUMMARY                                                   |  |
|  |  Overall Risk Level: [======----] MEDIUM                        |  |
|  |  [i] This plugin can read your email content to detect          |  |
|  |      newsletters. It cannot modify or delete emails.           |  |
|  +----------------------------------------------------------------+  |
+-----------------------------------------------------------------------+
```

---

## 3. Install Confirmation Modal

```
+-----------------------------------------------------------------------+
|                                                              [X]      |
|  +--------+                                                           |
|  |  ICON  |  Install Smart Unsubscribe?                               |
|  |  48px  |  by EmailTools Inc. [Verified]                            |
|  +--------+                                                           |
|                                                                       |
|  -------------------------------------------------------------------  |
|                                                                       |
|  PERMISSIONS REQUESTED                                                |
|                                                                       |
|  +---------------------------------------------------------------+   |
|  |  [✓] Read Email Content                          [Medium]     |   |
|  |      Can read the body of your emails                         |   |
|  |                                                               |   |
|  |  [✓] Read Email Headers                          [Low]        |   |
|  |      Can read sender, subject, date                           |   |
|  |                                                               |   |
|  |  [✓] Modify Labels                               [Low]        |   |
|  |      Can add/remove labels on emails                          |   |
|  |                                                               |   |
|  |  [✓] Network Requests                            [Medium]     |   |
|  |      Can connect to: api.emailtools.io                        |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  +---------------------------------------------------------------+   |
|  |  [i] DATA ACCESS SUMMARY                                      |   |
|  |                                                               |   |
|  |  This plugin will be able to:                                 |   |
|  |  • Read all your email content                                |   |
|  |  • Send data to api.emailtools.io                             |   |
|  |  • Add labels to organize emails                              |   |
|  |                                                               |   |
|  |  This plugin CANNOT:                                          |   |
|  |  • Delete emails                                              |   |
|  |  • Send emails on your behalf                                 |   |
|  |  • Access emails in Trash                                     |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  +---------------------------------------------------------------+   |
|  |  OVERALL RISK LEVEL                                           |   |
|  |      [========------] MEDIUM                                  |   |
|  |  [!] This plugin can read your email content.                 |   |
|  |      Only install if you trust this publisher.                |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  [ ] I understand this plugin can access my email content             |
|                                                                       |
|  +-----------------------------+  +-----------------------------+     |
|  |          Cancel             |  |          Install            |     |
|  +-----------------------------+  +-----------------------------+     |
|                                   (disabled until checkbox checked)   |
+-----------------------------------------------------------------------+
```

### Risk Level Variants:
```
LOW RISK (Green):
+---------------------------------------------------------------+
|  OVERALL RISK LEVEL                                           |
|      [====----------] LOW                                     |
|  [✓] This plugin has minimal access to your data.             |
+---------------------------------------------------------------+

MEDIUM RISK (Amber):
+---------------------------------------------------------------+
|  OVERALL RISK LEVEL                                           |
|      [========------] MEDIUM                                  |
|  [!] This plugin can read your email content.                 |
+---------------------------------------------------------------+

HIGH RISK (Red):
+---------------------------------------------------------------+
|  OVERALL RISK LEVEL                                           |
|      [============--] HIGH                                    |
|  [X] This plugin requests sensitive permissions.              |
|      Proceed with caution.                                    |
+---------------------------------------------------------------+
```

---

## 4. Installed Plugins Management

```
+-----------------------------------------------------------------------------------+
|  Inbox Zero                                                    [?] [Settings] [U] |
+-----------------------------------------------------------------------------------+
|         |                                                                         |
|  Inbox  |  INSTALLED PLUGINS                                                      |
|  -----  |                                                                         |
|  Sent   |  +-------------------------------------------------------------------+  |
|  Drafts |  |  [Q] Search installed plugins...                                  |  |
|  Trash  |  +-------------------------------------------------------------------+  |
|         |                                                                         |
|  -----  |  +-------------------------------------------------------------------+  |
|  Labels |  |  [!] 2 updates available                        [Update All]      |  |
|         |  +-------------------------------------------------------------------+  |
|  Rules  |                                                                         |
|  -----  |  5 plugins installed                                                    |
| >Plugins|                                                                         |
|         |  +-------------------------------------------------------------------+  |
|         |  |  +------+  AI Reply Suggestions                 [ON]=========    |  |
|         |  |  | icon |  by SmartMail AI                                        |  |
|         |  |  +------+  v3.1.0 [Verified]                                       |  |
|         |  |            Get context-aware reply suggestions                    |  |
|         |  |            [Settings]  [Uninstall]                                |  |
|         |  +-------------------------------------------------------------------+  |
|         |                                                                         |
|         |  +-------------------------------------------------------------------+  |
|         |  |                                              [UPDATE AVAILABLE]   |  |
|         |  |  +------+  Smart Unsubscribe                    [ON]=========    |  |
|         |  |  | icon |  by EmailTools Inc.                                     |  |
|         |  |  +------+  v2.3.2 -> v2.4.0 [Verified]                             |  |
|         |  |            Automatically detect and unsubscribe                   |  |
|         |  |            [Update]  [Settings]  [Uninstall]                      |  |
|         |  +-------------------------------------------------------------------+  |
|         |                                                                         |
|         |  +-------------------------------------------------------------------+  |
|         |  |  +------+  Calendar Sync Pro                    =========[OFF]   |  |
|         |  |  | icon |  by Productivity Labs                  (disabled)       |  |
|         |  |  +------+  v1.8.0 [Verified]                                       |  |
|         |  |            Two-way calendar and email sync                        |  |
|         |  |            [Settings]  [Uninstall]                                |  |
|         |  +-------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### Empty State:
```
+-------------------------------------------------------------------+
|                                                                   |
|                        +------------------+                       |
|                        |   [Plugin Icon]  |                       |
|                        +------------------+                       |
|                                                                   |
|                     No plugins installed                          |
|                                                                   |
|            Enhance your Inbox Zero experience with                |
|            plugins from trusted developers.                       |
|                                                                   |
|                  +---------------------------+                    |
|                  |   Browse Plugin Library   |                    |
|                  +---------------------------+                    |
+-------------------------------------------------------------------+
```

---

## 5. Plugin Settings Page

```
+-----------------------------------------------------------------------------------+
|  [< Back to Plugins]                                                              |
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  |  +------+  Smart Unsubscribe Settings                             |           |
|  |  | icon |  v2.4.0 by EmailTools Inc. [Verified]                   |           |
|  |  +------+                                                         |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  | [General] | [Detection] | [Notifications] | [Advanced]            |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  GENERAL SETTINGS                                                                 |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  Enable Plugin                                                                    |
|  +-------------------------------------------------------------+                 |
|  |  [ON]=========                                              |                 |
|  |  When disabled, the plugin will not process any emails      |                 |
|  +-------------------------------------------------------------+                 |
|                                                                                   |
|  Default Action for Detected Newsletters                                          |
|  +-------------------------------------------------------------+                 |
|  |  [v] Ask me each time                                       |                 |
|  +-------------------------------------------------------------+                 |
|                                                                                   |
|  Label for Newsletter Emails                                                      |
|  +-------------------------------------------------------------+                 |
|  |  Newsletters                                                |                 |
|  +-------------------------------------------------------------+                 |
|                                                                                   |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  DIGEST SETTINGS                                                                  |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  Enable Digest Mode                                                               |
|  +-------------------------------------------------------------+                 |
|  |  =========[OFF]                                             |                 |
|  |  Bundle newsletters into a single daily email               |                 |
|  +-------------------------------------------------------------+                 |
|                                                                                   |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  +---------------------------+  +---------------------------+                    |
|  |     Reset to Defaults     |  |      Save Changes         |                    |
|  +---------------------------+  +---------------------------+                    |
+-----------------------------------------------------------------------------------+
```

---

## 6. Update Notification

### Navigation Badge:
```
+------------------+
|  Plugins  [2]    |  <- Red badge with update count
+------------------+
```

### Update Banner:
```
+-----------------------------------------------------------------------+
|  [!] 2 plugin updates available                        [Update All]   |
+-----------------------------------------------------------------------+
```

### Update Modal:
```
+-----------------------------------------------------------------------+
|                                                              [X]      |
|  +------+  Update Smart Unsubscribe                                   |
|  | icon |  v2.3.2 -> v2.4.0                                           |
|  +------+                                                             |
|                                                                       |
|  WHAT'S NEW                                                           |
|  +---------------------------------------------------------------+   |
|  |  NEW                                                          |   |
|  |  • Added bulk unsubscribe feature                             |   |
|  |  • New digest scheduling options                              |   |
|  |                                                               |   |
|  |  IMPROVED                                                     |   |
|  |  • 40% faster newsletter detection                            |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  PERMISSION CHANGES                                                   |
|  +---------------------------------------------------------------+   |
|  |  [!] This update requests new permissions:                    |   |
|  |                                                               |   |
|  |  [+] NEW: Access calendar events          [Medium Risk]       |   |
|  |      Needed for: Digest scheduling feature                    |   |
|  +---------------------------------------------------------------+   |
|                                                                       |
|  [ ] I accept the new permissions                                     |
|                                                                       |
|  +---------------------------+  +---------------------------+         |
|  |       Skip Update         |  |        Update Now         |         |
|  +---------------------------+  +---------------------------+         |
+-----------------------------------------------------------------------+
```

---

## 7. Admin Allowlist Settings

```
+-----------------------------------------------------------------------------------+
|  SETTINGS > Plugin Restrictions                                                   |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  |  [i] These settings control which plugins users can install.      |           |
|  |      Only administrators can modify these settings.               |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  PLUGIN INSTALLATION POLICY                                                       |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  (*) Allow all plugins                                                            |
|      Users can install any plugin from the library                                |
|                                                                                   |
|  ( ) Allow verified publishers only                                               |
|      Users can only install plugins from verified publishers                      |
|                                                                                   |
|  ( ) Allow selected plugins only                                                  |
|      Users can only install plugins from the allowlist below                      |
|                                                                                   |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  PLUGIN ALLOWLIST              (only when "selected" is chosen)                   |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  |  [Q] Search plugins...                                           |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  [Select All]  [Clear All]         3 of 47 plugins selected                       |
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  |  [X] AI Reply Suggestions                                         |           |
|  |      by SmartMail AI [Verified]                                   |           |
|  |      Trust Level: [==========] High                               |           |
|  +-------------------------------------------------------------------+           |
|  |  [X] Smart Unsubscribe                                            |           |
|  |      by EmailTools Inc. [Verified]                                |           |
|  |      Trust Level: [========--] Medium-High                        |           |
|  +-------------------------------------------------------------------+           |
|  |  [ ] Email Analytics                                              |           |
|  |      by DataViz Co. [Verified]                                    |           |
|  |      Trust Level: [======----] Medium                             |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  +---------------------------+  +---------------------------+                    |
|  |          Cancel           |  |      Save Changes         |                    |
|  +---------------------------+  +---------------------------+                    |
+-----------------------------------------------------------------------------------+
```

---

## 8. Install from URL

```
+-----------------------------------------------------------------------------------+
|  INSTALL PLUGIN FROM URL                                                          |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  |  [!] Installing plugins from external URLs bypasses the library's |           |
|  |      verification process. Only install from sources you trust.  |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  PLUGIN MANIFEST URL                                                              |
|  -------------------------------------------------------------------             |
|                                                                                   |
|  +-------------------------------------------------------------------+           |
|  |  https://github.com/user/my-plugin                               |           |
|  +-------------------------------------------------------------------+           |
|                                                                                   |
|  +---------------------------+                                                   |
|  |       Fetch Manifest      |                                                   |
|  +---------------------------+                                                   |
+-----------------------------------------------------------------------------------+
```

### Valid Manifest Preview:
```
|  MANIFEST PREVIEW                                                       |
|  +-------------------------------------------------------------------+  |
|  |  +------+  Custom Email Sorter                                    |  |
|  |  | icon |  by developer@example.com                               |  |
|  |  +------+  v1.0.0                                                 |  |
|  |            [UNVERIFIED SOURCE]                                    |  |
|  +-------------------------------------------------------------------+  |
|                                                                         |
|  +-------------------------------------------------------------------+  |
|  |  [!] UNVERIFIED SOURCE WARNING                                    |  |
|  |                                                                   |  |
|  |  This plugin is NOT from the official Inbox Zero library.          |  |
|  |  It has not been reviewed for security or quality.                |  |
|  |                                                                   |  |
|  |  • The source code has not been audited                           |  |
|  |  • The publisher identity is not verified                         |  |
|  +-------------------------------------------------------------------+  |
|                                                                         |
|  [ ] I understand this plugin is from an unverified source              |
|  [ ] I accept the security risks of installing unverified plugins       |
|                                                                         |
|  +---------------------------+  +---------------------------+           |
|  |          Cancel           |  |   Proceed to Install      |           |
|  +---------------------------+  +---------------------------+           |
```

---

## Design Tokens

### Colors (Tailwind)
```
Primary:        blue-500 (#3B82F6)
Success/Low:    emerald-500 (#10B981)
Warning/Medium: amber-500 (#F59E0B)
Danger/High:    red-500 (#EF4444)

Badges:
  Verified:     emerald-500
  Popular:      blue-500
  New:          violet-500
  Community:    gray-500
```

### Spacing
```
Card padding:     p-4 (16px)
Section spacing:  space-y-6 (24px)
Modal padding:    p-6 (24px)
```

### Border Radius
```
Cards:   rounded-lg (8px)
Buttons: rounded-md (6px)
Modals:  rounded-xl (12px)
Badges:  rounded-full
```

### Key Components to Build
1. `PluginCard` - Grid/list item
2. `PermissionList` - With risk indicators
3. `RiskIndicator` - Visual risk bar
4. `InstallModal` - Permission consent
5. `PluginSettingsForm` - Dynamic from schema
6. `TrustBadge` - Verified/Community badges
7. `UpdateBadge` - Notification badge
8. `AllowlistSelector` - Admin checkbox list
