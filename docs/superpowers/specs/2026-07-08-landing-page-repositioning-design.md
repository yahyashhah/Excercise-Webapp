# Landing Page Repositioning — Design

**Goal:** Reposition the marketing site around the message "Built by a Doctor of Physical Therapy. Designed for Personal Trainers. Powered by AI," per the copy in `Landing Page Edits_.docx`. This means updating hero/feature copy on the homepage and adding a new About page carrying the credibility story (founder, comparison to generic workout apps).

**Source doc:** `~/Downloads/Landing Page Edits_.docx` (all copy below is taken verbatim from it unless noted).

## Scope decisions

- Homepage (`app/page.tsx`) gets copy-only edits — no new sections, no layout changes.
- The doc's "About Page" content becomes a real `/about` route (doesn't exist today; the footer's "About" link is currently a dead `href="#"`).
- Navbar and Footer, currently written inline inside `app/page.tsx`, are extracted into shared components so both pages can use them without duplicating ~170 lines of markup.
- No new visual assets (e.g. a founder photo) — the doc doesn't include one, so the founder section is text-only.

## Part 1: Homepage copy edits (`app/page.tsx`)

Exact replacements:

| Location | Current | New |
|---|---|---|
| Hero badge (line 434) | `AI Powered Rehab Platform` | `PT-Inspired Exercise Intelligence` |
| Hero headline (lines 445–450) | `Rehab Programs That Actually Stick` | `Smarter Programming Starts Here.` |
| Hero subheading (lines 460–461) | `Trainers generate AI-powered home exercise programs in under 2 minutes. Clients get guided sessions with video demos, set logging, and real-time feedback.` | `Built by a Doctor of Physical Therapy to help personal trainers create safer, more personalized programs in minutes using AI-powered exercise intelligence.` |
| Feature card title (`features[0].title`, line 113) | `AI Program Generation` | `PT-Inspired AI Programming` |
| Feature card description (`features[0].description`, lines 114–115) | `Generate personalised rehabilitation programs in under 2 minutes. Claude AI selects exercises from your curated library based on diagnosis, goals, and contraindications.` | `Our AI was designed by a Doctor of Physical Therapy to recommend appropriate exercises, progressions, regressions, and modifications based on your client's goals, experience, movement limitations, and available equipment.` |

The headline's gradient span (`Actually Stick`) wraps the emphasized phrase — for the new headline, apply the same gradient-span treatment to the emphasized words (e.g. "Starts Here.") to preserve the existing visual effect. Exact word split is an implementation-time call, not load-bearing.

No other homepage sections (badge copy elsewhere, stats, remaining 5 feature cards, how-it-works, testimonials, footer link columns, commented-out pricing) change.

## Part 2: Extract shared Navbar and Footer

New files, moved verbatim from `app/page.tsx` (lines ~297–392 for nav, ~897–973 for footer), each a self-contained `"use client"` component:

- `components/layout/site-navbar.tsx` — owns its own `useScroll`/`useTransform` (for the scroll-linked background) and `mobileMenuOpen` state; no props.
- `components/layout/site-footer.tsx` — no props.

Two behavior changes required for cross-page correctness (the nav's anchor links only make sense from the homepage):
- Nav links `Features` / `How it Works` / `Pricing` change from `#features` etc. to `/#features` etc., so they work when clicked from `/about` (Next.js navigates home, then scrolls to the anchor).
- Footer's "About" link changes from `href="#"` to `href="/about"`.

`app/page.tsx` replaces its inline nav/footer markup with `<SiteNavbar />` / `<SiteFooter />`, and drops the now-unused `useScroll`/`navOpacity`/`mobileMenuOpen` declarations that only existed to support the nav.

## Part 3: New `app/about/page.tsx`

A new client component page using the same visual language as the homepage (Tailwind utility classes, `FadeUp`/`FadeIn` scroll-reveal treatment, section padding of `py-24 sm:py-32`, `max-w-7xl` containers). The `FadeUp`/`FadeIn` helpers currently live un-exported inside `app/page.tsx`; move them to `components/layout/scroll-reveal.tsx` and import from both pages.

Renders `<SiteNavbar />` at top and `<SiteFooter />` at bottom, with four sections in between, in doc order:

**1. Intro — "Why INMOTUS RX Is Different"**
Plain heading + body copy section (centered, `max-w-2xl`, matching the section-intro pattern used elsewhere, e.g. Testimonials' heading block):
> Most workout apps were built by software companies.
> INMOTUS RX was built by a Doctor of Physical Therapy who has spent years helping thousands of people improve movement, recover from injuries, and perform at a higher level.
> We took the clinical reasoning used by movement experts and combined it with AI to help trainers build smarter exercise programs—without spending hours creating them.
> The result is better programming, happier clients, and more confident coaching.

**2. Credibility — "Designed by a Doctor of Physical Therapy"**
Same section-intro visual pattern:
> Unlike generic workout builders, INMOTUS RX was created by a practicing Doctor of Physical Therapy with years of experience in movement science, biomechanics, rehabilitation, and performance training.
> Our AI reflects the same decision-making process used to build individualized exercise programs—adapted specifically for personal trainers.

**3. Comparison table — "Other Training Apps" vs. "INMOTUS RX"**
Two-column comparison, 5 rows, from the doc:

| Other Training Apps | INMOTUS RX |
|---|---|
| Workout builder | PT-designed programming assistant |
| Generic AI | PT-informed AI |
| Exercise list | Intelligent exercise recommendations |
| Manual progressions | Automatic progressions & regressions |
| Basic client tracking | Coaching insights & adherence tracking |

Styled as a two-column card/table (left column muted/gray text with an X-style icon, right column INMOTUS-branded with a check icon in the brand gradient), consistent with the `Check` icon usage already present in the codebase (pricing section, `lucide-react`).

**4. Meet the Founder**
Single featured block (not a 3-card grid like Testimonials, since there's one founder) — reuse the testimonial card's visual DNA (rounded-2xl border, avatar circle, hover accent line) but sized as one wide centered card:
> **Dr. Sharon Ackerman, PT, DPT**
> Founder of INMOTUS RX
>
> After years of helping clients recover, move better, and perform at a higher level, I realized personal trainers needed better tools—not more complicated software.
> I built INMOTUS RX to bring the thought process of a movement expert into an AI-powered platform that helps trainers create better programs faster.
> Because great coaching starts with great programming.

Avatar: initials circle ("SA") with the same gradient-circle treatment used for testimonial avatars — no photo asset exists.

## Testing

This is a content/presentation-only change with no server logic, so no Vitest coverage applies. Verification is:
- `npx tsc --noEmit` passes.
- Manual dev-server pass: homepage shows new copy, nav/footer render identically to before on both `/` and `/about`, nav links from `/about` correctly jump to homepage anchors, footer "About" link navigates to `/about`.

## Out of scope

- Pricing section (still commented out, untouched).
- Testimonials section (separate from the new founder block, untouched).
- Any new photography/illustration assets.
- SEO metadata for the new `/about` route beyond what Next.js defaults provide.
