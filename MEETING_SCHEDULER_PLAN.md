# Email-Triggered Meeting Scheduler - Implementation Plan

## Branch: `feature/email-triggered-meeting-scheduler`

## Overview
Implement an AI-powered meeting scheduler that triggers from email patterns:
1. Email to yourself with "Schedule:" in subject
2. "/schedule meeting" in email body (sent or received)
3. Detects patterns in outgoing (Sent) messages

## Trigger Patterns

### Pattern 1: Subject Line Trigger
```
To: yourself@company.com
Subject: Schedule: Q1 Planning Discussion
Body: With john@example.com and sarah@company.com
      30 minutes next Tuesday, use Teams
```

### Pattern 2: Body Command Trigger
```
To: john@example.com
Subject: Project Discussion
Body: Let's discuss this further.

      /schedule meeting
      Duration: 30 minutes
      When: next week Tuesday or Wednesday
      Provider: Teams
```

### Pattern 3: Sent Email Detection
- Monitor sent folder for emails containing trigger patterns
- Extract recipients from To/CC fields
- Process meeting request automatically

---

## Architecture

```
Email Received/Sent
       ↓
Webhook Handler (Gmail/Outlook)
       ↓
Meeting Trigger Detector
       ↓
AI Meeting Parser
       ↓
┌──────────────────────────────────┐
│  1. Extract meeting details      │
│  2. Identify participants        │
│  3. Check calendar availability  │
│  4. Generate meeting link        │
│  5. Create draft invite          │
└──────────────────────────────────┘
       ↓
Draft Email Created in User's Mailbox
```

---

## Implementation Tasks

### Phase 1: Detection & Parsing

#### Task 1.1: Email Trigger Detection
**File:** `apps/web/utils/meetings/detect-meeting-trigger.ts`

```typescript
export interface MeetingTrigger {
  type: 'subject' | 'body' | 'sent';
  email: ParsedEmail;
  threadId: string;
}

export function detectMeetingTrigger(email: ParsedEmail): MeetingTrigger | null {
  // Check Subject: "Schedule:" pattern
  if (email.subject.toLowerCase().startsWith('schedule:')) {
    return { type: 'subject', email, threadId: email.threadId };
  }

  // Check Body: "/schedule meeting" pattern
  if (email.body.toLowerCase().includes('/schedule meeting')) {
    return { type: 'body', email, threadId: email.threadId };
  }

  // Check if sent to self
  if (email.isSent && (
    email.subject.toLowerCase().startsWith('schedule:') ||
    email.body.toLowerCase().includes('/schedule meeting')
  )) {
    return { type: 'sent', email, threadId: email.threadId };
  }

  return null;
}
```

**Dependencies:**
- Extend webhook handlers to check sent folder
- Add `isSent` flag to ParsedEmail type

#### Task 1.2: AI Meeting Parser
**File:** `apps/web/utils/meetings/parse-meeting-request.ts`

```typescript
export interface MeetingRequest {
  participants: string[]; // email addresses
  duration: number; // minutes
  preferredTimeframe: string; // "next Tuesday", "next week", etc.
  provider: 'teams' | 'zoom' | 'meet' | 'none';
  purpose: string; // meeting title/agenda
  location?: string; // for in-person meetings
}

export async function parseMeetingRequest({
  email,
  threadContext,
  emailAccountId,
}: {
  email: ParsedEmail;
  threadContext?: ParsedEmail[]; // previous emails in thread
  emailAccountId: string;
}): Promise<MeetingRequest> {
  const prompt = `
    Extract meeting details from this email and provide a structured response.

    Email Subject: ${email.subject}
    Email Body: ${email.body}
    ${threadContext ? `Thread Context: ${JSON.stringify(threadContext)}` : ''}

    Extract the following information:
    1. Participants (email addresses) - if not specified, use recipients from email
    2. Duration (in minutes, default to 30 if not specified)
    3. Preferred timeframe (e.g., "next Tuesday", "next week Wed/Thu afternoon")
    4. Meeting provider (Teams, Zoom, Google Meet, or none/in-person)
    5. Meeting purpose/title (brief description)
    6. Location (if in-person meeting)

    Return as JSON:
    {
      "participants": ["email1@example.com", "email2@example.com"],
      "duration": 30,
      "preferredTimeframe": "next Tuesday or Wednesday afternoon",
      "provider": "teams",
      "purpose": "Q1 Planning Discussion",
      "location": null
    }
  `;

  const response = await aiCall({
    model: 'gpt-4o-mini',
    prompt,
    emailAccountId,
  });

  return JSON.parse(response);
}
```

**Dependencies:**
- Use existing AI utilities from `utils/ai/`
- Integrate with LLM configuration

#### Task 1.3: Webhook Integration
**Files:**
- `apps/web/app/api/webhook/gmail/route.ts`
- `apps/web/app/api/webhook/outlook/route.ts`

```typescript
// Add to webhook handler
const trigger = detectMeetingTrigger(parsedEmail);

if (trigger) {
  await handleMeetingScheduleRequest({
    trigger,
    emailAccountId,
  });
}
```

---

### Phase 2: Availability & Scheduling

#### Task 2.1: Availability Checker
**File:** `apps/web/utils/meetings/find-availability.ts`

```typescript
export interface TimeSlot {
  start: Date;
  end: Date;
  confidence: 'high' | 'medium' | 'low'; // based on participant availability
}

export async function findOptimalMeetingTimes({
  participants,
  duration,
  preferredTimeframe,
  emailAccountId,
}: {
  participants: string[];
  duration: number;
  preferredTimeframe: string;
  emailAccountId: string;
}): Promise<TimeSlot[]> {
  // Parse timeframe to date range
  const { startDate, endDate } = parseTimeframe(preferredTimeframe);

  // Get organizer's calendar availability
  const organizerBusyPeriods = await getUnifiedCalendarAvailability({
    emailAccountId,
    startDate,
    endDate,
  });

  // TODO: Check participant availability (future enhancement)
  // For now, only check organizer's calendar

  // Find free slots
  const freeSlots = findFreeSlots({
    busyPeriods: organizerBusyPeriods,
    duration,
    startDate,
    endDate,
    workingHours: { start: '09:00', end: '17:00' },
    bufferTime: 15, // minutes
  });

  // Rank slots by preference
  const rankedSlots = rankTimeSlots(freeSlots, preferredTimeframe);

  return rankedSlots.slice(0, 3); // Return top 3 options
}

function parseTimeframe(timeframe: string): { startDate: Date; endDate: Date } {
  // Use AI or date parsing library to convert natural language to dates
  // "next Tuesday" -> specific date range
  // "next week" -> Monday-Friday of next week
  // etc.
}

function findFreeSlots(params: {
  busyPeriods: BusyPeriod[];
  duration: number;
  startDate: Date;
  endDate: Date;
  workingHours: { start: string; end: string };
  bufferTime: number;
}): TimeSlot[] {
  // Algorithm to find free time slots
  // Respect working hours
  // Add buffer time between meetings
}

function rankTimeSlots(slots: TimeSlot[], preferredTimeframe: string): TimeSlot[] {
  // Rank slots based on:
  // - Matches preferred timeframe
  // - Time of day (prefer mornings/afternoons based on pattern)
  // - Avoid back-to-back meetings
}
```

**Dependencies:**
- Use existing `getUnifiedCalendarAvailability` from `utils/calendar/unified-availability.ts`
- Add date parsing utility (could use `chrono-node` library)

---

### Phase 3: Meeting Link Generation

#### Task 3.1: Teams Meeting Generator
**File:** `apps/web/utils/meetings/providers/teams.ts`

```typescript
export async function createTeamsMeeting({
  title,
  startTime,
  duration,
  participants,
  emailAccountId,
}: {
  title: string;
  startTime: Date;
  duration: number;
  participants: string[];
  emailAccountId: string;
}): Promise<string> {
  // Get Outlook client
  const outlook = await getOutlookClientWithRefresh({
    // ... get tokens from emailAccount
  });

  // Create online meeting via Microsoft Graph
  const meeting = await outlook
    .api('/me/onlineMeetings')
    .post({
      subject: title,
      startDateTime: startTime.toISOString(),
      endDateTime: addMinutes(startTime, duration).toISOString(),
      participants: {
        attendees: participants.map(email => ({
          identity: {
            user: {
              id: email
            }
          }
        }))
      }
    });

  return meeting.joinUrl;
}
```

**Dependencies:**
- Use existing Outlook client from `utils/outlook/calendar-client.ts`
- Microsoft Graph API permissions: `OnlineMeetings.ReadWrite`

#### Task 3.2: Zoom Meeting Generator
**File:** `apps/web/utils/meetings/providers/zoom.ts`

```typescript
export async function createZoomMeeting({
  title,
  startTime,
  duration,
  emailAccountId,
}: {
  title: string;
  startTime: Date;
  duration: number;
  emailAccountId: string;
}): Promise<string> {
  // Get Zoom credentials from user settings or env
  const zoomApiKey = process.env.ZOOM_API_KEY;
  const zoomApiSecret = process.env.ZOOM_API_SECRET;

  // Create Zoom meeting
  const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${generateZoomJWT(zoomApiKey, zoomApiSecret)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: title,
      type: 2, // Scheduled meeting
      start_time: startTime.toISOString(),
      duration: duration,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
      }
    })
  });

  const meeting = await response.json();
  return meeting.join_url;
}
```

**Dependencies:**
- Add Zoom API credentials to environment
- Install `jsonwebtoken` for JWT generation

#### Task 3.3: Google Meet Generator
**File:** `apps/web/utils/meetings/providers/google-meet.ts`

```typescript
export async function createGoogleMeet({
  title,
  startTime,
  duration,
  participants,
  emailAccountId,
}: {
  title: string;
  startTime: Date;
  duration: number;
  participants: string[];
  emailAccountId: string;
}): Promise<string> {
  // Get Gmail client
  const gmail = await getGmailClientWithRefresh({
    // ... get tokens from emailAccount
  });

  // Create calendar event with Meet link
  const event = await gmail.calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    requestBody: {
      summary: title,
      start: {
        dateTime: startTime.toISOString(),
      },
      end: {
        dateTime: addMinutes(startTime, duration).toISOString(),
      },
      attendees: participants.map(email => ({ email })),
      conferenceData: {
        createRequest: {
          requestId: generateRequestId(),
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      }
    }
  });

  return event.data.hangoutLink || event.data.conferenceData?.entryPoints?.[0]?.uri || '';
}
```

**Dependencies:**
- Use existing Gmail client
- Google Calendar API permissions already available

---

### Phase 4: Calendar Event Creation

#### Task 4.1: Calendar Event Creator
**File:** `apps/web/utils/meetings/create-calendar-event.ts`

```typescript
export interface CalendarEventDetails {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
  attendees: string[];
  meetingLink?: string;
  location?: string;
}

export async function createCalendarEvent({
  eventDetails,
  emailAccountId,
  sendInvites = true,
}: {
  eventDetails: CalendarEventDetails;
  emailAccountId: string;
  sendInvites?: boolean;
}): Promise<{ eventId: string; eventLink: string }> {
  // Get email account and provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    include: { account: true },
  });

  const isGmail = isGoogleProvider(emailAccount.account.provider);

  if (isGmail) {
    return await createGoogleCalendarEvent({
      eventDetails,
      emailAccountId,
      sendInvites,
    });
  } else {
    return await createOutlookCalendarEvent({
      eventDetails,
      emailAccountId,
      sendInvites,
    });
  }
}

async function createGoogleCalendarEvent({
  eventDetails,
  emailAccountId,
  sendInvites,
}: {
  eventDetails: CalendarEventDetails;
  emailAccountId: string;
  sendInvites: boolean;
}): Promise<{ eventId: string; eventLink: string }> {
  const gmail = await getGmailClientWithRefresh({
    // ... get tokens from emailAccount
  });

  // Create calendar event
  const event = await gmail.calendar.events.insert({
    calendarId: 'primary',
    sendUpdates: sendInvites ? 'all' : 'none', // Automatically sends invites
    requestBody: {
      summary: eventDetails.title,
      description: eventDetails.description,
      start: {
        dateTime: eventDetails.startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: eventDetails.endTime.toISOString(),
        timeZone: 'UTC',
      },
      attendees: eventDetails.attendees.map(email => ({
        email,
        responseStatus: 'needsAction',
      })),
      location: eventDetails.meetingLink || eventDetails.location,
      conferenceData: eventDetails.meetingLink ? undefined : {
        createRequest: {
          requestId: generateRequestId(),
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      },
    },
  });

  return {
    eventId: event.data.id!,
    eventLink: event.data.htmlLink!,
  };
}

async function createOutlookCalendarEvent({
  eventDetails,
  emailAccountId,
  sendInvites,
}: {
  eventDetails: CalendarEventDetails;
  emailAccountId: string;
  sendInvites: boolean;
}): Promise<{ eventId: string; eventLink: string }> {
  const outlook = await getOutlookClientWithRefresh({
    // ... get tokens from emailAccount
  });

  // Create calendar event
  const event = await outlook.api('/me/events').post({
    subject: eventDetails.title,
    body: {
      contentType: 'HTML',
      content: eventDetails.description,
    },
    start: {
      dateTime: eventDetails.startTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: eventDetails.endTime.toISOString(),
      timeZone: 'UTC',
    },
    attendees: eventDetails.attendees.map(email => ({
      emailAddress: { address: email },
      type: 'required',
    })),
    location: eventDetails.meetingLink ? {
      displayName: 'Online Meeting',
      locationType: 'default',
    } : eventDetails.location ? {
      displayName: eventDetails.location,
      locationType: 'default',
    } : undefined,
    isOnlineMeeting: !!eventDetails.meetingLink,
    onlineMeetingUrl: eventDetails.meetingLink,
  });

  // Outlook automatically sends invites when attendees are added
  return {
    eventId: event.id,
    eventLink: event.webLink,
  };
}

async function generateMeetingDescription(params: {
  purpose: string;
  participants: string[];
  duration: number;
  meetingLink?: string;
}): Promise<string> {
  // Use AI to generate professional meeting description
  const prompt = `
    Generate a professional meeting description for a calendar invite.

    Meeting: ${params.purpose}
    Attendees: ${params.participants.join(', ')}
    Duration: ${params.duration} minutes
    ${params.meetingLink ? `Meeting Link: ${params.meetingLink}` : ''}

    Keep it concise, professional, and include any relevant context.
    Format for email/calendar body.
  `;

  return await aiCall({ prompt, model: 'gpt-4o-mini' });
}
```

**Dependencies:**
- Install `ics` library for calendar file generation
- Use existing AI utilities

#### Task 4.2: Notification Email (Optional)
**File:** `apps/web/utils/meetings/send-notification.ts`

```typescript
export async function sendMeetingScheduledNotification({
  meetingRequest,
  eventDetails,
  eventLink,
  emailAccountId,
}: {
  meetingRequest: MeetingRequest;
  eventDetails: CalendarEventDetails;
  eventLink: string;
  emailAccountId: string;
}): Promise<void> {
  // Optional: Send a confirmation email to the organizer
  // that the meeting was scheduled

  const emailBody = `
    Your meeting has been scheduled successfully!

    Meeting: ${eventDetails.title}
    When: ${formatDateTime(eventDetails.startTime)}
    Duration: ${meetingRequest.duration} minutes
    Attendees: ${eventDetails.attendees.join(', ')}

    View in calendar: ${eventLink}
    ${eventDetails.meetingLink ? `\nJoin meeting: ${eventDetails.meetingLink}` : ''}
  `;

  // Send notification email to organizer
  await sendEmail({
    to: [emailAccountId], // Send to self
    subject: `Meeting Scheduled: ${eventDetails.title}`,
    body: emailBody,
    emailAccountId,
  });
}
```

**Note:** This is optional since calendar invites are sent automatically. The organizer will receive the calendar invite like any other attendee.

---

### Phase 5: Main Orchestrator

#### Task 5.1: Meeting Scheduler Handler
**File:** `apps/web/utils/meetings/handle-meeting-request.ts`

```typescript
export async function handleMeetingScheduleRequest({
  trigger,
  emailAccountId,
}: {
  trigger: MeetingTrigger;
  emailAccountId: string;
}): Promise<void> {
  const logger = createScopedLogger('meeting-scheduler');

  try {
    logger.info('Processing meeting schedule request', {
      type: trigger.type,
      emailId: trigger.email.id,
    });

    // Step 1: Parse meeting request
    const meetingRequest = await parseMeetingRequest({
      email: trigger.email,
      threadContext: trigger.email.threadMessages,
      emailAccountId,
    });

    logger.info('Parsed meeting request', { meetingRequest });

    // Step 2: Find available time slots
    const timeSlots = await findOptimalMeetingTimes({
      participants: meetingRequest.participants,
      duration: meetingRequest.duration,
      preferredTimeframe: meetingRequest.preferredTimeframe,
      emailAccountId,
    });

    if (timeSlots.length === 0) {
      logger.warn('No available time slots found');
      // TODO: Send notification to user
      return;
    }

    logger.info('Found time slots', { count: timeSlots.length });

    // Step 3: Generate meeting link (if provider specified)
    let meetingLink: string | undefined;

    if (meetingRequest.provider !== 'none') {
      try {
        meetingLink = await generateMeetingLink({
          provider: meetingRequest.provider,
          title: meetingRequest.purpose,
          startTime: timeSlots[0].start,
          duration: meetingRequest.duration,
          participants: meetingRequest.participants,
          emailAccountId,
        });

        logger.info('Generated meeting link', { provider: meetingRequest.provider });
      } catch (error) {
        logger.error('Failed to generate meeting link', { error });
        // Continue without meeting link
      }
    }

    // Step 4: Generate meeting description
    const description = await generateMeetingDescription({
      purpose: meetingRequest.purpose,
      participants: meetingRequest.participants,
      duration: meetingRequest.duration,
      meetingLink,
    });

    logger.info('Generated meeting description');

    // Step 5: Create calendar event (automatically sends invites)
    const { eventId, eventLink } = await createCalendarEvent({
      eventDetails: {
        title: meetingRequest.purpose,
        description,
        startTime: timeSlots[0].start,
        endTime: timeSlots[0].end,
        attendees: meetingRequest.participants,
        meetingLink,
        location: meetingRequest.location,
      },
      emailAccountId,
      sendInvites: true, // Automatically send calendar invites
    });

    logger.info('Created calendar event and sent invites', { eventId });

    // Step 6: Log to database
    await prisma.meetingScheduleLog.create({
      data: {
        emailAccountId,
        triggerEmailId: trigger.email.id,
        meetingRequest: meetingRequest as any,
        timeSlots: timeSlots as any,
        meetingLink,
        eventId,
        eventLink,
        status: 'invite_sent',
      },
    });

  } catch (error) {
    logger.error('Failed to handle meeting schedule request', { error });
    throw error;
  }
}

async function generateMeetingLink(params: {
  provider: 'teams' | 'zoom' | 'meet';
  title: string;
  startTime: Date;
  duration: number;
  participants: string[];
  emailAccountId: string;
}): Promise<string> {
  switch (params.provider) {
    case 'teams':
      return await createTeamsMeeting(params);
    case 'zoom':
      return await createZoomMeeting(params);
    case 'meet':
      return await createGoogleMeet(params);
    default:
      throw new Error(`Unknown provider: ${params.provider}`);
  }
}
```

---

### Phase 6: User Settings & Configuration

#### Task 6.1: Database Schema
**File:** `prisma/schema.prisma`

```prisma
model MeetingSchedulerSettings {
  id              String   @id @default(cuid())
  emailAccountId  String   @unique
  emailAccount    EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  enabled         Boolean  @default(true)
  defaultDuration Int      @default(30) // minutes
  defaultProvider String   @default("teams") // teams, zoom, meet, none
  bufferTime      Int      @default(15) // minutes between meetings

  workingHoursStart String @default("09:00")
  workingHoursEnd   String @default("17:00")
  timezone          String @default("UTC")

  preferredDays   String[] @default(["monday", "tuesday", "wednesday", "thursday", "friday"])

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([emailAccountId])
}

model MeetingScheduleLog {
  id              String   @id @default(cuid())
  emailAccountId  String
  emailAccount    EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  triggerEmailId  String
  meetingRequest  Json     // MeetingRequest object
  timeSlots       Json     // TimeSlot[] array
  meetingLink     String?
  eventId         String?  // Calendar event ID
  eventLink       String?  // Link to view event in calendar
  status          String   // invite_sent, failed
  error           String?

  createdAt       DateTime @default(now())

  @@index([emailAccountId])
  @@index([createdAt])
}
```

#### Task 6.2: Settings UI
**File:** `apps/web/app/(app)/[emailAccountId]/settings/MeetingSchedulerSettings.tsx`

```tsx
export function MeetingSchedulerSettings() {
  const { emailAccountId } = useAccount();
  const { data: settings, mutate } = useSWR<MeetingSchedulerSettings>(
    `/api/user/meeting-scheduler/settings`
  );

  // Form component for managing settings
  // - Enable/disable feature
  // - Default duration
  // - Default provider
  // - Working hours
  // - Auto-send vs draft
  // etc.
}
```

---

## File Structure

```
apps/web/
├── app/
│   ├── api/
│   │   ├── webhook/
│   │   │   ├── gmail/route.ts (modify)
│   │   │   └── outlook/route.ts (modify)
│   │   └── user/
│   │       └── meeting-scheduler/
│   │           └── settings/route.ts (new)
│   └── (app)/
│       └── [emailAccountId]/
│           └── settings/
│               └── MeetingSchedulerSettings.tsx (new)
├── utils/
│   └── meetings/
│       ├── detect-meeting-trigger.ts (new)
│       ├── parse-meeting-request.ts (new)
│       ├── find-availability.ts (new)
│       ├── create-calendar-event.ts (new)
│       ├── handle-meeting-request.ts (new)
│       └── providers/
│           ├── teams.ts (new)
│           ├── zoom.ts (new)
│           └── google-meet.ts (new)
└── prisma/
    └── schema.prisma (modify)
```

---

## Testing Strategy

### Unit Tests
- Test meeting trigger detection
- Test AI parsing with various email formats
- Test time slot finding algorithm
- Test MIME message generation

### Integration Tests
- Test full flow from email trigger to draft creation
- Test with both Gmail and Outlook
- Test with different meeting providers

### Manual Testing Checklist
- [ ] Email to self with "Schedule:" in subject
- [ ] Email with "/schedule meeting" in body
- [ ] Sent email with trigger patterns
- [ ] Extract participants from CC
- [ ] Parse various time formats ("next Tuesday", "next week", etc.)
- [ ] Generate Teams meeting link
- [ ] Generate Zoom meeting link (if configured)
- [ ] Generate Google Meet link
- [ ] Create calendar event in Google Calendar
- [ ] Create calendar event in Outlook Calendar
- [ ] Verify invites sent to attendees automatically
- [ ] Check attendees receive calendar invites
- [ ] Verify meeting link in calendar event
- [ ] Check calendar availability
- [ ] Respect working hours
- [ ] Handle errors gracefully

---

## Environment Variables

Add to `.env.example`:

```bash
# Meeting Scheduler (Optional)
ZOOM_API_KEY=
ZOOM_API_SECRET=

# Microsoft Teams uses existing MICROSOFT_CLIENT_ID/SECRET
# Google Meet uses existing GOOGLE_CLIENT_ID/SECRET
```

---

## Dependencies to Install

```bash
pnpm add chrono-node
```

**Note:** No longer need `ics` library since we're using native calendar APIs.

---

## Rollout Plan

### Phase 1: Core Detection & Parsing (Week 1)
- Implement trigger detection
- Build AI parser
- Add webhook integration
- Basic testing

### Phase 2: Availability & Scheduling (Week 1-2)
- Implement availability checker
- Time slot ranking
- Integration with existing calendar APIs

### Phase 3: Meeting Links (Week 2)
- Teams integration
- Google Meet integration
- Zoom integration (optional)

### Phase 4: Calendar Event Creation (Week 2-3)
- Meeting description generation
- Calendar event creation via Google Calendar API
- Calendar event creation via Microsoft Graph API
- Automatic invite sending

### Phase 5: Polish & Settings (Week 3)
- User settings UI
- Database logging
- Error handling
- Documentation

### Phase 6: Testing & Deployment (Week 3-4)
- Comprehensive testing
- Bug fixes
- Production deployment

---

## Success Metrics

- Number of meeting schedule requests detected
- Success rate of draft creation
- User adoption rate
- Time saved (estimated)
- User feedback/satisfaction

---

## Future Enhancements

1. **Participant Availability Checking**
   - Check external calendars
   - Integration with scheduling tools (Calendly, etc.)

2. **Smart Time Suggestions**
   - Learn from past meeting patterns
   - Optimize for timezone differences
   - Consider travel time

3. **Group Scheduling**
   - Find time that works for multiple people
   - Voting on proposed times

4. **Meeting Templates**
   - Save common meeting types
   - Quick scheduling for recurring meetings

5. **Reminders & Follow-ups**
   - Send reminder before meeting
   - Automatic follow-up after meeting

---

## Notes

- Start with Gmail testing since it's primary provider
- Teams integration requires Microsoft Graph API permissions
- Consider rate limits for meeting link generation
- Cache calendar availability data to reduce API calls
- Implement queue system for processing meeting requests
