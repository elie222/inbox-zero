# System IDs Reference

> Shared configuration for Chief of Staff and Executive Briefing skills.
> Last updated: 2026-03-21

## Google Calendar IDs

| Calendar | ID |
|----------|----|
| **Personal (primary)** | `leekenick@gmail.com` |
| **Smart College** | `cde6ed85e99649430c4821064c4345f4f3b8024376925307ccca79003985651a@group.calendar.google.com` |
| **RMS Work** | `nicholas.leeke@rpsmn.org` |
| **Praxis** | `4ef466c3edc216afb1655ea0f4e76cd45f141eeb48838b9a07bb472e024fa683@group.calendar.google.com` |
| **Nutrition** | `20f52ebce7cb1491b520eb940509c3031d14f1b782fc678c9e00d0a2ba737d1a@group.calendar.google.com` |
| **Workout** | `2b8c2dda0d66dd8f3fa70ad259bf94a7e7827bcbe2fe81434d3d96531cb6bd84@group.calendar.google.com` |
| US Holidays | `en.usa#holiday@group.v.calendar.google.com` |

**Time zone:** `America/Chicago` (CST/CDT)

## Gmail

| Field | Value |
|-------|-------|
| Connected Email | `leekenick@gmail.com` |
| Smart College Email | `nick@smartcollege.com` (Phase 1 — connecting) |
| Praxis Email | `nick@growwithpraxis.com` (Phase 2 — deferred) |

**Gmail Search Queries:**

| Purpose | Query |
|---------|-------|
| Fresh unread (2h) | `is:unread newer_than:2h -category:promotions -category:social` |
| Full day unread | `is:unread newer_than:1d -category:promotions -category:social` |
| Smart College emails | `label:Smart-College is:unread` |
| Flagged to respond | `label:to-respond` |
| Overdue to-respond | `label:to-respond older_than:12h` |
| Overdue Smart College | `label:Smart-College older_than:12h -label:to-respond is:unread` |

## Asana

**Workspaces:**

| Workspace | GID |
|-----------|-----|
| My workspace (personal) | `1204909498385762` |
| rpsmn.org (school district) | `508497351538521` |

**User:**

| Field | Value |
|-------|-------|
| Name | Nick Leeke |
| GID | `1204909498385752` |
| Email | leekenick@gmail.com |

## Acuity Scheduling

| Field | Value |
|-------|-------|
| API Base URL | `https://acuityscheduling.com/api/v1` |
| Web UI (Appointments) | `https://secure.acuityscheduling.com/appointments.php` |
| Web UI (Clients) | `https://secure.acuityscheduling.com/admin/clients` |
| VIP Threshold | 5+ past bookings |
| Session Rate | $130/session |

## Key Rules

- **Tuesday is protected** — no tutoring availability on Tuesdays
- **Time zone is always America/Chicago** for all queries
- **Calendar prefix convention:** no prefix = hard block, ~ = soft, FYI: = informational
- **Nutrition and Workout calendars** are always treated as soft/movable
