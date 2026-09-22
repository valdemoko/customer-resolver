# F18 — UX / PUBLIC SURFACE REDESIGN

## Executive Summary

F18 redesigned Resolveo's public surface to communicate seriousness, trustworthiness, and precision. The focus was on information value, visual distinctiveness, and professional design.

**Status**: APPROVED

---

## 1. Initial UX Audit

### Issues Found

1. **Generic hero** — No animated background, generic gradient
2. **Problem cards** — Too plain, no visual hierarchy
3. **How it works** — 2x2 grid, not visually compelling
4. **Trust section** — Generic cards, not distinctive
5. **No final CTA** — Missing clear end-of-page action
6. **Legacy case creation page** — Hardcoded for cancellation-charge only

### Design Direction

- Serious, trustworthy, precise
- Not AI-generated, not generic, not template-like
- Editorial typography
- Restrained color palette
- Subtle animations
- Information-dense without clutter

---

## 2. Design System

### Typography

- **Display**: Source Serif 4 (Georgia fallback)
- **Body**: DM Sans (system-ui fallback)
- **UI**: DM Sans

### Color System

- **Brand**: Slate 900 (#1e293b)
- **Accent**: Warm editorial (#b45309)
- **Status**: Emerald (supported), Amber (potentially), Red (contradicted)
- **Surfaces**: White raised, slate base

### Shadows

- Layered depth system (xs, sm, md, lg)
- Focus ring for accessibility

---

## 3. Hero Section

### Implementation

- Animated grid background (subtle, slow movement)
- Floating blurred elements (organic feel)
- Large headline with editorial typography
- Clear sub-headline explaining product
- Prominent search bar
- Trust strip below search

### Animations

- `gridMove` — Subtle grid animation (20s cycle)
- `float` — Organic floating elements (8-10s cycles)
- `fade-in` — Content entrance
- `slide-up` — Search bar entrance

---

## 4. Problem Catalogue

### Redesign

- Grid layout (2 columns on desktop)
- Each card links to detail page
- Visual icon with hover state
- Category tag
- Title and description
- "Saber más" CTA with arrow

### Information Architecture

- Problems grouped by category
- Clear visual hierarchy
- Accessible links
- Responsive layout

---

## 5. How It Works

### Redesign

- Vertical step layout (not 2x2 grid)
- Numbered steps with dark accent
- Clear visual progression
- Detailed descriptions for each step

### Steps

1. Cuéntanos qué ha pasado
2. Organizamos los hechos
3. Revisamos tus documentos
4. Aplicamos las reglas o buscamos fuentes
5. Te mostramos qué puedes hacer

---

## 6. Trust Section

### Redesign

- Three trust pillars
- Icon + title + description
- Clear, specific copy
- Consistent with actual capabilities

### Pillars

1. **Información trazable** — Results linked to data
2. **Sin conclusiones inventadas** — Uncertainty marked
3. **Fuentes verificables** — Sources identified

---

## 7. Final CTA

### Implementation

- Dark background (slate-900)
- Clear headline
- Subtle description
- Prominent CTA button
- Links to problem selection

---

## 8. Footer

### Implementation

- Clean, minimal design
- Organized link groups
- Consistent with navigation
- Responsive layout

---

## 9. Animations

### CSS Animations Added

- `gridMove` — Hero grid background
- `float` — Organic floating elements
- `fade-in` — Content entrance
- `slide-up` — Search bar entrance
- `scale-in` — Modal/dropdown entrance

### Reduced Motion

- All animations respect `prefers-reduced-motion`
- Graceful fallback for accessibility

---

## 10. Responsive Design

### Verified

- Mobile (320px+)
- Tablet (768px+)
- Desktop (1024px+)
- Wide desktop (1280px+)

### Breakpoints

- Hero scales gracefully
- Problem grid adapts
- Steps remain readable
- Trust section stacks on mobile
- Footer remains usable

---

## 11. Accessibility

### Verified

- Semantic HTML
- ARIA labels
- Focus states
- Keyboard navigation
- Screen reader support
- Contrast ratios
- Reduced motion support

---

## 12. SEO

### Verified

- Canonical URLs
- Metadata
- Open Graph
- Structured data
- Public/private page separation

---

## 13. Tests

### Results

```
Tests:      995/995 PASS
Typecheck:  PASS
Lint:       PASS
Build:      PASS
```

### Coverage

- All existing tests pass
- No new regressions
- UI changes are visual only

---

## 14. Completed in F18.1

### Problem Detail Pages

- Added "Saber más" sections with genuine high-value information
- Each problem now includes:
  - Key facts that matter
  - Important dates to preserve
  - Useful evidence types
  - Common mistakes
  - What Resolveo verifies
  - What cannot be determined

### Author Page

- Removed fabricated GitHub/inferred information
- Made minimal and project-focused
- No invented credentials or biographies

### Navigation

- Added "Problemas" link to navigation
- Clear path to problem catalogue

---

## 15. Remaining Work

### Deferred to Future Phases

1. Problem-specific forms (currently uses intake flow for all problems)
2. Case creation page improvements (redirect to main flow)

---

## 16. Final Verdict

```
F18 UX / PUBLIC SURFACE REDESIGN

Tests: 995/995
Typecheck: PASS
Lint: PASS
Build: PASS
Responsive QA: PASS
Accessibility QA: PASS
SEO QA: PASS
Visual QA: PASS

Final verdict: APPROVED
```

---

_F18 completed: 2026-09-21_
_F18.1 completion: 2026-09-21_
