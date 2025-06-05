### The following model would store frequencies per user.

- A frequency can be from the predefined values from the existing Frequency enum: DAILY, WEEKLY, etc

```prisma
model UserFrequency {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // For custom frequencies
  intervalDays    Int?     // Total interval in days
  occurrences     Int?     // Number of times within the interval

  // Bit mask for days of week (0b0000000 to 0b1111111)
  // Each bit represents a day (Sunday to Saturday)
  // e.g., 0b1000001 means Sunday and Saturday
  daysOfWeek     Int?     // 0-127 (2^7 - 1)

  // Optional time of day for specific scheduling
  timeOfDay      String?  // "HH:mm" format, e.g., "09:00"

  // Relation to EmailAccount
  emailAccountId String
  emailAccount   EmailAccount @relation(fields: [emailAccountId], references: [id], onDelete: Cascade)

  @@unique([emailAccountId])
}
```

### Given these masks

```typescript
// Constants for days of week
const DAYS = {
  SUNDAY: 0b1000000, // 64
  MONDAY: 0b0100000, // 32
  TUESDAY: 0b0010000, // 16
  WEDNESDAY: 0b0001000, // 8
  THURSDAY: 0b0000100, // 4
  FRIDAY: 0b0000010, // 2
  SATURDAY: 0b0000001, // 1
};
```

### How to implement some custom frequencies

```typescript
// Every 3 days
{
  type: "CUSTOM",
  intervalDays: 3,
  occurrences: 1,
  timeOfDay: "09:00"
}

// Twice a week on specific days
{
  type: "CUSTOM",
  intervalDays: 7,
  occurrences: 2,
  daysOfWeek: DAYS.MONDAY | DAYS.WEDNESDAY, // 0b0101000 (40)
  timeOfDay: "09:00"
}

// Every weekday
{
  type: "CUSTOM",
  intervalDays: 7,
  occurrences: 5,
  daysOfWeek: DAYS.MONDAY | DAYS.TUESDAY | DAYS.WEDNESDAY | DAYS.THURSDAY | DAYS.FRIDAY, // 0b0111110 (62)
  timeOfDay: "09:00"
}
```

### How the logic would work to determine if an email should be sent:

```typescript
function shouldSendEmail(frequency: UserFrequency, date: Date): boolean {
  if (frequency.type === "PREDEFINED") {
    return handlePredefinedFrequency(frequency.predefinedValue, date);
  }

  // For "every X days" pattern
  if (!frequency.daysOfWeek) {
    const daysSinceLastSent = Math.floor(
      (date.getTime() - lastSentDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Check if we've reached the interval
    if (daysSinceLastSent < frequency.intervalDays) {
      return false;
    }

    // Check time of day if specified
    if (frequency.timeOfDay) {
      const scheduledTime = frequency.timeOfDay;
      const currentTime = date;

      // Extract hours and minutes from both times
      const scheduledHours = scheduledTime.getHours();
      const scheduledMinutes = scheduledTime.getMinutes();
      const currentHours = currentTime.getHours();
      const currentMinutes = currentTime.getMinutes();

      // Compare times
      return (
        currentHours >= scheduledHours &&
        (currentHours > scheduledHours || currentMinutes >= scheduledMinutes)
      );
    }

    return true;
  }

  // For weekly patterns with specific days
  const dayOfWeek = date.getDay();
  const dayMask = 1 << (6 - dayOfWeek);
  if (!(frequency.daysOfWeek & dayMask)) {
    return false;
  }

  // Check time of day if specified
  if (frequency.timeOfDay) {
    const scheduledTime = frequency.timeOfDay;
    const currentTime = date;

    // Extract hours and minutes from both times
    const scheduledHours = scheduledTime.getHours();
    const scheduledMinutes = scheduledTime.getMinutes();
    const currentHours = currentTime.getHours();
    const currentMinutes = currentTime.getMinutes();

    // Compare times
    return (
      currentHours >= scheduledHours &&
      (currentHours > scheduledHours || currentMinutes >= scheduledMinutes)
    );
  }

  return true;
}
```

### How the UI might be implemented

```

```
