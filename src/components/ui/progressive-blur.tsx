/**
 * Epic 64 — `<ProgressiveBlur>`.
 *
 * Edge fade/blur affordance for scrollable surfaces (sheets, modal
 * bodies, chart legends, dense tables). Stacks four backdrop-filter
 * layers under linear-gradient masks so the blur strength tapers off
 * smoothly toward the centre.
 *
 *   <div className="relative overflow-y-auto h-64">
 *     <Content />
 *     <ProgressiveBlur side="top" />
 *     <ProgressiveBlur side="bottom" />
 *   </div>
 *
 *   // Convenience: top + bottom in one call
 *   <ProgressiveBlur side="both" />
 *
 * Token integration: the blur itself is a `backdrop-filter` so it
 * has no fill colour to themeable. The component is theme-neutral
 * by construction — it picks up whatever sits behind the scroll
 * container and softens it. Ported from the Dub UI pattern (which
 * itself follows AndrewPrifer/progressive-blur) with the same
 * tapered-mask choreography.
 *
 * Composition rule: place inside a `position: relative` container
 * that has `overflow: auto/scroll/hidden`. The component pins to
 * the container's edge via `absolute inset-0`; pointer-events are
 * disabled so clicks pass through to the underlying scroller.
 */
import { cn } from '@dub/utils';
import * as React from 'react';

type SingleSide = 'top' | 'right' | 'bottom' | 'left';
export type ProgressiveBlurSide = SingleSide | 'both';

const oppositeSide: Record<SingleSide, SingleSide> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
};

export interface ProgressiveBlurProps
    extends React.HTMLAttributes<HTMLDivElement> {
    /** Which edge of the container should carry the strongest blur. Defaults to `top`. */
    side?: ProgressiveBlurSide;
    /** Strongest blur strength in px. Defaults to 32. */
    strength?: number;
    /** Number of blur layers — more layers = smoother taper, more cost. Defaults to 4. */
    steps?: number;
    /** Pixel height (or width, for left/right) of the blurred band. Defaults to `5rem`. */
    size?: string;
}

/**
 * Convenience wrapper — `side="both"` mounts a top + bottom pair so
 * a vertically-scrolling container can be wrapped with one tag.
 */
export function ProgressiveBlur({
    side = 'top',
    strength = 32,
    steps = 4,
    size,
    className,
    style,
    ...rest
}: ProgressiveBlurProps) {
    if (side === 'both') {
        return (
            <>
                <ProgressiveBlur
                    side="top"
                    strength={strength}
                    steps={steps}
                    size={size}
                    className={className}
                    style={style}
                    {...rest}
                />
                <ProgressiveBlur
                    side="bottom"
                    strength={strength}
                    steps={steps}
                    size={size}
                    className={className}
                    style={style}
                    {...rest}
                />
            </>
        );
    }

    return (
        <SingleProgressiveBlur
            side={side}
            strength={strength}
            steps={steps}
            size={size}
            className={className}
            style={style}
            {...rest}
        />
    );
}

interface SingleProgressiveBlurProps
    extends React.HTMLAttributes<HTMLDivElement> {
    side: SingleSide;
    strength: number;
    steps: number;
    size?: string;
}

function SingleProgressiveBlur({
    side,
    strength,
    steps,
    size,
    className,
    style,
    ...rest
}: SingleProgressiveBlurProps) {
    const step = 100 / steps;
    const factor = 0.5;
    // Geometric ramp: step i gets half the blur of step i+1, tuned
    // to match the Dub source so the visual taper is identical.
    const base = Math.pow(strength / factor, 1 / Math.max(1, steps - 1));
    const blurAt = (i: number): string =>
        `blur(${factor * base ** (steps - i - 1)}px)`;

    // Horizontal sides (left/right) constrain WIDTH; vertical
    // sides (top/bottom) constrain HEIGHT. Keep `inset-0` for the
    // perpendicular axis so the band spans the full container edge.
    const isHorizontal = side === 'left' || side === 'right';
    const sizeStyle: React.CSSProperties = isHorizontal
        ? { width: size ?? '5rem' }
        : { height: size ?? '5rem' };
    const positionClass = {
        top: 'top-0 left-0 right-0',
        bottom: 'bottom-0 left-0 right-0',
        left: 'top-0 bottom-0 left-0',
        right: 'top-0 bottom-0 right-0',
    }[side];

    const black = 'rgba(0, 0, 0, 1)';
    const transparent = 'rgba(0, 0, 0, 0)';
    const opp = oppositeSide[side];

    return (
        <div
            data-progressive-blur={side}
            className={cn('pointer-events-none absolute', positionClass, className)}
            style={{ ...sizeStyle, ...style }}
            {...rest}
        >
            <div className="relative size-full">
                {/* Layer 0 — strongest blur, narrowest mask. */}
                <div
                    className="absolute inset-0"
                    style={{
                        zIndex: 1,
                        WebkitMask: `linear-gradient(to ${opp}, ${black} 0%, ${transparent} ${step}%)`,
                        mask: `linear-gradient(to ${opp}, ${black} 0%, ${transparent} ${step}%)`,
                        backdropFilter: blurAt(0),
                        WebkitBackdropFilter: blurAt(0),
                    }}
                />

                {steps > 1 && (
                    <div
                        className="absolute inset-0"
                        style={{
                            zIndex: 2,
                            WebkitMask: `linear-gradient(to ${opp}, ${black} 0%, ${black} ${step}%, ${transparent} ${step * 2}%)`,
                            mask: `linear-gradient(to ${opp}, ${black} 0%, ${black} ${step}%, ${transparent} ${step * 2}%)`,
                            backdropFilter: blurAt(1),
                            WebkitBackdropFilter: blurAt(1),
                        }}
                    />
                )}

                {steps > 2 &&
                    Array.from({ length: steps - 2 }, (_, idx) => {
                        const filter = blurAt(idx + 2);
                        return (
                            <div
                                key={idx}
                                className="absolute inset-0"
                                style={{
                                    zIndex: idx + 3,
                                    WebkitMask: `linear-gradient(to ${opp}, ${transparent} ${idx * step}%, ${black} ${(idx + 1) * step}%, ${black} ${(idx + 2) * step}%, ${transparent} ${(idx + 3) * step}%)`,
                                    mask: `linear-gradient(to ${opp}, ${transparent} ${idx * step}%, ${black} ${(idx + 1) * step}%, ${black} ${(idx + 2) * step}%, ${transparent} ${(idx + 3) * step}%)`,
                                    backdropFilter: filter,
                                    WebkitBackdropFilter: filter,
                                }}
                            />
                        );
                    })}
            </div>
        </div>
    );
}

export default ProgressiveBlur;
