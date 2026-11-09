---
name: "gnani-pro Design System"
description: "Framework-agnostic design rules for web and mobile app implementation."

# ─── Colors ───────────────────────────────────────────────
colors:
  # Brand
  primary:       "#e11d48"
  primaryStrong: "#831843"
  primarySoft:   "#fecdd3"
  accent:        "#e11d48"

  # Surfaces
  surface:       "#fff1f2"
  surfaceMuted:  "#fecdd3"

  # Text & Border
  text:          "#4c0519"
  border:        "#9f1239"

  # Feedback
  success:       "#16A34A"
  warning:       "#D97706"
  danger:        "#DC2626"

# ─── Typography ───────────────────────────────────────────
typography:
  family:        "Poppins, system-ui, sans-serif"
  displayFamily: "Poppins, system-ui, sans-serif"
  monoFamily:    "ui-monospace, monospace"
  source:        "Google Font: https://fonts.google.com/specimen/Poppins (covers Devanagari)"
  weights:       "300, 400, 500, 600"
  defaultWeight: 500
  tone:          "mono"

# Spacing
spacing:
  xs:      4px
  sm:      8px
  md:      12px
  lg:      16px
  xl:      24px
  xxl:     32px
  section: 48px

# Radius
radius:
  sm: 4px
  md: 8px
  lg: 12px

# Motion
motion:
  fast:   120ms
  normal: 180ms
  slow:   260ms
---

# Design System Rules

## Purpose
gnani-pro Design System defines portable, framework-agnostic design rules for web and mobile product interfaces. Use it as the source of truth before changing layouts, components, color, typography, motion, or interaction states.

This file is a portable design skill. Any AI or engineer should be able to read it and improve a web or mobile interface without needing React, Vue, Svelte, Tailwind, native mobile, or any other specific technology.

## Operating Modes

### New Project Mode
- Use these rules to create a coherent first implementation when no existing UI exists.
- Build the information architecture, component system, and responsive behavior from the tokens and rules below.

### Existing Project Refactor Mode
- Treat the existing product as the source of truth for content, routes, behavior, data, and information architecture.
- Improve the visual system by patching styles, tokens, spacing, typography, hierarchy, responsive behavior, and component states.
- Do not regenerate whole pages from scratch when a targeted patch can preserve the current experience.
- Do not replace real content with placeholder, demo, lorem ipsum, or simplified content.
- If a section looks inconsistent with this design system, restyle it first. Do not remove it.
- If removing content, routes, features, media, or data logic seems necessary, stop and ask for approval.

## Preservation Rules For Existing Products
- Preserve all existing headings, paragraphs, labels, buttons, links, images, icons, forms, navigation items, sections, routes, and data-fetching logic unless the user explicitly requests removal.
- Preserve semantic meaning and section order unless the user asks for an information-architecture change.
- Preserve working interactions: forms, menus, language toggles, theme toggles, dialogs, tabs, carousels, and scroll behavior.
- Preserve real brand/product names and domain-specific copy. Design changes must not make the page generic.
- Keep every original section represented after the refactor. A redesigned section is acceptable; a missing section is not.
- Never leave the first viewport empty unless the existing product intentionally has an empty state.

## Safe Refactor Workflow
1. Read the existing UI code before editing. Identify sections, routes, state, data dependencies, and user actions.
2. Inventory current colors, typography, spacing, radius, shadows, and component states.
3. Map old visual values to the tokens in this file one-to-one where possible.
4. Patch section by section. Avoid full-file rewrites when the current structure works.
5. After each section, verify the original content is still present, visible, and reachable.
6. After changing colors, check every affected text/background pair for contrast.
7. Verify desktop and mobile before finishing.

## Visual Direction
- Color direction: Rose - Warm vivid accent.
- Typography direction: Code Friendly - Docs and snippets.
- Style direction: Bento - Hero-led modular cards with product-focused hierarchy
- References: Bento SaaS hero sections, macOS product cards, Apple feature grids.
- Visual style: Rose color direction, Code Friendly typography, Bento style.

## Style System: Bento
Use Bento to turn a product page into a composed system of strong hero modules, purposeful cards, media previews, metrics, and feature blocks. The target is a modern product interface: one memorable first-viewport module, then a grid of varied cards that make the product easier to understand. Bento is not a generic equal-card grid and it must never remove real content.

### Layout Rules
- start with a dominant hero module in the first viewport that contains the main headline, value proposition, primary CTA, and strongest product media when available.
- use a responsive 12-column desktop grid with intentional spans such as 12, 8, 6, and 4 columns; never make every module the same size.
- compose the first screen like a product bento: one large hero tile plus two to four supporting cards for proof, metrics, features, media, or secondary actions.
- use an expressive product path when the project has strong imagery: one saturated or media-led hero tile, then calmer supporting cards.
- use a macOS minimal path when the project is tool-like or content-heavy: soft neutral page background, clean elevated cards, hairline borders, and generous whitespace.
- group related content into sections before styling them as cards; every card should belong to a clear product story.
- allow asymmetric desktop layouts, then collapse to a single-column mobile flow that preserves the original content order.
- reserve full-width bands for major story moments such as hero, product overview, pricing, testimonials, or final CTA.

### Component Patterns
- each card needs one clear role: hero, feature, metric, media preview, testimonial, process step, integration, pricing, CTA, or status.
- hero cards need oversized but readable heading text, short supporting copy, one primary CTA path, and product media or a strong visual anchor when available.
- feature cards should use a consistent anatomy: small label or icon, clear title, short copy, optional media, and one action only when it helps.
- metric cards should make the number large and scannable, with the explanation close enough that the metric is not decorative.
- media cards should show real product screenshots, interface previews, photos, or meaningful illustrations; do not replace real media with empty placeholders.
- use card emphasis levels: primary hero tile, large feature cards, medium information cards, and compact utility cards.
- align card internals consistently with predictable padding, title placement, media ratio, and action location.
- avoid nesting cards inside cards; use internal sections, dividers, chips, or spacing instead.

### Existing Project Refactor Rules
- inventory the existing page first: navigation, hero, headline, CTAs, media, features, stats, testimonials, pricing, forms, and footer.
- preserve every existing section and map it to a Bento module, a group of modules, or a full-width story section.
- do not reduce an existing page to a navbar plus empty background; missing hero content is a failed refactor.
- do not replace a real hero with a decorative grid; the hero must still communicate the product value and action path.
- convert repeated items into a Bento grid only after confirming every original item remains present.
- if a current section is content-heavy, improve hierarchy with larger lead cards and smaller supporting cards instead of deleting copy.
- when restyling an existing page, patch structure and classes section by section instead of regenerating the whole file.
- if a section cannot become a card without losing meaning, keep it as a full-width section and apply Bento spacing, surfaces, and hierarchy.

### Spacing Rules
- use tighter spacing inside compact modules and more generous spacing around hero or feature modules.
- use a page container around 1120px to 1280px on desktop unless the existing layout already defines a better max width.
- keep grid gaps consistent, usually 12px to 24px depending on density and viewport size.
- keep card padding on the token scale: compact 12px, standard 16px, feature 24px, spacious 32px to 48px.
- use softened card radius consistently; compact cards can be tighter, while large hero and media cards can be more rounded when the target aesthetic is product-led or macOS-like.
- keep gutters consistent across each grid area, then vary card size and content weight rather than random margins.
- use whitespace to separate groups before adding extra border lines or decorative effects.

### Visual Hierarchy Rules
- use scale, contrast, media, and placement to make the primary module obvious within three seconds.
- avoid making all cards identical; equal cards produce a generic card grid, not Bento.
- give media, screenshots, illustrations, and metrics enough visual weight to break text monotony.
- keep most surfaces calm and let only one or two modules carry strong visual intensity.
- use accent treatment sparingly for primary actions, active modules, badges, selected states, or the hero focal point.
- make body copy readable before adding blur, gradients, shadows, or decorative layers.
- keep navigation visually quiet so the bento composition, not the header, owns the page hierarchy.

### Style Anti-patterns
- turn every section into a same-sized card grid.
- remove hero text, CTAs, media, forms, pricing, testimonials, or navigation to make room for decorative modules.
- use Bento as a purely visual background treatment with little or no product content.
- create empty cards, lorem ipsum blocks, fake metrics, or generic placeholders when real content exists.
- nest cards inside cards or stack too many bordered containers.
- make all modules intense, saturated, blurred, or oversized at the same time.

### Style Checklist
- the first viewport has one dominant hero module with headline, value proposition, CTA, and product media or a strong visual anchor.
- every original section is still represented after the refactor.
- cards have varied roles and sizes instead of identical repeated rectangles.
- the page includes supporting modules such as feature, metric, media, testimonial, pricing, or CTA cards when that content exists.
- the hero still communicates product value and contains the original CTA path.
- the result reads as either expressive product Bento or macOS minimal Bento, not a plain list of cards.
- mobile layout preserves content order and avoids cramped two-column cards.

## Design Tokens
Use semantic tokens first. Raw values from frontmatter are source values, not permission to scatter hex codes or one-off sizes through implementation.

### Color
- Primary action color: #e11d48.
- Strong primary: #831843. Use for high-emphasis text, selected state, or strong borders.
- Soft primary: #fecdd3. Use for subtle surfaces, selected backgrounds, or calm highlights.
- Surface: #fff1f2.
- Muted surface: #fecdd3.
- Text: #4c0519.
- Border: #9f1239.
- Success, warning, and danger are semantic states. Pair them with labels, icons, or position; never rely on color alone.
- When moving from a dark theme to a light or warm theme, update inherited light text classes such as white, muted-white, or low-opacity foregrounds.
- Do not apply one warm/cream/brown palette across the entire page without contrast, hierarchy, and content anchors.

### Text Selection
- Use this style-specific `::selection` treatment for Bento. It should follow the selected color tokens and stay readable.
```css
/* Bento selection: solid module highlight. */
::selection {
  background-color: #831843;
  color: #fff1f2;
  text-shadow: none;
}
```
- If the selected color changes, keep the same style behavior but re-check text/background contrast.

### Contrast And Visibility Gate
- Every visible text node must remain readable after color changes.
- Check hero text, navigation, buttons, card titles, form labels, helper text, icons, borders, and disabled states against their actual backgrounds.
- If legacy classes or CSS keep text white on a light surface, replace them with semantic foreground tokens.
- If content appears missing after a restyle, inspect contrast and visibility before deleting or rebuilding the section.
- Do not finish with invisible text, hidden CTAs, empty hero areas, or decorative backgrounds replacing product content.

### Typography
- Primary family: Poppins, system-ui, sans-serif (rounded geometric; changed from JetBrains Mono for a softer, modern look).
- Display family: Poppins (700 for display, 600 for titles), slight negative tracking on large text.
- Monospace family: ui-monospace, monospace (not used in the app).
- Allowed weights: 300, 400, 500, 600.
- Default UI weight: 500.
- Keep heading levels semantic. Visual size must follow layout importance, not HTML heading number.
- Keep letter spacing at 0 by default. Use uppercase labels sparingly and only for short metadata.

### Spacing And Radius
- Spacing scale: 4/8/12/16/24/32/48.
- Prefer spacing and grouping over extra borders.
- Use 4px radius for compact controls, 8px for standard cards/inputs, and 12px only for larger feature surfaces.
- Do not invent new spacing values unless the layout cannot be solved with the scale.

## Layout Rules
- Start mobile-first. The smallest useful viewport defines the base layout.
- Use content-driven breakpoints. Do not scale type directly with viewport width.
- Keep navigation, primary actions, and form completion paths easy to reach on touch devices.
- Prefer a clear grid, predictable alignment, and stable dimensions for controls, cards, tabs, and repeated items.
- Empty, loading, and error states must preserve layout stability and explain the next action.

## Component Rules
- Every interactive component must define default, hover, active, focus-visible, disabled, loading, success, and error behavior when those states apply.
- Buttons must communicate hierarchy through role: primary, secondary, tertiary, destructive, or icon-only.
- Forms must keep labels visible, helper text close to the field, and errors specific enough to fix.
- Cards must represent repeated items or contained tools. Do not nest cards inside other cards.
- Modals and popovers must include focus management, escape behavior, and clear dismissal affordances.

## Interaction And Motion
- Motion must clarify state change, not decorate the screen.
- Transitions should usually stay between 120ms and 260ms.
- Provide reduced-motion behavior for animations, parallax, shimmer, and auto-moving content.
- Pointer hover cannot be the only way to reveal important controls because touch devices do not have hover.

## Accessibility Requirements
WCAG 2.2 AA, keyboard-first interactions, visible focus states, semantic HTML before ARIA, reduced-motion support, accessible target sizes.

- Text and meaningful non-text UI must meet WCAG 2.2 AA contrast.
- Keyboard users must be able to reach, understand, and operate every interactive control.
- Focus indicators must be visible, high-contrast, and not hidden by overflow or animation.
- Semantic HTML or native platform semantics come before ARIA patches.
- Touch targets should be at least 24px by WCAG 2.2 AA and should reach 44px when layout allows.

## Content Tone
Clear, concise, implementation-focused, low-jargon, and helpful without being decorative.

- Use direct labels for actions.
- Avoid vague UI copy like "Submit" when the action can be named.
- Keep empty states useful: state what happened, why it matters, and what the user can do next.

## Rules: Do
- use semantic tokens before raw values in components.
- preserve existing content, copy, media, routes, and behavior when applying this system to an existing project.
- preserve hierarchy with spacing, contrast, typography, and component state.
- define default, hover, active, focus-visible, disabled, loading, success, and error states.
- design mobile-first, then enhance for tablet and desktop density.
- keep implementation guidance portable across React, Vue, Svelte, plain HTML/CSS, and mobile UI stacks.
- build a first viewport with one dominant product story and supporting Bento modules.
- use modular regions with clear grouping, varied spans, and consistent card anatomy.
- preserve content while improving grouping, hierarchy, and scan speed.
- use real screenshots, photos, metrics, or interface previews when the project already provides them.
- choose either an expressive hero-led Bento or a macOS-like minimal Bento based on the product context.
- use Bento cards to clarify product value, not to hide copy.

## Rules: Don't
- use low-contrast text, hidden focus indicators, or color-only state communication.
- delete or replace existing product content unless the user explicitly asks for content removal.
- introduce one-off spacing, typography, or radius values outside the token system.
- mix unrelated visual metaphors in the same screen.
- depend on framework-specific component names in design rules.
- add decorative motion without reduced-motion fallbacks.
- turn every section into a same-sized card grid.
- remove hero text, CTAs, media, forms, pricing, testimonials, or navigation to make room for decorative modules.
- use Bento as a purely visual background treatment with little or no product content.
- create empty cards, lorem ipsum blocks, fake metrics, or generic placeholders when real content exists.
- nest cards inside cards or stack too many bordered containers.
- make all modules intense, saturated, blurred, or oversized at the same time.

## AI Implementation Checklist
- Read this file before changing UI, layout, component styling, or interaction behavior.
- Identify the target surface: mobile app, mobile web, desktop web, dashboard, landing page, form flow, or content-heavy view.
- Map the design tokens to the project technology without changing the design intent.
- Reuse existing project components when they can satisfy these rules.
- If the current UI conflicts with this file, explain the conflict and choose the more accessible, consistent option.
- Confirm all original navigation items, hero content, CTAs, media, sections, and forms still exist unless removal was requested.
- Confirm no text became invisible from background, opacity, blend-mode, or inherited color changes.
- Confirm the first viewport contains meaningful product content, not just a background treatment.
- Verify keyboard navigation, focus-visible styling, responsive behavior, text overflow, loading state, and error state before finishing.
