"use client";

import { cn } from "@dub/utils";
import { addMonths, addYears, format, isSameMonth } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { ElementType, HTMLAttributes, forwardRef, useState } from "react";
import {
  DayPicker,
  type DayPickerProps,
  type Matcher,
} from "react-day-picker";

interface NavigationButtonProps extends HTMLAttributes<HTMLButtonElement> {
  onClick: () => void;
  icon: ElementType;
  disabled?: boolean;
}

const NavigationButton = forwardRef<HTMLButtonElement, NavigationButtonProps>(
  (
    { onClick, icon: Icon, disabled, ...props }: NavigationButtonProps,
    forwardedRef,
  ) => {
    return (
      <button
        ref={forwardedRef}
        type="button"
        disabled={disabled}
        className={cn(
          "flex size-7 shrink-0 select-none items-center justify-center rounded border p-1 outline-none transition",
          "border-neutral-200 text-neutral-600 hover:text-neutral-800",
          "hover:bg-neutral-50 active:bg-neutral-100",
          "disabled:pointer-events-none disabled:text-neutral-400",
        )}
        onClick={onClick}
        {...props}
      >
        <Icon className="h-full w-full shrink-0" />
      </button>
    );
  },
);

NavigationButton.displayName = "NavigationButton";

// ── Calendar Props ──────────────────────────────────────────────────

type CalendarProps = DayPickerProps & {
  showYearNavigation?: boolean;
};

// ── Calendar Component (react-day-picker v9) ────────────────────────

function Calendar({
  mode = "single",
  weekStartsOn = 0,
  numberOfMonths = 1,
  showYearNavigation = false,
  disabled: disabledDays,
  locale,
  className,
  classNames,
  startMonth,
  endMonth,
  ...props
}: CalendarProps) {
  const [month, setMonth] = useState<Date>(
    (props as any).defaultMonth ?? new Date(),
  );

  const handleMonthChange = (newMonth: Date) => {
    setMonth(newMonth);
    (props as any).onMonthChange?.(newMonth);
  };

  const previousMonth = addMonths(month, -1);
  const nextMonth = addMonths(month, 1);

  const canGoBack = !startMonth || previousMonth >= startMonth;
  const canGoForward = !endMonth || nextMonth <= endMonth;

  const goToPreviousYear = () => {
    const target = addYears(month, -1);
    if (!startMonth || target.getTime() >= startMonth.getTime()) {
      handleMonthChange(target);
    }
  };

  const goToNextYear = () => {
    const target = addYears(month, 1);
    if (!endMonth || target.getTime() <= endMonth.getTime()) {
      handleMonthChange(target);
    }
  };

  return (
    <DayPicker
      {...(props as any)}
      mode={mode as any}
      month={month}
      onMonthChange={handleMonthChange}
      weekStartsOn={weekStartsOn}
      numberOfMonths={numberOfMonths}
      locale={locale}
      disabled={disabledDays}
      showOutsideDays={numberOfMonths === 1}
      className={className}
      startMonth={startMonth}
      endMonth={endMonth}
      classNames={{
        months: "flex space-y-0",
        month: "space-y-4 p-3 w-full",
        nav: "gap-1 flex items-center rounded-full w-full h-full justify-between p-4",
        month_grid: "w-full border-separate border-spacing-y-1",
        weekdays: "flex",
        weekday: "w-9 font-medium text-xs text-center text-neutral-400 pb-2",
        week: "w-full flex",
        day: "relative p-0 text-center focus-within:relative text-neutral-900",
        day_button: cn(
          "relative size-10 rounded-md text-sm text-neutral-900",
          "hover:bg-neutral-100 active:bg-neutral-200 outline outline-offset-2 outline-0 focus-visible:outline-2 outline-blue-500",
        ),
        today: "font-semibold",
        selected:
          "rounded aria-selected:bg-blue-500 aria-selected:text-white",
        disabled:
          "!text-neutral-300 line-through disabled:hover:bg-transparent",
        outside: "text-neutral-400",
        range_middle:
          "!rounded-none aria-selected:!bg-blue-100 aria-selected:!text-blue-900",
        range_start: "rounded-r-none !rounded-l",
        range_end: "rounded-l-none !rounded-r",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className="h-4 w-4" />;
        },
        MonthCaption: ({ calendarMonth }) => {
          const displayMonth = calendarMonth.date;
          // For multi-month layouts, determine position
          const isFirst = true; // In v9, each MonthCaption renders for its own month
          const isLast = numberOfMonths === 1;

          const hideNextButton = numberOfMonths > 1 && !isLast;
          const hidePreviousButton = numberOfMonths > 1 && !isFirst;

          return (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                {showYearNavigation && !hidePreviousButton && (
                  <NavigationButton
                    disabled={
                      !canGoBack ||
                      (startMonth &&
                        addYears(month, -1).getTime() <
                          startMonth.getTime())
                    }
                    aria-label="Go to previous year"
                    onClick={goToPreviousYear}
                    icon={ChevronsLeft}
                  />
                )}
                {!hidePreviousButton && (
                  <NavigationButton
                    disabled={!canGoBack}
                    aria-label="Go to previous month"
                    onClick={() =>
                      canGoBack && handleMonthChange(previousMonth)
                    }
                    icon={ChevronLeft}
                  />
                )}
              </div>

              <div
                role="presentation"
                aria-live="polite"
                className="text-sm font-medium capitalize tabular-nums text-neutral-900"
              >
                {format(displayMonth, "LLLL yyy", { locale: locale as any })}
              </div>

              <div className="flex items-center gap-1">
                {!hideNextButton && (
                  <NavigationButton
                    disabled={!canGoForward}
                    aria-label="Go to next month"
                    onClick={() =>
                      canGoForward && handleMonthChange(nextMonth)
                    }
                    icon={ChevronRight}
                  />
                )}
                {showYearNavigation && !hideNextButton && (
                  <NavigationButton
                    disabled={
                      !canGoForward ||
                      (endMonth &&
                        addYears(month, 1).getTime() > endMonth.getTime())
                    }
                    aria-label="Go to next year"
                    onClick={goToNextYear}
                    icon={ChevronsRight}
                  />
                )}
              </div>
            </div>
          );
        },
      }}
      hideNavigation
    />
  );
}

export { Calendar, type CalendarProps, type Matcher };
