"use client";

import { cn } from "./table-utils";
import { Table } from "@tanstack/react-table";
import {
  ButtonHTMLAttributes,
  forwardRef,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { Checkbox } from "../checkbox";
import { useKeyboardShortcut } from "../hooks/use-keyboard-shortcut";
import { DynamicTooltipWrapper, Tooltip } from "../tooltip";

// ── Batch Action Types ──────────────────────────────────────────────

/**
 * Describes a single batch action that can be plugged into the SelectionToolbar.
 *
 * Usage:
 *   const actions: BatchAction<Control>[] = [
 *     {
 *       label: "Export",
 *       icon: <Download className="size-3.5" />,
 *       onClick: (rows) => exportControls(rows.map(r => r.original)),
 *     },
 *     {
 *       label: "Archive",
 *       icon: <Archive className="size-3.5" />,
 *       onClick: (rows) => archiveControls(rows.map(r => r.original.id)),
 *       variant: "danger",
 *     },
 *   ];
 */
export interface BatchAction<T> {
  /** Human-readable label for the button. */
  label: string;

  /** Optional icon rendered before the label. */
  icon?: ReactNode;

  /** Callback receiving the currently selected rows. */
  onClick: (selectedRows: import("@tanstack/react-table").Row<T>[]) => void;

  /** Visual variant — danger adds a red/destructive style. */
  variant?: "default" | "danger";

  /** Whether this action is currently disabled. */
  disabled?: boolean;

  /** Optional tooltip text shown when hovering the button. */
  title?: string;
}

// ── BatchActionButton ───────────────────────────────────────────────

/**
 * Styled button for use inside the SelectionToolbar.
 * Matches Inflect's dark-theme design tokens and provides default + danger variants.
 *
 * Can be used standalone or generated from BatchAction[] via renderBatchActions.
 */
export interface BatchActionButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "danger";
  icon?: ReactNode;
}

export const BatchActionButton = forwardRef<
  HTMLButtonElement,
  BatchActionButtonProps
>(({ variant = "default", icon, className, children, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-slate-800",
      "disabled:pointer-events-none disabled:opacity-40",
      variant === "default" &&
        "bg-slate-700 text-slate-200 hover:bg-slate-600 active:bg-slate-500",
      variant === "danger" &&
        "bg-red-900/60 text-red-200 hover:bg-red-800/80 active:bg-red-700/80",
      className,
    )}
    {...props}
  >
    {icon && <span className="shrink-0">{icon}</span>}
    {children}
  </button>
));

BatchActionButton.displayName = "BatchActionButton";

// ── renderBatchActions helper ───────────────────────────────────────

/**
 * Converts a BatchAction[] into a (table) => ReactNode callback
 * suitable for the `selectionControls` prop of DataTable.
 *
 * Usage:
 *   <DataTable
 *     selectionControls={renderBatchActions(myActions)}
 *     ...
 *   />
 */
export function renderBatchActions<T>(
  actions: BatchAction<T>[],
): (table: Table<T>) => ReactNode {
  return (table: Table<T>) => {
    const selectedRows = table.getSelectedRowModel().rows;
    return (
      <>
        {actions.map((action) => (
          <DynamicTooltipWrapper
            key={action.label}
            tooltipProps={action.title ? { content: action.title } : undefined}
          >
            <BatchActionButton
              variant={action.variant}
              icon={action.icon}
              disabled={action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick(selectedRows);
              }}
            >
              {action.label}
            </BatchActionButton>
          </DynamicTooltipWrapper>
        ))}
      </>
    );
  };
}

// ── SelectionToolbar ────────────────────────────────────────────────

export function SelectionToolbar<T>({
  table,
  controls,
  className,
}: {
  table: Table<T>;
  controls?: (table: Table<T>) => ReactNode;
  className?: string;
}) {
  const selectedCount = table.getSelectedRowModel().rows.length;
  const totalCount = table.getRowModel().rows.length;
  const [lastSelectedCount, setLastSelectedCount] = useState(0);

  useEffect(() => {
    if (selectedCount !== 0) setLastSelectedCount(selectedCount);
  }, [selectedCount]);

  // Epic 57 — Escape clears the current row selection. Priority 2 so
  // this beats the filter-list clear (priority 1) when both are
  // active; both remain below any open overlay's native Escape (our
  // global-scope hook is skipped while a modal/sheet is mounted).
  useKeyboardShortcut("Escape", () => table.resetRowSelection(), {
    enabled: selectedCount > 0,
    priority: 2,
    scope: "global",
    description: "Clear selection",
  });

  return (
    <div
      className={cn(
        "border-slate-700/50 w-full border-b bg-slate-800",
        "transition-opacity duration-100",
        selectedCount > 0
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
        className,
      )}
      inert={selectedCount === 0}
      role="toolbar"
      aria-label="Batch actions"
      data-testid="selection-toolbar"
    >
      <div className="flex h-11 items-center py-2.5 pr-2">
        {/* Select-all / indeterminate checkbox */}
        <div className="relative flex h-full w-12 shrink-0 items-center justify-center">
          <Tooltip
            content={
              table.getIsAllRowsSelected()
                ? "Deselect all"
                : `Select all ${totalCount}`
            }
          >
            {/* NB: <div role="button">, not <button>. Radix Checkbox
                inside renders its own <button>, so a <button> wrapper
                causes the "<button> cannot be a descendant of <button>"
                hydration mismatch. */}
            <div
              role="button"
              tabIndex={-1}
              className="absolute inset-0 flex cursor-pointer items-center justify-center"
              onClick={(e) => {
                e.stopPropagation();
                table.toggleAllRowsSelected();
              }}
              aria-label={
                table.getIsAllRowsSelected()
                  ? "Deselect all rows"
                  : "Select all rows"
              }
            >
              <Checkbox
                className="border-slate-500 pointer-events-none size-4 rounded data-[state=checked]:bg-brand-600 data-[state=indeterminate]:bg-brand-600"
                checked={
                  table.getIsAllRowsSelected()
                    ? true
                    : table.getIsSomeRowsSelected()
                      ? "indeterminate"
                      : false
                }
              />
            </div>
          </Tooltip>
        </div>

        {/* Count + actions */}
        <div className="flex min-w-0 items-center gap-2.5 pl-1">
          <span
            className={cn(
              "text-slate-200 text-sm font-medium tabular-nums transition-transform duration-150",
              selectedCount > 0 ? "translate-x-0" : "-translate-x-1",
            )}
          >
            {lastSelectedCount} selected
          </span>

          {/* Separator between count and actions */}
          <div
            className={cn(
              "bg-slate-600 h-4 w-px transition-opacity duration-150",
              selectedCount > 0 ? "opacity-100" : "opacity-0",
            )}
          />

          {/* Clear selection button */}
          <Tooltip content="Clear selection" shortcut="Esc">
          <button
            type="button"
            className={cn(
              "text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded px-1",
            )}
            onClick={(e) => {
              e.stopPropagation();
              table.resetRowSelection();
            }}
            aria-label="Clear selection"
          >
            Clear
          </button>
          </Tooltip>

          {/* Pluggable batch action buttons */}
          <div
            className={cn(
              "flex items-center gap-1.5 transition-transform duration-150",
              selectedCount > 0 ? "translate-x-0" : "-translate-x-1",
            )}
          >
            {controls?.(table)}
          </div>
        </div>
      </div>
    </div>
  );
}
