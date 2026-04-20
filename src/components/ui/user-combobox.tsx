"use client";

/**
 * Epic 55 Prompt 5 — shared <UserCombobox>.
 *
 * One canonical people-picker built on `<Combobox>`. Handles fetching
 * the tenant's membership list, projecting each member into a search-
 * friendly option label ("Alice Admin · alice@acme.com"), and exposing
 * a thin API so call sites can swap out free-text UUID inputs without
 * a big per-call boilerplate.
 *
 * Tenant safety:
 *   - Members are loaded from `/api/t/{tenantSlug}/admin/members`, which
 *     already enforces tenant scoping + admin/auditor RBAC on the
 *     server. We do not touch cross-tenant data.
 *   - The query key is namespaced via `queryKeys.members.list(tenantSlug)`
 *     so the cache is isolated per tenant.
 *
 * Modes:
 *   - Single-select (default) — the typical assignee / owner picker.
 *   - Multi-select (opt-in) — set `multiple={true}` and pass arrays to
 *     `selectedIds` / `onChange`. Reviewers / subscribers are the
 *     natural future clients of this mode.
 *
 * The returned value is the user's id (uuid). The label is rich
 * (name + email) to maximise fuzzy-match hits, but the outbound
 * contract is still "just a uuid" so every existing backend schema
 * (`ownerUserId`, `assigneeUserId`, `treatmentOwnerUserId`, …) works
 * untouched.
 */

import { useQuery } from "@tanstack/react-query";
import * as React from "react";
import { Combobox, type ComboboxOption } from "./combobox";
import { queryKeys } from "@/lib/queryKeys";

// ─── Types ──────────────────────────────────────────────────────────

export interface Member {
    id: string;
    name: string | null;
    email: string;
    image: string | null;
}

/**
 * Raw membership entry returned by `/admin/members`. We project it into
 * a flat Member shape before it reaches the Combobox.
 */
interface AdminMembershipEntry {
    id: string;
    userId: string;
    user: {
        id: string;
        name: string | null;
        email: string;
        image: string | null;
    };
    status: string;
}

// ─── Shared props ───────────────────────────────────────────────────

interface BaseUserComboboxProps {
    tenantSlug: string;
    /**
     * Trigger id — the shared form primitives inject ids via
     * `<FormField>`. When the caller pins a stable id (e.g. for E2E),
     * pass it through.
     */
    id?: string;
    /** Hidden form-input name; same serialisation rules as Combobox. */
    name?: string;
    disabled?: boolean;
    required?: boolean;
    invalid?: boolean;
    placeholder?: string;
    searchPlaceholder?: string;
    /** Preserved for FormField-driven layouts. */
    "aria-describedby"?: string;
    /** Force the desktop popover (needed inside Modal/Sheet). */
    forceDropdown?: boolean;
    /** Match the button width to its trigger (form-field feel). */
    matchTriggerWidth?: boolean;
    /**
     * Pre-fetched member list. When supplied we skip the internal
     * useQuery — useful for server-rendered pages that already hold the
     * membership roster.
     */
    preloadedMembers?: Member[];
    /**
     * Client-side filter applied to members before they're projected
     * into options. Useful for scoping ("only ACTIVE members").
     */
    filter?: (member: Member) => boolean;
    className?: string;
}

type SingleProps = BaseUserComboboxProps & {
    multiple?: false;
    selectedId: string | null;
    onChange: (userId: string | null, member: Member | null) => void;
};

type MultipleProps = BaseUserComboboxProps & {
    multiple: true;
    selectedIds: string[];
    onChange: (userIds: string[], members: Member[]) => void;
};

export type UserComboboxProps = SingleProps | MultipleProps;

// ─── Hook — shared members fetch ───────────────────────────────────

export function useTenantMembers(
    tenantSlug: string,
    options?: { enabled?: boolean },
) {
    return useQuery<Member[]>({
        queryKey: queryKeys.members.list(tenantSlug),
        enabled: options?.enabled ?? true,
        queryFn: async () => {
            const res = await fetch(
                `/api/t/${tenantSlug}/admin/members`,
            );
            if (!res.ok) {
                // RBAC: non-admins may not reach this endpoint. Fall
                // back to an empty list rather than throwing so a
                // picker shell still renders (users will see "No
                // members available to assign" and can contact their
                // admin).
                return [];
            }
            const data: AdminMembershipEntry[] = await res.json();
            return data
                .filter((m) => m.status === "ACTIVE")
                .map((m) => ({
                    id: m.user.id,
                    name: m.user.name,
                    email: m.user.email,
                    image: m.user.image,
                }));
        },
        staleTime: 60_000,
    });
}

// ─── Option projection ─────────────────────────────────────────────

function memberLabel(member: Member): string {
    const name = member.name?.trim();
    if (name) return `${name} · ${member.email}`;
    return member.email;
}

function toOption(member: Member): ComboboxOption<Member> {
    return {
        value: member.id,
        label: memberLabel(member),
        meta: member,
    };
}

// ─── Component ─────────────────────────────────────────────────────

export function UserCombobox(props: UserComboboxProps) {
    const {
        tenantSlug,
        id,
        name,
        disabled,
        required,
        invalid,
        placeholder = "Unassigned",
        searchPlaceholder = "Search members…",
        "aria-describedby": ariaDescribedBy,
        forceDropdown = true,
        matchTriggerWidth = true,
        preloadedMembers,
        filter,
        className,
    } = props;

    const query = useTenantMembers(tenantSlug, {
        enabled: !preloadedMembers,
    });

    const members = preloadedMembers ?? query.data ?? [];
    const filtered = filter ? members.filter(filter) : members;

    const options = React.useMemo(
        () => filtered.map(toOption),
        [filtered],
    );

    if (props.multiple) {
        const selectedOptions = options.filter((o) =>
            props.selectedIds.includes(o.value),
        );
        return (
            <Combobox<true, Member>
                multiple
                id={id}
                name={name}
                disabled={disabled}
                required={required}
                invalid={invalid}
                aria-describedby={ariaDescribedBy}
                options={options}
                selected={selectedOptions}
                setSelected={(opts) =>
                    props.onChange(
                        opts.map((o) => o.value),
                        opts.map((o) => o.meta as Member),
                    )
                }
                loading={!preloadedMembers && query.isLoading}
                placeholder={placeholder}
                searchPlaceholder={searchPlaceholder}
                emptyState="No members match"
                forceDropdown={forceDropdown}
                matchTriggerWidth={matchTriggerWidth}
                buttonProps={{ className: className ?? "w-full" }}
                caret
            />
        );
    }

    const selected =
        options.find((o) => o.value === props.selectedId) ?? null;

    return (
        <Combobox<false, Member>
            id={id}
            name={name}
            disabled={disabled}
            required={required}
            invalid={invalid}
            aria-describedby={ariaDescribedBy}
            options={options}
            selected={selected}
            setSelected={(option) =>
                props.onChange(
                    option?.value ?? null,
                    (option?.meta as Member | undefined) ?? null,
                )
            }
            loading={!preloadedMembers && query.isLoading}
            placeholder={placeholder}
            searchPlaceholder={searchPlaceholder}
            emptyState="No members match"
            forceDropdown={forceDropdown}
            matchTriggerWidth={matchTriggerWidth}
            buttonProps={{ className: className ?? "w-full" }}
            caret
        />
    );
}
