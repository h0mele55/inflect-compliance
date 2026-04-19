import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "text-sm font-medium transition-all duration-150",
    "border rounded-lg",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-brand-600 border-brand-600 text-white",
          "hover:bg-brand-500 hover:border-brand-500",
          "shadow-sm shadow-brand-600/20",
        ],
        secondary: [
          "bg-bg-default border-border-subtle text-content-emphasis",
          "hover:bg-bg-muted hover:border-border-default",
        ],
        outline: [
          "bg-transparent border-border-default text-content-default",
          "hover:bg-bg-muted hover:text-content-emphasis",
        ],
        ghost: [
          "bg-transparent border-transparent text-content-default",
          "hover:bg-bg-muted hover:text-content-emphasis",
        ],
        danger: [
          "bg-red-600/80 border-red-600 text-white",
          "hover:bg-red-500 hover:border-red-500",
        ],
        "danger-outline": [
          "bg-transparent border-border-error text-content-error",
          "hover:bg-bg-error hover:text-content-error",
        ],
        success: [
          "bg-emerald-600/80 border-emerald-600 text-white",
          "hover:bg-emerald-500 hover:border-emerald-500",
        ],
      },
      size: {
        xs: "h-7 px-2.5 text-[11px] gap-1 rounded-md",
        sm: "h-8 px-3 text-xs gap-1.5",
        md: "h-9 px-3.5 text-sm gap-2",
        lg: "h-10 px-5 text-sm gap-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);
