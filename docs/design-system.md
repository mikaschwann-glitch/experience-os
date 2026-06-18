# Experience-OS — Design System

> Source of truth for this document: the static design preview at
> [`app/design-preview/page.tsx`](../app/design-preview/page.tsx)
> (route `/design-preview`). This document describes the **accepted, frozen** visual
> direction. It is documentation only — it does not define production architecture
> (see [§10 Implementation note](#10-implementation-note)).

---

## 1. Design direction name

**Basalt Workbench — Charcoal Sidebar**

This is the final, frozen direction. No new variants, no redesign, no changes to the
color system, layout concept, or direction.

---

## 2. Design thesis

Premium hospitality operations software with a **dark charcoal workbench** (the host
cockpit sidebar), a **warm paper workspace**, **clay/rust action accents**, and **calm
operational clarity**.

The product is a working surface for a micro-hospitality host, not a marketing site,
not a hotel PMS, and not an Airbnb clone. It should feel serious, calm, premium,
operational, human, and warm — but not soft, not decorative, and not generically
"SaaS". Two worlds live in one system:

- **Host UI** — operational, dense where it matters, quietly confident.
- **Guest UI** — private, personal, hand-prepared; not "an app".

---

## 3. Color tokens

All values are taken directly from the preview's token object (`C` in `page.tsx`).
Colors are applied inline so they render exactly, independent of any Tailwind config.

### Core palette

| Token | Hex | Role |
|---|---|---|
| Paper background | `#F6F3EC` | App background and the warm workspace area behind cards |
| Main surface | `#FFFFFF` | Cards, panels, guest portal surfaces |
| Ink text | `#171717` | Primary text, headings, values |
| Muted text | `#6F6A61` | Secondary text, metadata, labels, captions |
| Basalt sidebar | `#1F1E1B` | Host cockpit sidebar background |
| Basalt soft | `#2B2926` | Sidebar dividers, sidebar avatar chip, deep scene tone |
| Stone line | `#D8D2C4` | Stronger borders (outer shell, portal surfaces), water lines |
| Soft line | `#E7E1D6` | Default subtle borders and dividers between rows/cards |
| Clay accent | `#A4512C` | Primary buttons, active accents, status, focal dots |
| Clay dark | `#8E3F22` | Primary button hover, clay text on light clay backgrounds |
| Clay light | `#F3E4DA` | Accent header strips, avatar fills, "what matters now" / pending tint |
| Warning background | `#F7EDE4` | Sensitive / "handle with care" boxes |
| Neutral chip background | `#ECE7DD` | Tags, segmented controls, neutral avatar chips |

### Sidebar-specific text (on basalt)

| Token | Hex | Role |
|---|---|---|
| Sidebar text | `#CFC8BA` | Idle nav labels |
| Sidebar text dim | `#8C867A` | Subtitles, idle icons, group labels, secondary user text |
| Sidebar active | `#F6F3EC` | Active nav label, property name, user name |

### Usage rules

- **Clay is rationed.** It marks primary actions, the single most important status, and
  small focal accents — never large fills or whole backgrounds.
- **Borders are quiet.** Default to `Soft line`; reserve `Stone line` for the outer app
  shell and the guest portal surfaces where a firmer edge reads as "a real surface".
- **No color outside this palette.** See [§9 Hard no-go list](#9-hard-no-go-list).

---

## 4. Typography rules

- **Modern sans-serif only.** Font stack:
  `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- **No decorative serif** as primary UI type. No serif headings.
- **Normal letter-spacing** for body, navigation, and headings. The preview root
  explicitly resets `letter-spacing: normal` and `word-spacing: normal` and enables
  antialiasing so text reads crisp and intentional — never artificially spread.
- **Subtle tracking only for section labels.** The small uppercase section labels use
  `~0.045em` tracking at `~11.5px`, `font-weight 600`, in muted text. This is the *only*
  place tracking is applied.
- **Headings** use a slightly tight tracking (`tracking-tight`) for a premium, crisp feel.
- **Readable sizes.** Body copy sits around `13–14.5px`; primary screen headings around
  `24–27px`; metadata around `11.5–12.5px`. Nothing critical is tiny.
- **Calm, crisp hierarchy.** Weight and color (ink vs. muted) carry hierarchy more than
  size jumps; line-height is relaxed for paragraphs and snug for dense rows.

---

## 5. Layout rules

- **Dark sidebar for the host cockpit.** A fixed-width (`236px`) charcoal sidebar anchors
  every host screen. It is elegant, not heavy: translucent active fill plus a clay inset
  accent bar, dim idle icons, a "Workspace" group label, and a bottom user area.
- **Warm main workspace.** The work area sits on `Paper` (`#F6F3EC`); content lives in
  white cards. This warm-paper-behind-white-cards contrast is the signature.
- **White / stone cards.** Cards use the white surface with a `Soft line` border, a
  moderate radius, and a soft (not fluffy) shadow.
- **Clear top utility bar.** Each host screen has a top bar with a search field
  (left) and local context — time + weather (right). It separates from content with a
  single hairline.
- **Dashboard sections with operational hierarchy.** Screens are organized as labeled
  sections (`SectionTitle`) with consistent vertical rhythm; the most operational object
  (today's arrival) gets the most presence.
- **The app surface is the main object.** The preview container is wide
  (`max-width 1440px`) and the shell uses `min-height` (not a fixed height) so it grows
  with content and the page scrolls naturally — no inner scrollbar, no "embedded
  screenshot" feel.
- **Guest portal has no sidebar.** Guest-facing surfaces drop the host cockpit entirely
  and render as narrow (`~420px`), self-contained web surfaces.
- **No fake phone frames** and no fake browser chrome anywhere.

---

## 6. Component rules

Names below map to the visual/UX roles in the preview. Some are discrete components in
`page.tsx`; others are composed inline within a screen. The **role** is what is binding.

| Component | Visual role | UX role |
|---|---|---|
| **SidebarNav** | Charcoal cockpit rail: property identity, "Workspace" nav group, bottom host user area. Active item = translucent fill + clay inset bar + clay icon. | Persistent host navigation and identity. Calm, elegant, never visually heavy. |
| **TopBar** | Hairline-separated utility row: search field left, local time + weather right. | Orientation and lightweight search entry. Context, not chrome. |
| **StatCard** | White card, line icon top-left, large ink value, muted label; optional clay dot for "needs attention". | At-a-glance daily counts (arriving / in residence / need approval). |
| **AttentionRow** | Row with a soft icon tile, title + muted sub, optional clay status, and one action button (primary only when "Do not miss"). | The host's actionable to-do list. One clear action per row. |
| **GuestRow** | Clean, calm row: neutral initials chip, name, cabin · dates, a muted note, status meta. | Scannable guest lists grouped by stay status. Operational, low-noise. |
| **GuestMemoryBlock** | The Guest Memory layout: header (avatar, name, stay meta, two top actions), "What matters now" (clay-light), "About them" tags, sensitive box, notes & history timeline. | Lets the host understand one guest fast — memory over data entry. |
| **SensitiveNote** | Warning-background box, lock icon, bold title, muted body. | Flags discreet, handle-with-care information (e.g. no alcohol, keep the anniversary quiet). Always visually distinct, never alarming. |
| **RecommendationObject** | The Recommendation Approval composition: pending status, title + subline, info blocks (when / prep / effort), rationale + sources, preparation checklist, sensitive box, action bar. | Presents a suggested gesture *with rationale and sources*, for explicit host approval. |
| **PreparationChecklist** | Card with unchecked square items, snug leading. | The concrete steps to prepare a gesture. Static in the preview. |
| **OutcomeList** | Vertical list: check-circle (done, clay) vs. empty circle (pending), title, sub, right-aligned date. | Tracks what was actually done and whether the outcome was logged. |
| **ActivityList** | Recent-activity list: small icon tile, text, relative timestamp. | Lightweight log of what just happened around the property. |
| **GuestPortalCard** | Narrow guest surface: simple header (menu / property / mail), CSS-only `PortalScene` hero, content, solid buttons. | The private, host-prepared page a guest sees. Personal, not app-like. |
| **LocalGuideEntry** | Pin icon, place name + travel time, one-line description; rows divided by soft lines. | Curated local recommendations — "places we'd send a friend". |

Shared style rules:

- Borders subtle; shadows soft but not fluffy.
- Buttons solid and confident — **primary** = clay fill / white text (hover → clay dark);
  **ghost** = white / stone border / ink text.
- Radius moderate, never pill-rounded cards.
- Tags are neutral (chip background), never colorful.
- Status uses clay sparingly.
- Simple line icons (stroke `~1.6`, `currentColor`); no icon overload.

---

## 7. Screen rules

### Today Dashboard
The host sees what matters today. Two-column layout: a main column (greeting + date
subline, three `StatCard`s, "Needs your attention", and a prominent **Arriving today**
anchor card with a clay header strip, quick facts, and one primary action) and a denser
right column (a morning-light note card, "Today's schedule" mini-timeline, and "Recent
activity"). Calm but not empty — it should read as a real daily operations surface.

### Guests List
All guests grouped by stay status (Arriving / In residence / Recently departed) via a
neutral segmented control. Rows are clean and operational, each carrying a short
human note. Centered, comfortable measure.

### Guest Memory
Understand one guest quickly. Header with avatar and two top actions (Add a note,
Prepare a gesture). Main column leads with "What matters now", then "About them" tags,
a **SensitiveNote**, and a notes & history timeline. Right column carries "This stay",
the pending recommendation, and outcomes. Memory-first, not a data form.

### Recommendation Approval
Review and approve a single suggested gesture. Pending status up top; title, subline,
and a one-line description; three info blocks (when / preparation / effort). "Why this
may matter" always shows **rationale + sources** (the things the guest actually said).
Preparation checklist and a "keep it private" SensitiveNote. Action bar: one primary
(Approve & schedule), one secondary (Adjust), one quiet (Dismiss). A footnote reminds
the host nothing is sent to the guest automatically.

### Guest Portal
The guest-facing direction, static only. **No sidebar.** Two narrow surfaces side by
side: a **Welcome** surface (personal note signed by the host, CSS morning-light hero,
arrival instructions, two clear actions) and a **Local guide** surface (curated places
via `LocalGuideEntry` and one featured experience with a sunrise hero and an "Ask Sofia
to arrange" action). Private and personal, prepared by a host — never a generic booking
app.

---

## 8. UX principles

1. **Host UI is operational, not decorative.** Every element earns its place; decoration
   is minimal and purposeful.
2. **Guest UI is private and personal, not app-like.** It reads as something a host
   prepared by hand for these specific guests.
3. **Recommendations must show rationale.** A suggestion always cites the source signals
   it was built from — never an unexplained guess.
4. **Nothing guest-facing is automatic.** The host explicitly approves and prepares;
   the system never sends or acts on the guest's behalf silently.
5. **Sensitive information must be discreet.** Handle-with-care details get a distinct,
   calm treatment — visible to the host, never loud.
6. **One primary action per area.** Clay primary buttons are singular; secondary actions
   are ghost or quiet text.
7. **Cards are purposeful, not generic.** Hierarchy, spacing, and section rhythm carry
   meaning; no filler cards, no oversized empty surfaces.

---

## 9. Hard no-go list

Never introduce any of the following:

- ❌ Green / petrol / teal / sage / mint / pastel hospitality palette
- ❌ AI gradients (purple/blue)
- ❌ Glassmorphism
- ❌ Fake luxury gold
- ❌ Generic shadcn default look
- ❌ Oversized rounded SaaS cards
- ❌ iPhone / phone frames
- ❌ Fake browser chrome
- ❌ Old ledger / document look
- ❌ Decorative serif-heavy dashboard

---

## 10. Implementation note

This design preview is **static and not production architecture**. It is a single-file
visual prototype: hardcoded local data, one client component, and the only interactivity
is switching preview screens.

Future real app components should be **extracted cleanly** from this direction — proper
components, real data, real state, accessibility, and theming — **not copied blindly**
from the single preview file. Treat this document and `/design-preview` as the visual
contract, and rebuild the implementation properly behind it.

The preview also does **not** touch — and the design system has no opinion that requires
touching — backend, database, auth, Drizzle, migrations, API routes, tenant logic, PMS
adapters, or product logic.
