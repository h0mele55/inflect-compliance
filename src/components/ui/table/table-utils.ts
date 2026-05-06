/**
 * Table-local utility functions.
 *
 * Previously imported from `@dub/utils`. Inlined here so the table
 * module is self-contained and doesn't depend on the Dub shim layer.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { type MouseEvent } from "react";

/** Tailwind class merge utility. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shallow-recursive deep equality check for plain objects. */
export function deepEqual(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;
  if (
    typeof obj1 !== "object" ||
    typeof obj2 !== "object" ||
    obj1 === null ||
    obj2 === null
  )
    return false;

  const a = obj1 as Record<string, unknown>;
  const b = obj2 as Record<string, unknown>;
  const keys1 = Object.keys(a);
  const keys2 = Object.keys(b);
  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key) || !deepEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Returns true if the click target is an interactive child element
 * (button, link, input, etc.) — used to ignore row-click handlers
 * when the user clicks on an action button within a row.
 */
export function isClickOnInteractiveChild(e: MouseEvent) {
  for (
    let target = e.target as HTMLElement, i = 0;
    target && target !== e.currentTarget && i < 50;
    target = target.parentElement as HTMLElement, i++
  ) {
    if (
      ["button", "a", "input", "textarea"].includes(
        target.tagName.toLowerCase(),
      ) ||
      target.getAttribute("role") === "dialog" ||
      target.id === "modal-backdrop" ||
      [
        "data-radix-popper-content-wrapper",
        "data-vaul-overlay",
        "data-vaul-drawer",
      ].some((attr) => target.getAttribute(attr) !== null)
    )
      return true;
  }
  return false;
}
