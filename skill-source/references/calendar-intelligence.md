# Calendar Intelligence — Scheduling Decision Engine

This document defines how the Chief of Staff determines true availability by cross-referencing Acuity Scheduling with Google Calendar.

## The Problem

Acuity knows when tutoring slots are "open" based on configured availability windows. But Acuity doesn't know about dinner plans, doctor appointments, or personal commitments on Google Calendar. Conversely, Google Calendar doesn't know about Acuity bookings. The Chief of Staff bridges this gap.

## Calendar Prefix Convention

Nick uses a prefix system on Google Calendar event titles to signal how the bot should treat each event:

| Prefix | Meaning | Scheduling Impact | Example |
|--------|---------|-------------------|---------|
| *(none)* | **Hard block** | Slot is unavailable, period | "Dinner with Sarah", "Staff Meeting", "Doctor Appointment" |
| `~` | **Soft/movable** | Slot is available but conflicted — note the overlap | "~Call dentist", "~Grocery run", "~Review Praxis roadmap" |
| `FYI:` | **Informational** | Completely ignored for scheduling | "FYI: Sarah's birthday", "FYI: Q2 taxes due" |

**Default behavior is safe:** Everything without a prefix blocks the slot. Nick only needs to remember the tilde for items he's willing to move.

## Google Calendar IDs to Check

Check ALL of these calendars when evaluating a time slot:

| Calendar | ID | Notes |
|----------|----|-------|
| Personal (primary) | `leekenick@gmail.com` | Most personal events live here |
| Smart College | `cde6ed85e99649430c4821064c4345f4f3b8024376925307ccca79003985651a@group.calendar.google.com` | Tutoring sessions (may duplicate Acuity) |
| RMS Work | `nicholas.leeke@rpsmn.org` | School schedule — hard blocks during school hours |
| Praxis | `4ef466c3edc216afb1655ea0f4e76cd45f141eeb48838b9a07bb472e024fa683@group.calendar.google.com` | Meetings, standups |
| Nutrition | `20f52ebce7cb1491b520eb940509c3031d14f1b782fc678c9e00d0a2ba737d1a@group.calendar.google.com` | Meal reminders — treat as soft/FYI |
| Workout | `2b8c2dda0d66dd8f3fa70ad259bf94a7e7827bcbe2fe81434d3d96531cb6bd84@group.calendar.google.com` | Workout blocks — treat as soft unless labeled otherwise |

**Time zone:** Always use `America/Chicago` for all calendar queries.

## The Decision Tree

When a scheduling request comes in, follow this sequence:

### 1. Parse the Request

Extract from the email:
- **Client name** (may be student name — map to parent name for Acuity)
- **Requested date/time** (may be specific or flexible: "next Saturday" vs "sometime this week")
- **Action type**: new booking, reschedule (from → to), cancel, or availability inquiry
- **Urgency/tone**: is this a polite request or a frustrated "we need to change this ASAP"?

### 2. Check Acuity Availability

For the requested date/time range:
- Navigate to Acuity calendar view for that date
- Identify open slots within Nick's configured tutoring windows
- Note any existing appointments that might conflict

If the request is a **reschedule**, also identify the current appointment to be moved.

### 3. Cross-Reference Google Calendar

For each candidate Acuity slot, query ALL Google Calendars for that time window (add 15-minute buffer on each side for travel/transition):

```
For each candidate_slot:
  events = query all calendars for (slot_start - 15min) to (slot_end + 15min)

  for each event in events:
    if event.title starts with "FYI:":
      → IGNORE (informational only)

    elif event.title starts with "~":
      → SOFT CONFLICT (slot is usable but note the overlap)
      → Add to conflicts list: "Overlaps with: [event title without ~]"

    elif event is from Nutrition or Workout calendar:
      → SOFT CONFLICT (these are inherently flexible)
      → Add to conflicts list: "Overlaps with: [event title] (movable)"

    else:
      → HARD BLOCK (slot is unavailable)
      → Remove slot from candidates
```

### 4. Check VIP Status

Query Acuity client history to count past bookings for this client:
- Navigate to Acuity Clients page → search client name
- Count completed appointments (or check appointment history)
- If **5 or more past bookings** → client is VIP

**VIP privileges:**
- If no standard-window slots work, also check slots **1 hour before and 1 hour after** the normal tutoring windows
- If a slot has only a soft conflict, lean toward offering it to the VIP with a note
- In the draft response, use warmer language: "I can make this work for you" vs standard "Here are the available times"

### 5. Build the Response

**If clear slot(s) available:**
Offer 2-3 options ranked by convenience (fewest conflicts first, closest to requested time first).

**If only soft-conflict slots available:**
Offer them with a note about the overlap. In the internal report, flag what Nick may need to move.

**If no slots available (standard windows):**
- For VIP: check expanded windows and offer those
- For standard clients: express regret and offer alternative dates/times
- Always suggest at least one alternative

**If this is a reschedule or booking (not just an inquiry):**
Execute the action in Acuity immediately (the skill has full access), then draft the confirmation email.

### 6. Report to Nick

In the Chief of Staff report, include:
- What was requested
- What you did (or what draft you prepared)
- Any calendar conflicts to be aware of
- Whether the client is VIP and if expanded windows were used

## Special Rules

### Tuesday Protection
Tuesday is Nick's protected recovery day. **Never** suggest Tuesday availability for tutoring, even for VIP clients. If a client specifically requests Tuesday, draft a response redirecting to the nearest available day.

### Back-to-Back Session Limit
If scheduling a new session would create 3+ consecutive tutoring slots (no break), flag this in the report: "⚡ This would create [N] back-to-back sessions. Consider suggesting [alternative time] instead."

### School Hours
During the school year, RMS Work calendar blocks are always hard blocks regardless of prefix. School commitments are non-negotiable.

### Same-Day Requests
If someone requests a session for today or tomorrow, escalate to **Urgent** category regardless of other factors. Same-day scheduling needs Nick's direct attention.
