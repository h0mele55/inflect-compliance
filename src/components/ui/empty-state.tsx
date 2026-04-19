import { cn } from "@dub/utils";
import { PropsWithChildren, ReactNode } from "react";

export interface EmptyStateProps extends PropsWithChildren {
  icon: React.ElementType;
  title: string;
  description?: ReactNode;
  learnMore?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  learnMore,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-y-4 py-12 px-6",
        className,
      )}
    >
      <div className="flex size-14 items-center justify-center rounded-xl border border-border-subtle bg-bg-muted">
        <Icon className="size-6 text-content-muted" />
      </div>
      <p className="text-center text-base font-medium text-content-emphasis">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-balance text-center text-sm text-content-muted">
          {description}{" "}
          {learnMore && (
            <a
              href={learnMore}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-content-emphasis transition-colors"
            >
              Learn more ↗
            </a>
          )}
        </p>
      )}
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
