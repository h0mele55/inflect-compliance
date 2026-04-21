"use client";

/**
 * TableEmptyState — standardized empty/error state for entity list tables.
 *
 * Provides a consistent visual pattern across all entity list pages:
 * - Default "No items found" message
 * - Optional icon, description, and call-to-action button
 * - Error state variant
 *
 * Usage:
 *   <TableEmptyState
 *     title="No controls found"
 *     description="Create your first control to get started."
 *     icon={<Shield className="size-10" />}
 *     action={{ label: "Create Control", onClick: () => setOpen(true) }}
 *   />
 */

import { cn } from "./table-utils";
import { type ReactNode } from "react";

// ── Types ───────────────────────────────────────────────────────────

export interface TableEmptyStateAction {
  /** Button label text. */
  label: string;

  /** Click handler. */
  onClick: () => void;

  /** Visual variant for the button. */
  variant?: "default" | "primary";
}

export interface TableEmptyStateProps {
  /** Main heading text. Defaults to "No items found". */
  title?: string;

  /** Secondary description text. */
  description?: string;

  /** Icon element rendered above the title. */
  icon?: ReactNode;

  /** Optional call-to-action button. */
  action?: TableEmptyStateAction;

  /** Override the entire content with custom rendering. */
  children?: ReactNode;

  /** Additional className for the outer wrapper. */
  className?: string;
}

// ── Component ───────────────────────────────────────────────────────

export function TableEmptyState({
  title,
  description,
  icon,
  action,
  children,
  className,
}: TableEmptyStateProps) {
  // If children are provided, render them directly
  if (children) {
    return (
      <div
        className={cn(
          "text-content-muted flex h-96 w-full items-center justify-center text-sm",
          className,
        )}
        data-testid="table-empty-state"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex h-96 w-full flex-col items-center justify-center gap-3 px-6 text-center",
        className,
      )}
      data-testid="table-empty-state"
    >
      {/* Icon */}
      {icon && (
        <div className="text-content-subtle mb-1">
          {icon}
        </div>
      )}

      {/* Title */}
      <h3 className="text-content-default text-sm font-medium">
        {title ?? "No items found"}
      </h3>

      {/* Description */}
      {description && (
        <p className="text-content-subtle max-w-sm text-sm">
          {description}
        </p>
      )}

      {/* CTA Button */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={cn(
            "mt-2 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ring-offset-background)]",
            action.variant === "primary"
              ? "bg-[var(--brand-emphasis)] text-content-inverted hover:bg-[var(--brand-default)] active:bg-[var(--brand-emphasis)]"
              : "bg-bg-elevated text-content-emphasis hover:bg-bg-muted active:bg-bg-subtle border border-border-subtle",
          )}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
