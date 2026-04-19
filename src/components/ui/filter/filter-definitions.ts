/**
 * Filter Definitions — typed helpers for creating filter configurations.
 *
 * The `createFilterDef` helper provides type inference for defining
 * entity-specific filter configurations that work with both the enterprise
 * Filter.Select/Filter.List components and the URL state system.
 *
 * Usage:
 *   const controlFilters = createFilterDefs<Control>({
 *     status: {
 *       label: "Status",
 *       icon: CircleDot,
 *       options: [
 *         { value: "OPEN", label: "Open" },
 *         { value: "CLOSED", label: "Closed" },
 *       ],
 *     },
 *     category: {
 *       label: "Category",
 *       icon: Tag,
 *       multiple: true,
 *       options: [
 *         { value: "Technical", label: "Technical" },
 *       ],
 *     },
 *   });
 */

import { LucideIcon } from "lucide-react";
import type { Filter, FilterOption } from "./types";

// ── Types ───────────────────────────────────────────────────────────

/**
 * Simplified filter definition input. Less verbose than the full Filter type,
 * with sensible defaults for common patterns.
 */
export interface FilterDefInput {
  /** Display label. */
  label: string;
  /** Plural form (auto-derived if omitted). */
  labelPlural?: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Filter options. Pass `null` for async-loaded options. */
  options: FilterOption[] | null;
  /** Filter type. Default: "default". */
  type?: "default" | "range";
  /** Allow multiple selection. Default: false. */
  multiple?: boolean;
  /** Force single selection even in advanced mode. */
  singleSelect?: boolean;
  /** Hide the IS/IS_NOT operator toggle. */
  hideOperator?: boolean;
  /** Add a visual separator after this filter in the dropdown. */
  separatorAfter?: boolean;
  /** Disable cmdk's built-in filtering (for externally filtered options). */
  shouldFilter?: boolean;
  /** URL param key override (defaults to the definition key). */
  paramKey?: string;

  // Range-specific
  formatRangeBound?: (n: number) => string;
  parseRangeInput?: (raw: string) => number;
  rangeDisplayScale?: number;
  rangeNumberStep?: number;
  formatRangePillLabel?: (token: string) => string;
}

/**
 * A fully resolved filter definition, extending Filter with metadata.
 */
export interface FilterDef extends Filter {
  /** The URL parameter key for this filter. */
  paramKey: string;
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Create a set of typed filter definitions from a configuration object.
 *
 * @typeParam T - The entity type these filters apply to (for documentation/tooling).
 * @param defs - Object where keys are filter identifiers and values are FilterDefInput.
 * @returns An object with:
 *   - `filters`: Filter[] array for passing to Filter.Select
 *   - `filterKeys`: string[] of all URL param keys
 *   - `getFilter(key)`: lookup a single FilterDef by key
 *   - `defs`: the original keyed definitions
 */
export function createFilterDefs<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _T = any,
>(
  defs: Record<string, FilterDefInput>,
): {
  /** Filter[] for passing to Filter.Select / Filter.List. */
  filters: FilterDef[];
  /** All URL param keys managed by these filters. */
  filterKeys: string[];
  /** Lookup a FilterDef by key. */
  getFilter: (key: string) => FilterDef | undefined;
  /** The raw keyed definitions. */
  defs: Record<string, FilterDef>;
} {
  const resolved: Record<string, FilterDef> = {};

  for (const [key, input] of Object.entries(defs)) {
    resolved[key] = {
      key,
      paramKey: input.paramKey ?? key,
      label: input.label,
      labelPlural: input.labelPlural,
      icon: input.icon,
      options: input.options,
      type: input.type ?? "default",
      multiple: input.multiple ?? false,
      singleSelect: input.singleSelect,
      hideOperator: input.hideOperator,
      separatorAfter: input.separatorAfter,
      shouldFilter: input.shouldFilter,
      formatRangeBound: input.formatRangeBound,
      parseRangeInput: input.parseRangeInput,
      rangeDisplayScale: input.rangeDisplayScale,
      rangeNumberStep: input.rangeNumberStep,
      formatRangePillLabel: input.formatRangePillLabel,
    };
  }

  const filters = Object.values(resolved);
  const filterKeys = filters.map((f) => f.paramKey);

  return {
    filters,
    filterKeys,
    getFilter: (key: string) => resolved[key],
    defs: resolved,
  };
}

// ── Option Builders ─────────────────────────────────────────────────

/**
 * Create options from an enum-like record.
 *
 * @param enumObj - Record of value → label.
 * @param icon - Optional icon for each option.
 *
 * Usage:
 *   optionsFromEnum({ OPEN: "Open", CLOSED: "Closed" })
 */
export function optionsFromEnum(
  enumObj: Record<string, string>,
  icon?: LucideIcon,
): FilterOption[] {
  return Object.entries(enumObj).map(([value, label]) => ({
    value,
    label,
    ...(icon ? { icon } : {}),
  }));
}

/**
 * Create options from a string array.
 *
 * Usage:
 *   optionsFromArray(["Technical", "Operational", "Compliance"])
 */
export function optionsFromArray(values: string[]): FilterOption[] {
  return values.map((value) => ({ value, label: value }));
}
