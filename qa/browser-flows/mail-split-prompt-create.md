---
id: mail-split-prompt-create
title: "Create split inbox tabs from a description"
group: email
resources:
  - gmail-account
---

## Goal

Verify the New split popover on the Mail page: creating a tab from a free-text description (AI matches it to a label, category, or state), creating one manually via the searchable list, and refusing descriptions that match nothing.

## Preconditions

- Signed into Inbox Zero with a connected Gmail account.
- The account has at least the default Gmail categories (Personal, Social, Updates, Forums, Promotions).

## Steps

1. Open the Mail page and locate the split tab strip (All, Unread, "+" button).
2. Click the "+" button. Verify the popover shows a description input with a sparkles submit button, then an "Or pick one:" section with a search input and a grouped list (State, Category, and Label when labels exist). Take a screenshot.
3. Type a fragment (for example "up") into the search input. Verify the list narrows to matching options only. Take a screenshot.
4. Clear the search and click an option (for example the "Updates" category). Verify a summary line appears describing the filter and the name field is prefilled with the option name. Take a screenshot.
5. Click "Add split". Verify a new tab with that name appears in the tab strip.
6. Click "+" again. In the description input, type a description that clearly matches an existing category or label without naming it exactly (for example "posts and updates from social networks"). Press Enter.
7. Wait for the request to finish. Verify a new tab appears, is named after the matched filter (for example "Social"), and becomes the active tab (the URL gains a `split` query param). Take a screenshot.
8. Click "+" again. Type a description that matches none of the options (for example "flight itineraries and travel bookings" when no travel label exists). Press Enter.
9. Verify an error toast appears saying it couldn't match the description, the popover stays open, and no new tab is created. Take a screenshot.

## Expected results

- The popover offers both a description input and a searchable option list; the search filters options by name.
- Manual selection shows a filter summary, prefills the name, and creates the tab on "Add split".
- A matching description creates a tab backed by the matched filter, named after what the filter actually shows (not a narrower name), and switches to it.
- A description that no option covers shows the "couldn't match" toast and creates nothing; it must not fall back to a loosely related filter or produce a tab name that misdescribes its contents.

## Failure indicators

- The description input creates a split whose name promises something narrower than the matched filter (for example a "Travel" tab backed by the whole Updates category).
- An unmatched description silently creates a tab instead of showing the error toast.
- The search input does not filter the option list, or selecting an option does not reveal the summary and name field.
- The newly created split does not become the active tab after prompt-based creation.

## Cleanup

- Remove every split created during the test by activating each tab and clicking its "x" button, leaving only All and Unread.
