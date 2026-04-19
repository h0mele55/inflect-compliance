# Enterprise Filter System — Developer Guide

> **Epic 53** · `src/components/ui/filter/`
> The single source of truth for filter UI, state, and URL synchronization.

## Quick Start — Adding Filters to a List Page

```tsx
// 1. Define filters (in a constants file or inline)
import { createFilterDefs, optionsFromEnum } from '@/components/ui/filter';
import { CircleDot, Tag } from 'lucide-react';

const controlFilterDefs = createFilterDefs<Control>({
  status: {
    label: 'Status',
    icon: CircleDot,
    options: optionsFromEnum({
      NOT_STARTED: 'Not Started',
      IN_PROGRESS: 'In Progress',
      IMPLEMENTED: 'Implemented',
    }),
  },
  category: {
    label: 'Category',
    icon: Tag,
    multiple: true,
    options: optionsFromArray(['Technical', 'Operational', 'Compliance']),
  },
});

// 2. Wire up in your page component
import { useFilterContext, FilterProvider } from '@/components/ui/filter';

export function ControlsClient() {
  const filterCtx = useFilterContext(
    controlFilterDefs.filters,
    controlFilterDefs.filterKeys,
    { syncUrl: true },
  );

  return (
    <FilterProvider value={filterCtx}>
      {/* Filter UI and DataTable go here */}
    </FilterProvider>
  );
}
```

---

## Architecture

```
src/components/ui/filter/
├── index.ts               ← Barrel export (public API)
├── types.ts               ← Core types: Filter, FilterOption, ActiveFilter
├── filter-state.ts        ← Pure state functions (URL ↔ FilterState ↔ ActiveFilter)
├── filter-definitions.ts  ← createFilterDefs<T>, optionsFromEnum, optionsFromArray
├── filter-context.tsx     ← React context + useFilterContext + useFilters
├── filter-select.tsx      ← Filter.Select — command-palette picker (cmdk)
├── filter-list.tsx        ← Filter.List — active filter pills
├── filter-range-panel.tsx ← Range filter panel (internal)
└── filter-scroll.tsx      ← Scroll container (internal)
```

### Module Responsibilities

| Module | Purpose | Pure? |
|--------|---------|-------|
| `filter-state.ts` | URL parsing, state mutations, compatibility bridges | ✅ Yes |
| `filter-definitions.ts` | Factory for typed filter configs | ✅ Yes |
| `filter-context.tsx` | React context, URL sync hook | ❌ React |
| `filter-select.tsx` | Dropdown command palette | ❌ React |
| `filter-list.tsx` | Active filter pill strip | ❌ React |

---

## Filter Definitions

### `createFilterDefs<T>(defs)`

Creates a strongly-typed filter config from a plain object:

```tsx
const myFilters = createFilterDefs<MyEntity>({
  status: {
    label: 'Status',
    icon: CircleDot,
    options: [{ value: 'OPEN', label: 'Open' }],
  },
});

// Returns:
myFilters.filters     // FilterDef[] for Filter.Select
myFilters.filterKeys  // string[] for useFilterContext
myFilters.getFilter('status') // lookup by key
```

### Option Helpers

```tsx
// From enum-like object
optionsFromEnum({ OPEN: 'Open', CLOSED: 'Closed' })

// From string array
optionsFromArray(['Technical', 'Operational'])

// From API data (dynamic)
extractFilterOptions(data, 'status', (v) => prettifyStatus(v))
```

---

## State Management

### Pure Functions (`filter-state.ts`)

All state functions are pure and return new objects (immutable):

```tsx
import {
  addFilterValue,
  removeFilterValue,
  toggleFilterValue,
  setFilterValue,
  removeFilter,
  clearAllFilters,
} from '@/components/ui/filter';

// Add
addFilterValue(state, 'status', 'OPEN')
addFilterValue(state, 'status', ['OPEN', 'CLOSED'])

// Remove
removeFilterValue(state, 'status', 'OPEN')
removeFilter(state, 'status')       // remove entire key
clearAllFilters()                    // empty state

// Toggle (add if absent, remove if present)
toggleFilterValue(state, 'status', 'OPEN')

// Set (replace all values for a key)
setFilterValue(state, 'status', 'OPEN')
```

### URL Synchronization

```tsx
import {
  parseUrlToFilterState,
  filterStateToUrlParams,
  filterStateToActiveFilters,
} from '@/components/ui/filter';

// URL → state
const state = parseUrlToFilterState(window.location.search, ['status', 'category']);

// State → URL
const params = filterStateToUrlParams(state);

// State → UI (for Filter.Select/Filter.List)
const activeFilters = filterStateToActiveFilters(state);
```

### React Context (`useFilterContext`)

The primary hook for page-level filter setup:

```tsx
const filterCtx = useFilterContext(
  myFilters.filters,
  myFilters.filterKeys,
  {
    syncUrl: true,           // sync to URL (default: true)
    urlConfig: {
      separator: ',',        // multi-value separator
      prefix: '',            // param prefix (e.g., 'f_')
    },
    serverFilters: props.serverFilters, // SSR hydration
  },
);

// Use in children via:
const { state, set, toggle, clearAll, hasActive, search, setSearch } = useFilters();
```

---

## Compatibility with CompactFilterBar

The existing `CompactFilterBar` system (Epic 52) uses flat `Record<string, string>`.
Bridge functions are available:

```tsx
import { fromCompactFilterState, toCompactFilterState } from '@/components/ui/filter';

// CompactFilterBar → FilterState
const state = fromCompactFilterState({ status: 'OPEN', q: 'search' });
// → { status: ['OPEN'], q: ['search'] }

// FilterState → CompactFilterBar
const flat = toCompactFilterState(state);
// → { status: 'OPEN', q: 'search' }
```

---

## DO / DON'T

### ✅ DO

- Import from the barrel: `from '@/components/ui/filter'`
- Use `createFilterDefs` for typed definitions
- Use `useFilterContext` for page-level state
- Use `useFilters()` in child components to access state
- Keep filter configs colocated with their page or in a shared constants file
- Test pure state functions directly (no React needed)

### ❌ DON'T

- Import from internal modules (`filter-range-panel`, `filter-scroll`)
- Create ad-hoc filter state management (`useState` + manual URL sync)
- Hardcode entity-specific logic in the shared filter module
- Use raw `URLSearchParams` manipulation for filter state
- Skip the compatibility bridge when mixing with CompactFilterBar pages

---

## Query Helpers

```tsx
import {
  isFilterActive,
  isValueSelected,
  countActiveFilters,
  countActiveFilterKeys,
  hasActiveFilters,
} from '@/components/ui/filter';

isFilterActive(state, 'status')           // boolean
isValueSelected(state, 'status', 'OPEN')  // boolean
countActiveFilters(state)                  // total values across all keys
countActiveFilterKeys(state)              // number of active keys
hasActiveFilters(state)                   // any filters active?
```

---

## Migration Path

### From CompactFilterBar (Epic 52) to Enterprise Filters (Epic 53)

1. Create filter definitions using `createFilterDefs`
2. Replace `useUrlFilters` with `useFilterContext`
3. Replace `<CompactFilterBar>` with `<Filter.Select>` + `<Filter.List>`
4. Test URL sync and filter behavior
5. Remove old config from `src/components/filters/configs.ts`

### Gradual adoption

Pages can be migrated individually. The `fromCompactFilterState` / `toCompactFilterState` bridges
ensure both systems can coexist during the transition.

---

## Testing

- **Pure functions**: test directly without React — see `tests/unit/filter-system.test.ts`
- **Architecture**: 73 tests cover state mutations, URL roundtrips, compatibility bridges
- **Integration**: page-level filter behavior tested via E2E specs
