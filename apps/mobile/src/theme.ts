/**
 * Design tokens for the mobile app. Kept in one place so every screen looks the same and the
 * shared design system (tracker K-05) can replace them without touching screens.
 */
export const colors = {
  primary: "#0f766e",
  primaryText: "#ffffff",
  background: "#f6f7f9",
  surface: "#ffffff",
  text: "#111827",
  muted: "#6b7280",
  border: "#e5e7eb",
  danger: "#b91c1c",
  dangerSurface: "#fef2f2",
  coachBubble: "#ecfdf5",
  youBubble: "#0f766e",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const radius = { sm: 8, md: 12, pill: 999 } as const;

export const font = { small: 13, body: 16, title: 22, heading: 28 } as const;

/** Minimum touch target recommended by Apple and Google. */
export const TOUCH_TARGET = 44;
