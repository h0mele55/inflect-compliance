'use client';

/**
 * Roadmap-14 PR-1 — `<NavBar>` primitive.
 *
 * The top-bar's only first-class structural element. Every later
 * R14 PR (geometry lock, brand mark, env badge, switcher, search,
 * notifications, user menu, living-chrome polish, mobile parity)
 * edits this file and the slot-children it accepts — never adds
 * a parallel `<header>` elsewhere.
 *
 * Why a separate file:
 *
 *   - Previously `<TopChrome>` (in `TopChrome.tsx`) hand-rolled the
 *     entire `<header>` element + its child layout. It worked, but
 *     it locked the shell shape inside the file that ALSO composes
 *     the breadcrumbs + identity pill. Mixing "what the bar looks
 *     like" with "what the bar shows today" makes every later PR
 *     touch a complex file.
 *
 *   - Hoisting the recipe into one primitive (and exporting the
 *     class strings as named consts) gives R14 a single place to
 *     land every slot. The ratchet
 *     `tests/guards/nav-bar-import-discipline.test.ts` locks the
 *     contract: no parallel `<header role="banner">` with the
 *     load-bearing chrome geometry outside this file.
 *
 * Slot architecture (locked by PR-1, filled by PR-3 onwards):
 *
 *   left      brand mark · env badge · breadcrumbs
 *             (PR-3 adds brand · PR-9 adds env badge ·
 *              breadcrumbs already there in PR-1)
 *
 *   center    global search anchor (⌘K)
 *             (PR-6 adds the search pill)
 *
 *   right     notifications · context · account
 *             (PR-4 swaps identity pill → workspace switcher ·
 *              PR-5 adds user menu · PR-7 adds notifications)
 *
 * Each slot is a discrete React node consumed by the structural
 * shell. The shell is responsible for SPACING and ALIGNMENT only;
 * the slots own their own content + state.
 *
 * Why slot props (not compound components like `<NavBar.Brand/>`)?
 *
 *   - Type-safety: a `left?: ReactNode` prop is just JSX-validated.
 *     A compound-component pattern (`NavBar.Brand = ...`) requires
 *     React.Children sniffing or context plumbing to enforce slot
 *     placement, which adds runtime overhead for zero ergonomic
 *     benefit at this scale.
 *
 *   - Matches the codebase: `<EntityListPage>` and
 *     `<EntityDetailLayout>` (Epic 52 / R13 era) both use slot
 *     props, not compound components. Consistency over fashion.
 *
 *   - SSR-safe: slot props serialize cleanly across the RSC
 *     boundary. Compound components with `displayName` checks can
 *     hit edge cases in production builds.
 */

import type { ReactNode } from 'react';

// ─── Geometry tokens (R14-PR2) ─────────────────────────────────────
//
// Five measurements drive how the top-bar feels on the page. Each
// is a named const so the rationale lives next to the value. A
// future "just bump height by 4px" PR has to argue against both
// the doc-comment and the ratchet at
// `tests/guards/r14-nav-bar-geometry-discipline.test.ts`.

/**
 * **64px desktop height.** R14-PR2 bumped this from R2-era 56px
 * (`h-14`). Reasoning: the bar will host a brand mark (32px), a
 * search anchor (28px), a user-avatar button (32px), and a
 * notifications bell (28px) — fitting all four at 56px feels
 * cramped, and the brand mark loses presence next to the
 * breadcrumbs. 64px gives each control an 8px halo of breathing
 * room above + below.
 *
 * `h-16` resolves to 64px in Tailwind's default spacing scale
 * (4px × 16). Pairs cleanly with `NAV_BAR_GAP` (8px) — the
 * horizontal rhythm and the vertical rhythm share a multiple.
 */
export const NAV_BAR_HEIGHT = 'h-16';

/**
 * **16px horizontal padding mobile, 24px desktop.** The bar lives
 * flush with the viewport edges; the left + right padding is the
 * only breath between the first slot's content and the screen
 * edge. 16px is the minimum that doesn't look amateur; 24px on
 * desktop matches the page-content `md:p-6` so the bar's edges
 * align with the content below it (the eye reads "everything is
 * on the same grid").
 *
 * `px-4 md:px-6` resolves to 16px / 24px — Tailwind's spacing
 * scale at 4-unit + 6-unit.
 */
export const NAV_BAR_PADDING = 'px-4 md:px-6';

/**
 * **8px gap between slots.** The shell uses `justify-between` so
 * the three slots (left, centre, right) anchor to their edges;
 * the `gap-default` is the fallback breath if any two slots end
 * up adjacent.
 *
 * `gap-default` resolves to 8px via the semantic spacing scale
 * (Roadmap-5 PR-9). Same vocabulary the sidebar + every premium
 * primitive uses. Mixing 6/8/12px gaps across primary chrome
 * reads as un-decided.
 */
export const NAV_BAR_GAP = 'gap-default';

/**
 * **Sticky-positioned at the top, z-30.** The bar must stay
 * pinned as the user scrolls page content; `top-0` anchors it,
 * `sticky` keeps the element in flow so the chrome doesn't
 * overlap the first row of content the way `fixed` would.
 *
 * z-30 sits ABOVE row-sticky headers (which use z-20 for pinned
 * table column headers) but BELOW modal overlays (z-50). Modals
 * SHOULD obscure the chrome.
 */
export const NAV_BAR_POSITION = 'sticky top-0 z-30';

/**
 * **Bottom border + glass blur surface.** The bar reads as
 * "elevated" — slightly translucent over the page bg, with a
 * 1px bottom rule that defines the seam where chrome ends and
 * page content begins.
 *
 * `bg-bg-page/80 backdrop-blur-sm` gives the frosted-glass effect
 * the macOS / Notion / Linear nav chromes all converge on. The
 * `/80` alpha + `blur-sm` is the recipe that doesn't choke on
 * scrolling content underneath (heavier blur stutters on lower-end
 * GPUs).
 *
 * `border-b border-border-subtle` is the seam. R14-PR10 will
 * replace the flat border with a fading horizontal gradient
 * (matching `nav-section.tsx`'s R13-PR10 evolution).
 */
export const NAV_BAR_SURFACE =
    'border-b border-border-subtle bg-bg-page/80 backdrop-blur-sm';

/**
 * Shell recipe — composes the five geometry tokens above into the
 * `<header>`'s class string. PR-1 declared this inline; PR-2
 * extracts each piece into a named token. The `hidden md:flex` +
 * `items-center justify-between` are layout-mode declarations
 * (not geometry) and stay here.
 *
 * `hidden md:flex` is the dual-chrome compromise of today — the
 * desktop bar hides below md while AppShell renders a mobile-only
 * bar. R14-PR12 unifies the two; until then the mobile bar is
 * the authoritative mobile surface.
 */
export const NAV_BAR_SHELL = [
    'hidden md:flex',
    NAV_BAR_POSITION,
    NAV_BAR_HEIGHT,
    'items-center justify-between',
    NAV_BAR_GAP,
    NAV_BAR_SURFACE,
    NAV_BAR_PADDING,
].join(' ');

/**
 * Left-slot recipe — flex row that hugs left, truncates gracefully.
 *
 * `min-w-0` is load-bearing: without it the breadcrumbs slot would
 * push the centre + right slots off the right edge instead of
 * truncating itself.
 */
export const NAV_BAR_SLOT_LEFT =
    'flex min-w-0 flex-1 items-center gap-default';

/**
 * Centre-slot recipe — fixed width, never grows past the search
 * pill's natural size.
 *
 * PR-1 leaves this empty (the centre slot is unused today). PR-6
 * fills it with the ⌘K search anchor. The slot's geometry stays
 * stable across centre-filled / centre-empty states so the layout
 * doesn't shift when search lands.
 */
export const NAV_BAR_SLOT_CENTER =
    'flex shrink-0 items-center justify-center';

/**
 * Right-slot recipe — flex row that hugs right.
 *
 * The mirror of the left slot. Together with the centre slot they
 * form a 3-region grid that the eye reads as "anchor — verb —
 * identity".
 */
export const NAV_BAR_SLOT_RIGHT =
    'flex shrink-0 items-center justify-end gap-default';

// ─── Component ───

export interface NavBarProps {
    /**
     * Left slot — brand · env badge · breadcrumbs.
     * Truncates gracefully when wide content (long breadcrumb
     * trails) collides with the centre slot.
     */
    left?: ReactNode;
    /**
     * Centre slot — global search anchor (filled by R14-PR6).
     * Stays empty in PR-1; the slot exists for layout stability.
     */
    center?: ReactNode;
    /**
     * Right slot — notifications · context · account.
     * Anchored to the right edge; never grows.
     */
    right?: ReactNode;
}

/**
 * The structural shell for the top-bar. Three named slots; the
 * shell owns spacing + alignment, slots own their content + state.
 *
 * Mounted once by `<TopChrome>`. Future R14 PRs add slot content;
 * the shell's geometry stays locked.
 */
export function NavBar({ left, center, right }: NavBarProps) {
    return (
        <header
            className={NAV_BAR_SHELL}
            role="banner"
            data-testid="nav-bar"
        >
            <div className={NAV_BAR_SLOT_LEFT} data-slot="left">
                {left}
            </div>
            <div className={NAV_BAR_SLOT_CENTER} data-slot="center">
                {center}
            </div>
            <div className={NAV_BAR_SLOT_RIGHT} data-slot="right">
                {right}
            </div>
        </header>
    );
}
