"use client";

/**
 * DataTable — the canonical reusable table component for all entity list pages.
 *
 * Built on top of the TanStack React Table `useTable` + `Table` foundation,
 * this wrapper provides a simpler, ergonomic API for the most common pattern:
 *
 *   <DataTable
 *     data={controls}
 *     columns={controlColumns}
 *     loading={isLoading}
 *     onRowClick={(row) => router.push(`/controls/${row.original.id}`)}
 *   />
 *
 * For advanced features (column resizing, pinning, edit-columns), use the
 * lower-level `useTable` + `Table` directly.
 */
import {
  ColumnDef,
  PaginationState,
  Row,
  RowSelectionState,
  Table as TableType,
  VisibilityState,
} from "@tanstack/react-table";
import { Dispatch, MouseEvent, ReactNode, SetStateAction, useCallback, useState } from "react";
import { type BatchAction, renderBatchActions } from "./selection-toolbar";
import { Table, useTable } from "./table";
import { cn } from "./table-utils";

// ── Public Column Helper ────────────────────────────────────────────

/**
 * Typed column definition for DataTable.
 * Re-exports TanStack ColumnDef for convenience so consumers don't need
 * to import from @tanstack/react-table directly.
 */
export type { ColumnDef };

/**
 * Helper to create a typed column array with proper inference.
 *
 * Usage:
 *   const columns = createColumns<Control>([
 *     { accessorKey: "code", header: "Code" },
 *     { accessorKey: "name", header: "Name" },
 *     { id: "actions", header: "", cell: ({ row }) => <ActionsMenu row={row} /> },
 *   ]);
 */
export function createColumns<T>(
  columns: ColumnDef<T, any>[], // eslint-disable-line @typescript-eslint/no-explicit-any
): ColumnDef<T, any>[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  return columns;
}

// ── DataTable Props ─────────────────────────────────────────────────

export interface DataTableProps<T> {
  /** The data array to render. */
  data: T[];

  /** TanStack column definitions. Use `createColumns<T>()` for type safety. */
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any

  /** Show a loading overlay. */
  loading?: boolean;

  /** Error message to display instead of the table. */
  error?: string;

  /** Custom empty state content. */
  emptyState?: ReactNode;

  /** Human-readable resource name for empty/pagination text. */
  resourceName?: (plural: boolean) => string;

  // ── Sorting ──

  /** Column IDs that support sorting. */
  sortableColumns?: string[];

  /** Currently sorted column ID. */
  sortBy?: string;

  /** Current sort direction. */
  sortOrder?: "asc" | "desc";

  /** Callback when sort changes. */
  onSortChange?: (props: { sortBy?: string; sortOrder?: "asc" | "desc" }) => void;

  // ── Row interaction ──

  /** Callback when a row is clicked. */
  onRowClick?: (row: Row<T>, e: MouseEvent) => void;

  /** Unique row ID extractor (required for selection). */
  getRowId?: (row: T) => string;

  // ── Selection ──

  /** Callback when selected rows change. Enables selection checkboxes. */
  onRowSelectionChange?: (rows: Row<T>[]) => void;

  /** Externally controlled selection state. */
  selectedRows?: RowSelectionState;

  /** Custom toolbar rendered when rows are selected. */
  selectionControls?: (table: TableType<T>) => ReactNode;

  /**
   * Declarative batch actions — a simpler alternative to `selectionControls`.
   * When provided, automatically enables selection and renders a batch action bar.
   *
   * Usage:
   *   <DataTable
   *     batchActions={[
   *       { label: "Export", icon: <Download />, onClick: (rows) => exportRows(rows) },
   *       { label: "Delete", variant: "danger", onClick: (rows) => deleteRows(rows) },
   *     ]}
   *   />
   */
  batchActions?: BatchAction<T>[];

  // ── Column visibility ──

  /** Column visibility state. */
  columnVisibility?: VisibilityState;

  /** Callback when column visibility changes. */
  onColumnVisibilityChange?: (visibility: VisibilityState) => void;

  // ── Pagination ──

  /** Pagination state. Enables paginated mode. */
  pagination?: PaginationState;

  /** Pagination change handler. */
  onPaginationChange?: Dispatch<SetStateAction<PaginationState>>;

  /** Total row count (required for pagination). */
  rowCount?: number;

  // ── Styling ──

  /** Additional class for the outer container. */
  className?: string;

  /** Additional class for the scroll wrapper. */
  scrollWrapperClassName?: string;

  /**
   * Make the table fill its parent's flex space and provide its own
   * internal vertical scroll instead of growing arbitrarily.
   *
   * Use inside `<ListPageShell.Body>` (or any flex column with
   * `min-h-0` set) to keep the page header / filter toolbar /
   * pagination footer anchored while only the table body scrolls.
   *
   * On mobile (<md) this is a no-op — the table grows naturally and
   * the document scrolls.
   *
   * Default: `false` (legacy behaviour).
   */
  fillBody?: boolean;

  /** Test ID for automated testing. */
  "data-testid"?: string;
}

// ── DataTable Component ─────────────────────────────────────────────

export function DataTable<T>({
  data,
  columns,
  loading,
  error,
  emptyState,
  resourceName,
  sortableColumns,
  sortBy,
  sortOrder,
  onSortChange,
  onRowClick,
  getRowId,
  onRowSelectionChange,
  selectedRows,
  selectionControls,
  batchActions,
  columnVisibility,
  onColumnVisibilityChange,
  pagination,
  onPaginationChange,
  rowCount,
  className,
  scrollWrapperClassName,
  fillBody,
  "data-testid": dataTestId,
}: DataTableProps<T>) {
  // Compose the viewport-fill classes onto the existing className /
  // scrollWrapperClassName slots. Tailwind's `md:` prefixes mean
  // mobile keeps natural document scroll; desktop gets the flex
  // chain that lets the table body scroll within its parent.
  const filledContainerClassName = fillBody
    ? cn(
        // Container is a flex column that sizes to its content
        // (= the scroll wrapper inside) but is capped by the parent
        // (ListPageShell.Body). `max-h-full` is the cap;
        // `min-h-0` allows shrinking. NO `flex-1` — that would
        // force the card to fill the parent even when the scroll
        // wrapper inside is short (Evidence with 1 row, empty
        // state, etc.). Result: card grows with content up to
        // viewport, then stops; smaller content = smaller card.
        "md:flex md:flex-col md:max-h-full md:min-h-0 md:overflow-hidden",
        className,
      )
    : className;
  const filledScrollWrapperClassName = fillBody
    ? cn(
        // Wrapper sizes to content, capped at parent (the card).
        // The JS whole-row clip in table.tsx adds an inline
        // max-height when content exceeds the viewport allocation,
        // overriding this max-h-full to a row-aligned value.
        "md:max-h-full md:min-h-0 md:overflow-y-auto",
        scrollWrapperClassName,
      )
    : scrollWrapperClassName;
  // Auto-manage selection state when batchActions are provided without explicit selection handlers
  const [internalSelection, setInternalSelection] = useState<RowSelectionState>({});
  const hasExplicitSelection = !!onRowSelectionChange || !!selectionControls;
  const hasBatchActions = batchActions && batchActions.length > 0;

  // Determine effective selection props
  const effectiveOnRowSelectionChange = onRowSelectionChange ?? (hasBatchActions ? (() => {}) : undefined);
  const effectiveSelectedRows = selectedRows ?? (hasBatchActions && !hasExplicitSelection ? internalSelection : undefined);
  const effectiveSelectionControls = selectionControls ?? (hasBatchActions ? renderBatchActions(batchActions!) : undefined);
  // Build the useTable props, handling the pagination discriminated union
  const tableProps = pagination && onPaginationChange && rowCount !== undefined
    ? {
        data,
        columns,
        loading,
        error,
        emptyState,
        resourceName,
        sortableColumns,
        sortBy,
        sortOrder,
        onSortChange,
        onRowClick,
        getRowId,
        onRowSelectionChange: effectiveOnRowSelectionChange,
        selectedRows: effectiveSelectedRows,
        selectionControls: effectiveSelectionControls,
        columnVisibility,
        onColumnVisibilityChange,
        pagination,
        onPaginationChange,
        rowCount,
        containerClassName: filledContainerClassName,
        scrollWrapperClassName: filledScrollWrapperClassName,
      }
    : {
        data,
        columns,
        loading,
        error,
        emptyState,
        resourceName,
        sortableColumns,
        sortBy,
        sortOrder,
        onSortChange,
        onRowClick,
        getRowId,
        onRowSelectionChange: effectiveOnRowSelectionChange,
        selectedRows: effectiveSelectedRows,
        selectionControls: effectiveSelectionControls,
        columnVisibility,
        onColumnVisibilityChange,
        containerClassName: filledContainerClassName,
        scrollWrapperClassName: filledScrollWrapperClassName,
      };

  const { table, ...rest } = useTable(tableProps as any); // eslint-disable-line @typescript-eslint/no-explicit-any

  // The outermost wrapper exists for the dataTestId / id hooks the
  // E2E suite uses. When fillBody is on it participates in the
  // flex chain (max-h-full + flex flex-col + overflow-hidden) so
  // the inner card's max-h-full can resolve to a finite parent
  // height. NO flex-1 — see filledContainerClassName comment.
  const wrapperClassName = fillBody
    ? "md:flex md:flex-col md:max-h-full md:min-h-0 md:overflow-hidden"
    : undefined;

  return (
    <div id={dataTestId} data-testid={dataTestId} className={wrapperClassName}>
      <Table
        {...rest}
        table={table}
        data={data}
      />
    </div>
  );
}
