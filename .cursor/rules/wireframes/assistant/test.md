# AI Assistant Test Page

This wireframe represents the Test tab within the AI Assistant section.

## Layout
┌─────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                       │
│ [Logo: INBOX ZERO]                                              [⎕] (icon)  │
├───────────────────────┬─────────────────────────────────────────────────────┤
│ SIDEBAR               │ MAIN CONTENT                                        │
│                       │                                                     │
│ [Avatar] James Matt   │ AI Assistant    [▷ Watch demo]         [💬 AI Chat] │
│ demo123456789@gmail   │                                                     │
│                       │ [Rules] [Test] [History] [Settings]                 │
│                       │          ^^^^                                       │
│ Platform              │          active                                     │
│ ● Assistant      ←    │                                                     │
│ ○ Bulk Unsubscribe    │ Check how your rules perform against previous       │
│ ○ Deep Clean          │ emails                                              │
│ ○ Analytics           │                                                     │
│ ○ Calendars           │ [🤖 Test All]                    Test [○━━] Apply   │
│ ○ Meeting Briefs [New]│                          [✎ Custom] [Search emails..]│
│                       │                                                     │
│                       │ ┌─────────────────────────────────────────────────┐ │
│                       │ │ EMAIL TEST RESULT CARD                          │ │
│                       │ │                                                 │ │
│                       │ │ {Sender} [↗] [✉]    [Category Badge]            │ │
│                       │ │ **{Email Subject}**                             │ │
│                       │ │ {Email body preview text, truncated...}         │ │
│                       │ │                                                 │ │
│                       │ │              [{Category} ✓] [💬 Fix] [↻ Retest] │ │
│                       │ └─────────────────────────────────────────────────┘ │
│                       │                                                     │
│                       │ ┌─────────────────────────────────────────────────┐ │
│                       │ │ {Sender} [↗] [✉]    [Category Badge]            │ │
│                       │ │ **{Email Subject}**                             │ │
│                       │ │ {Email body preview text, truncated...}         │ │
│                       │ │                                                 │ │
│                       │ │              [{Category} ✓] [💬 Fix] [↻ Retest] │ │
│                       │ └─────────────────────────────────────────────────┘ │
│                       │                                                     │
│                       │ ┌─────────────────────────────────────────────────┐ │
│                       │ │ {Sender} [↗] [✉]    [Category Badge]            │ │
│                       │ │ **{Email Subject}**                             │ │
│                       │ │ {Email body preview text, truncated...}         │ │
│                       │ │                                                 │ │
│                       │ │              [{Category} ✓] [💬 Fix] [↻ Retest] │ │
│                       │ └─────────────────────────────────────────────────┘ │
│                       │                                                     │
│                       │ ... (scrollable list continues)                     │
│                       │                                                     │
│ SIDEBAR FOOTER        │                                                     │
│ ○ Refer friend        │                                        [💬 Chat]   │
│ ○ Help Center         │                                        (Intercom)  │
│ ○ Settings            │                                                     │
│                       │                                                     │
│ [Avatar] James Matt   │                                                     │
│ test                  │                                                     │
└───────────────────────┴─────────────────────────────────────────────────────┘

## Key Elements
- **Page**: AI Assistant → Test tab
- **Purpose**: Test rules against previous emails to see classification results
- **Controls**:
    - **Test All** button (primary action)
    - **Test/Apply toggle** (test mode vs live mode)
    - **Custom** button + search input for filtering emails
- **Email Card Structure**:
    - Sender name + external link [↗] + email icon [✉]
    - Category badge showing detected classification
    - Subject line (bold)
    - Body preview (truncated)
    - Actions: Category result with checkmark, "Fix" button, "Retest" button
- **List**: Scrollable, shows multiple test results

