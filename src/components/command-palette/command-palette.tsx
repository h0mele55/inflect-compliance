'use client';

/**
 * Epic 57 — Command Palette surface.
 *
 * Hosts `cmdk` inside a Radix Dialog so the palette gets the same
 * focus-trap, backdrop, and portal guarantees as every other Inflect
 * overlay. Opening is handled by the `CommandPaletteProvider` (which
 * owns the `mod+k` shortcut); this file only renders the surface.
 *
 * The palette is deliberately minimal on first mount — a search input,
 * an empty state, and a "Keyboard shortcuts" group seeded from the
 * shared registry. Later Epic 57 prompts will layer in:
 *   - navigation commands (tenant-aware routes)
 *   - entity search (controls, risks, policies, tasks, evidence, …)
 *   - quick actions (new control, new risk, toggle theme, sign out, …)
 *
 * Adding a group is declarative: feed `Command.Group` with an array
 * of items. No palette-local state beyond the search query and the
 * selected item — both owned by cmdk.
 *
 * Accessibility:
 *   - Radix Dialog provides `role="dialog"` + focus trap + Escape close.
 *   - A visually-hidden `Dialog.Title` satisfies Radix's a11y contract.
 *   - cmdk's `Command.Input` carries `role="combobox"` + `aria-expanded`
 *     + `aria-controls`; selected items emit `data-selected="true"`.
 */

import * as Dialog from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { cn } from '@dub/utils';
import { Command } from 'cmdk';
import {
    FileText,
    Files,
    Layers,
    Paperclip,
    Search,
    ShieldCheck,
    Triangle,
    type LucideIcon,
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import {
    useRegisteredShortcuts,
    type RegisteredShortcut,
} from '@/lib/hooks/use-keyboard-shortcut';

import { useCommandPalette } from './command-palette-provider';
import {
    tenantSlugFromPathname,
    useEntitySearch,
    type EntityKind,
    type EntitySearchResult,
} from './use-entity-search';
import {
    filterPaletteCommands,
    usePaletteCommands,
    type PaletteCommand,
} from './use-palette-commands';

// ─── Key rendering helpers ─────────────────────────────────────────────

function isMac(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function prettifyKeyToken(token: string): string {
    const t = token.trim().toLowerCase();
    if (t === 'mod') return isMac() ? '⌘' : 'Ctrl';
    if (t === 'meta' || t === 'cmd' || t === 'command') return '⌘';
    if (t === 'ctrl' || t === 'control') return 'Ctrl';
    // macOS uses the glyph U+2325 for Option, but our UI-chrome
    // guardrail (tests/guardrails/no-emoji-icons.test.ts) blocks it.
    // Render text "Alt" on both platforms — recognisable everywhere.
    if (t === 'alt' || t === 'opt' || t === 'option') return 'Alt';
    if (t === 'shift') return '⇧';
    if (t === 'enter' || t === 'return') return '↵';
    if (t === 'escape' || t === 'esc') return 'Esc';
    if (t === 'arrowup') return '↑';
    if (t === 'arrowdown') return '↓';
    if (t === 'arrowleft') return '←';
    if (t === 'arrowright') return '→';
    if (t.length === 1) return t.toUpperCase();
    // Named key: "Tab", "Backspace", "Delete", etc. Title-case it.
    return t.charAt(0).toUpperCase() + t.slice(1);
}

function renderShortcut(raw: string): ReactNode {
    // Split on `+`, preserving a literal trailing `+` the parser lets through.
    const parts: string[] = [];
    let buf = '';
    for (let i = 0; i < raw.length; i++) {
        const ch = raw[i];
        if (ch === '+' && buf.length > 0 && i < raw.length - 1) {
            parts.push(buf);
            buf = '';
        } else {
            buf += ch;
        }
    }
    if (buf.length > 0) parts.push(buf);

    return parts.map((p, i) => (
        <kbd
            key={`${p}-${i}`}
            className={cn(
                'ml-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center',
                'rounded border border-border-subtle bg-bg-muted px-1.5',
                'text-[10px] font-medium text-content-muted',
            )}
        >
            {prettifyKeyToken(p)}
        </kbd>
    ));
}

// ─── Component ─────────────────────────────────────────────────────────

/**
 * Renders nothing until the provider says `isOpen`. Mounting as a
 * portal keeps the palette isolated from layout and always on top.
 */
const ENTITY_META: Record<
    EntityKind,
    { heading: string; icon: LucideIcon }
> = {
    control: { heading: 'Controls', icon: ShieldCheck },
    risk: { heading: 'Risks', icon: Triangle },
    policy: { heading: 'Policies', icon: FileText },
    evidence: { heading: 'Evidence', icon: Paperclip },
    framework: { heading: 'Frameworks', icon: Layers },
};

const ENTITY_ORDER: EntityKind[] = [
    'control',
    'risk',
    'policy',
    'evidence',
    'framework',
];

function groupByKind(
    results: EntitySearchResult[],
): Map<EntityKind, EntitySearchResult[]> {
    const grouped = new Map<EntityKind, EntitySearchResult[]>();
    for (const r of results) {
        const bucket = grouped.get(r.kind) ?? [];
        bucket.push(r);
        grouped.set(r.kind, bucket);
    }
    return grouped;
}

export function CommandPalette() {
    const { isOpen, close } = useCommandPalette();
    const shortcuts = useRegisteredShortcuts();
    const router = useRouter();
    const pathname = usePathname();
    const tenantSlug = tenantSlugFromPathname(pathname);

    const [query, setQuery] = useState('');
    const { loading, results, disabled: searchDisabled } = useEntitySearch(
        query,
        tenantSlug,
    );
    const grouped = groupByKind(results);
    const hasEntityResults = results.length > 0;

    // Navigation + action commands. When the user has started typing,
    // we fold the shortcut group away so the narrower, intent-driven
    // Navigation / Actions / entity-search stack owns the surface.
    const allCommands = usePaletteCommands(tenantSlug);
    const filteredCommands = filterPaletteCommands(allCommands, query);
    const navCommands = filteredCommands.filter((c) => c.group === 'Navigation');
    const actionCommands = filteredCommands.filter((c) => c.group === 'Actions');

    const showShortcuts = query.trim().length === 0;

    // The palette's own `mod+k` binding shouldn't clutter the list —
    // it's the invocation affordance, not a first-class command.
    const listedShortcuts = shortcuts.filter(
        (s) => s.description && s.description !== 'Open command palette',
    );

    const handleSelect = (href: string) => {
        close();
        // Reset the query so the next open starts fresh.
        setQuery('');
        router.push(href);
    };

    const handleAction = (perform: () => void) => {
        close();
        setQuery('');
        // Let the close animation kick before running the action so
        // a sign-out redirect doesn't race the portal teardown.
        queueMicrotask(() => perform());
    };

    // Reset the query when the palette closes so the next open starts
    // clean. Covers the backdrop-click and Escape paths that don't go
    // through `handleSelect`.
    useEffect(() => {
        if (!isOpen) setQuery('');
    }, [isOpen]);

    return (
        <Dialog.Root open={isOpen} onOpenChange={(next) => !next && close()}>
            <Dialog.Portal>
                <Dialog.Overlay
                    data-modal-overlay
                    className={cn(
                        'fixed inset-0 z-50',
                        'bg-bg-overlay backdrop-blur-sm',
                        'data-[state=open]:animate-fade-in',
                    )}
                />
                <Dialog.Content
                    aria-label="Command palette"
                    onOpenAutoFocus={(e) => {
                        // Radix focuses the first focusable child. cmdk's
                        // `Command.Input` is first in the tree and gets it
                        // by default. `preventDefault()` here would KEEP
                        // focus on the previously active element, so leave
                        // Radix's default behaviour in place.
                        e.stopPropagation();
                    }}
                    className={cn(
                        'fixed left-1/2 top-[20%] z-50 w-[92vw] max-w-[640px]',
                        '-translate-x-1/2',
                        'rounded-xl border border-border-default bg-bg-elevated shadow-2xl',
                        'text-content-emphasis',
                        'data-[state=open]:animate-fade-in',
                        'focus-visible:outline-none',
                    )}
                    data-command-palette
                >
                    <VisuallyHidden.Root>
                        <Dialog.Title>Command palette</Dialog.Title>
                        <Dialog.Description>
                            Search for pages, entities, and actions. Use arrow
                            keys to navigate and Enter to activate.
                        </Dialog.Description>
                    </VisuallyHidden.Root>

                    <Command
                        loop
                        // Backend filters for controls/risks/policies/
                        // evidence; client-side filtering happens in
                        // `useEntitySearch` for frameworks. cmdk's own
                        // fuzzy filter would double-filter away good
                        // matches, so disable it.
                        shouldFilter={false}
                        className="flex flex-col"
                        label="Command palette"
                    >
                        <div
                            className={cn(
                                'flex items-center gap-2 border-b border-border-subtle',
                                'px-4 py-3',
                            )}
                        >
                            <Search
                                className="size-4 shrink-0 text-content-muted"
                                aria-hidden="true"
                            />
                            <Command.Input
                                autoFocus
                                value={query}
                                onValueChange={setQuery}
                                placeholder={
                                    searchDisabled
                                        ? 'Sign in to search controls, risks, policies…'
                                        : 'Search controls, risks, policies, evidence, frameworks…'
                                }
                                className={cn(
                                    'flex-1 bg-transparent text-sm',
                                    'text-content-emphasis placeholder:text-content-subtle',
                                    'focus:outline-none',
                                )}
                                data-testid="command-palette-input"
                            />
                            <kbd
                                className={cn(
                                    'hidden shrink-0 items-center rounded border',
                                    'border-border-subtle bg-bg-muted px-1.5 py-0.5',
                                    'text-[10px] font-medium text-content-muted',
                                    'sm:inline-flex',
                                )}
                            >
                                Esc
                            </kbd>
                        </div>

                        <Command.List
                            className={cn(
                                'max-h-[min(60vh,420px)] overflow-y-auto',
                                'p-2',
                            )}
                            data-testid="command-palette-list"
                        >
                            <Command.Empty
                                className={cn(
                                    'py-10 text-center text-sm text-content-muted',
                                )}
                            >
                                {loading
                                    ? 'Searching…'
                                    : searchDisabled
                                      ? 'Entity search is available after sign-in.'
                                      : 'No results found.'}
                            </Command.Empty>

                            {navCommands.length > 0 && (
                                <CommandGroup
                                    heading="Navigation"
                                    items={navCommands}
                                    testIdPrefix="nav"
                                    onNavigate={handleSelect}
                                    onAction={handleAction}
                                />
                            )}

                            {actionCommands.length > 0 && (
                                <CommandGroup
                                    heading="Actions"
                                    items={actionCommands}
                                    testIdPrefix="action"
                                    onNavigate={handleSelect}
                                    onAction={handleAction}
                                />
                            )}

                            {hasEntityResults &&
                                ENTITY_ORDER.map((kind) => {
                                    const items = grouped.get(kind);
                                    if (!items || items.length === 0) return null;
                                    const meta = ENTITY_META[kind];
                                    return (
                                        <EntityGroup
                                            key={kind}
                                            heading={meta.heading}
                                            Icon={meta.icon}
                                            items={items}
                                            onSelect={handleSelect}
                                        />
                                    );
                                })}

                            {/*
                             * Keyboard-shortcut discoverability: show
                             * only when the user hasn't started typing
                             * — keeps the search surface uncluttered.
                             */}
                            {showShortcuts && listedShortcuts.length > 0 && (
                                <ShortcutGroup
                                    heading="Keyboard shortcuts"
                                    items={listedShortcuts}
                                />
                            )}
                        </Command.List>
                    </Command>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}

function CommandGroup({
    heading,
    items,
    testIdPrefix,
    onNavigate,
    onAction,
}: {
    heading: string;
    items: PaletteCommand[];
    testIdPrefix: string;
    onNavigate: (href: string) => void;
    onAction: (perform: () => void) => void;
}) {
    return (
        <Command.Group
            heading={heading}
            className={cn(
                '[&_[cmdk-group-heading]]:px-2',
                '[&_[cmdk-group-heading]]:py-1.5',
                '[&_[cmdk-group-heading]]:text-xs',
                '[&_[cmdk-group-heading]]:font-medium',
                '[&_[cmdk-group-heading]]:uppercase',
                '[&_[cmdk-group-heading]]:tracking-wider',
                '[&_[cmdk-group-heading]]:text-content-subtle',
            )}
        >
            {items.map((c) => {
                const Icon = c.icon;
                return (
                    <Command.Item
                        key={c.id}
                        value={c.id}
                        onSelect={() => {
                            if (c.href) onNavigate(c.href);
                            else if (c.perform) onAction(c.perform);
                        }}
                        className={cn(
                            'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
                            'text-content-default',
                            'data-[selected=true]:bg-bg-muted data-[selected=true]:text-content-emphasis',
                        )}
                        data-testid={`command-palette-${testIdPrefix}-${c.id}`}
                        data-href={c.href}
                    >
                        <Icon
                            aria-hidden="true"
                            className="size-4 shrink-0 text-content-muted"
                        />
                        <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    </Command.Item>
                );
            })}
        </Command.Group>
    );
}

function EntityGroup({
    heading,
    Icon,
    items,
    onSelect,
}: {
    heading: string;
    Icon: LucideIcon;
    items: EntitySearchResult[];
    onSelect: (href: string) => void;
}) {
    return (
        <Command.Group
            heading={heading}
            className={cn(
                '[&_[cmdk-group-heading]]:px-2',
                '[&_[cmdk-group-heading]]:py-1.5',
                '[&_[cmdk-group-heading]]:text-xs',
                '[&_[cmdk-group-heading]]:font-medium',
                '[&_[cmdk-group-heading]]:uppercase',
                '[&_[cmdk-group-heading]]:tracking-wider',
                '[&_[cmdk-group-heading]]:text-content-subtle',
            )}
        >
            {items.map((r) => (
                <Command.Item
                    key={`${r.kind}:${r.id}`}
                    // The value must be unique per item; include kind to
                    // avoid collisions across groups. cmdk's selection
                    // machinery uses this to drive keyboard navigation.
                    value={`${r.kind}:${r.id}:${r.primary}`}
                    onSelect={() => onSelect(r.href)}
                    className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
                        'text-content-default',
                        'data-[selected=true]:bg-bg-muted data-[selected=true]:text-content-emphasis',
                    )}
                    data-testid={`command-palette-result-${r.kind}`}
                    data-href={r.href}
                >
                    <Icon
                        aria-hidden="true"
                        className="size-4 shrink-0 text-content-muted"
                    />
                    <span className="min-w-0 flex-1 truncate">{r.primary}</span>
                    {r.secondary && (
                        <span className="shrink-0 text-xs text-content-muted">
                            {r.secondary}
                        </span>
                    )}
                    {r.badge && (
                        <span
                            className={cn(
                                'shrink-0 rounded border border-border-subtle bg-bg-muted',
                                'px-1.5 py-0.5 text-[10px] font-medium uppercase',
                                'tracking-wider text-content-muted',
                            )}
                        >
                            {r.badge}
                        </span>
                    )}
                </Command.Item>
            ))}
        </Command.Group>
    );
}

function ShortcutGroup({
    heading,
    items,
}: {
    heading: string;
    items: RegisteredShortcut[];
}) {
    return (
        <Command.Group
            heading={heading}
            className={cn(
                '[&_[cmdk-group-heading]]:px-2',
                '[&_[cmdk-group-heading]]:py-1.5',
                '[&_[cmdk-group-heading]]:text-xs',
                '[&_[cmdk-group-heading]]:font-medium',
                '[&_[cmdk-group-heading]]:uppercase',
                '[&_[cmdk-group-heading]]:tracking-wider',
                '[&_[cmdk-group-heading]]:text-content-subtle',
            )}
        >
            {items.map((s) => (
                <Command.Item
                    key={s.id}
                    value={`${s.description ?? ''} ${s.keys.join(' ')}`}
                    className={cn(
                        'flex cursor-default items-center justify-between gap-3',
                        'rounded-md px-2 py-2 text-sm',
                        'text-content-default',
                        'data-[selected=true]:bg-bg-muted data-[selected=true]:text-content-emphasis',
                    )}
                    data-testid="command-palette-shortcut"
                >
                    <span className="truncate">{s.description}</span>
                    <span className="flex items-center">
                        {s.keys.slice(0, 1).map((k) => (
                            <span key={k} className="flex items-center">
                                {renderShortcut(k)}
                            </span>
                        ))}
                    </span>
                </Command.Item>
            ))}
        </Command.Group>
    );
}
