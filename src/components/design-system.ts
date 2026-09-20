/**
 * Consumer Resolver Design System (Fase 7).
 *
 * Professional, trustworthy, distinctive. Not a SaaS template.
 * Typography: Source Serif 4 (serif for trust) + DM Sans (sans for UI).
 * Colors: Muted, professional palette. No gradients, no glassmorphism.
 */

// ── Typography ──────────────────────────────────────────────────────

export const typography = {
  /** Serif for headings and body — conveys trust, serious, readable. */
  serif: '"Source Serif 4", "Georgia", serif',
  /** Sans for UI elements, forms, labels — clean, modern. */
  sans: '"DM Sans", "system-ui", sans-serif',
  /** Monospace for technical data. */
  mono: '"JetBrains Mono", "Fira Code", monospace',
} as const;

export const fontSize = {
  xs: "0.75rem", // 12px
  sm: "0.875rem", // 14px
  base: "1rem", // 16px
  lg: "1.125rem", // 18px
  xl: "1.25rem", // 20px
  "2xl": "1.5rem", // 24px
  "3xl": "1.875rem", // 30px
  "4xl": "2.25rem", // 36px
} as const;

export const fontWeight = {
  normal: "400",
  medium: "500",
  semibold: "600",
  bold: "700",
} as const;

export const lineHeight = {
  tight: "1.25",
  normal: "1.5",
  relaxed: "1.75",
} as const;

// ── Colors ──────────────────────────────────────────────────────────

/**
 * Muted, professional palette.
 * No bright accents — trust comes from clarity, not color.
 */
export const colors = {
  // Neutrals
  white: "#ffffff",
  black: "#0a0a0a",
  gray: {
    50: "#f9fafb",
    100: "#f3f4f6",
    200: "#e5e7eb",
    300: "#d1d5db",
    400: "#9ca3af",
    500: "#6b7280",
    600: "#4b5563",
    700: "#374151",
    800: "#1f2937",
    900: "#111827",
  },

  // Status colors (accessible, muted)
  status: {
    supported: { bg: "#ecfdf5", border: "#86efac", text: "#166534", icon: "✓" },
    potentially: { bg: "#fefce8", border: "#fde047", text: "#854d0e", icon: "◐" },
    insufficient: { bg: "#fff7ed", border: "#fdba74", text: "#9a3412", icon: "?" },
    contradicted: { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b", icon: "!" },
    notApplicable: { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280", icon: "—" },
    unknown: { bg: "#f9fafb", border: "#d1d5db", text: "#6b7280", icon: "?" },
  },

  // Brand (subtle, professional)
  brand: {
    primary: "#1e40af", // Deep blue — trust
    hover: "#1e3a8a",
    light: "#dbeafe",
  },
} as const;

// ── Spacing ─────────────────────────────────────────────────────────

export const spacing = {
  0: "0",
  1: "0.25rem", // 4px
  2: "0.5rem", // 8px
  3: "0.75rem", // 12px
  4: "1rem", // 16px
  5: "1.25rem", // 20px
  6: "1.5rem", // 24px
  8: "2rem", // 32px
  10: "2.5rem", // 40px
  12: "3rem", // 48px
  16: "4rem", // 64px
  20: "5rem", // 80px
} as const;

// ── Borders & Radii ─────────────────────────────────────────────────

export const borders = {
  width: {
    thin: "1px",
    medium: "2px",
    thick: "3px",
  },
  color: {
    default: "#e5e7eb",
    focus: "#1e40af",
    error: "#dc2626",
  },
} as const;

export const radii = {
  none: "0",
  sm: "0.25rem", // 4px
  md: "0.5rem", // 8px
  lg: "0.75rem", // 12px
  xl: "1rem", // 16px
  full: "9999px",
} as const;

// ── Shadows ─────────────────────────────────────────────────────────

/**
 * Subtle, functional shadows. No decorative shadows.
 */
export const shadows = {
  none: "none",
  sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
  md: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
} as const;

// ── Transitions ─────────────────────────────────────────────────────

export const transitions = {
  fast: "150ms ease",
  normal: "250ms ease",
  slow: "350ms ease",
} as const;

// ── Breakpoints ─────────────────────────────────────────────────────

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
} as const;

// ── Component Tokens ────────────────────────────────────────────────

export const components = {
  card: {
    bg: colors.white,
    border: borders.width.thin,
    borderColor: borders.color.default,
    borderRadius: radii.lg,
    shadow: shadows.sm,
    padding: spacing[6],
  },
  button: {
    primary: {
      bg: colors.brand.primary,
      color: colors.white,
      hoverBg: colors.brand.hover,
      borderRadius: radii.md,
      padding: `${spacing[3]} ${spacing[6]}`,
      fontWeight: fontWeight.medium,
    },
    secondary: {
      bg: colors.white,
      color: colors.gray[700],
      border: borders.width.thin,
      borderColor: borders.color.default,
      borderRadius: radii.md,
      padding: `${spacing[3]} ${spacing[6]}`,
      fontWeight: fontWeight.medium,
    },
  },
  input: {
    bg: colors.white,
    border: borders.width.thin,
    borderColor: borders.color.default,
    borderRadius: radii.md,
    padding: `${spacing[3]} ${spacing[4]}`,
    fontSize: fontSize.base,
    focusBorderColor: borders.color.focus,
  },
} as const;
