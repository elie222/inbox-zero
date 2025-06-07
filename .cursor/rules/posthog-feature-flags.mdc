---
description: 
globs: 
alwaysApply: false
---
---
description: Guidelines for implementing and using PostHog feature flags for early access features and A/B tests
globs: apps/web/hooks/useFeatureFlags.ts
alwaysApply: false
---
# PostHog Feature Flags

Guidelines for implementing feature flags using PostHog for early access features and A/B testing.

## Overview

We use PostHog for two main purposes:
1. **Early Access Features** - Features that users can opt into via the Early Access page
2. **A/B Testing** - Testing different variants of features to measure impact

## Implementation Guidelines

### 1. Creating Feature Flag Hooks

All feature flag hooks should be defined in `apps/web/hooks/useFeatureFlags.ts`:

```typescript
// For early access features (boolean flags)
export function useFeatureName() {
  return useFeatureFlagEnabled("feature-flag-key");
}

// For A/B test variants
export function useFeatureVariant() {
  return (
    (useFeatureFlagVariantKey("variant-flag-key") as VariantType) ||
    "control"
  );
}
```

### 2. Early Access Features

Early access features are automatically displayed on the Early Access page (`/early-access`) through the `EarlyAccessFeatures` component. No manual configuration needed.

**Example:**
```typescript
// In useFeatureFlags.ts
export function useCleanerEnabled() {
  return useFeatureFlagEnabled("inbox-cleaner");
}

// Usage in components
function MyComponent() {
  const isCleanerEnabled = useCleanerEnabled();
  
  if (!isCleanerEnabled) {
    return null;
  }
  
  return <CleanerFeature />;
}
```

### 3. A/B Test Variants

For A/B tests, define the variant types and provide a default fallback:

```typescript
// Define variant types
type PricingVariant = "control" | "variant-a" | "variant-b";

// Create hook with fallback
export function usePricingVariant() {
  return (
    (useFeatureFlagVariantKey("pricing-options-2") as PricingVariant) ||
    "control"
  );
}

// Usage
function PricingPage() {
  const variant = usePricingVariant();
  
  switch (variant) {
    case "variant-a":
      return <PricingVariantA />;
    case "variant-b":
      return <PricingVariantB />;
    default:
      return <PricingControl />;
  }
}
```

### 4. Best Practices

1. **Naming Convention**: Use kebab-case for flag keys (e.g., `inbox-cleaner`, `pricing-options-2`)
2. **Hook Naming**: Use `use[FeatureName]Enabled` for boolean flags, `use[FeatureName]Variant` for variants
3. **Type Safety**: Always define types for variant flags
4. **Fallbacks**: Always provide a default/control fallback for variant flags
5. **Centralization**: Keep all feature flag hooks in `useFeatureFlags.ts`

### 5. PostHog Configuration

Feature flags are configured in the PostHog dashboard. The Early Access page automatically displays features to users for them to enable new features.