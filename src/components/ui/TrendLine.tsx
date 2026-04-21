/**
 * TrendLine — Lightweight SVG sparkline for trend visualization.
 *
 * Zero dependencies. Renders a polyline with optional area fill
 * and gradient. Suitable for embedding in cards as a compact
 * time-series indicator.
 *
 * @example
 * ```tsx
 * <TrendLine
 *     data={[65, 68, 72, 70, 75, 78, 75.3]}
 *     label="Coverage trend"
 *     color="#22c55e"
 *     height={80}
 * />
 * ```
 */

// ─── Props ──────────────────────────────────────────────────────────

export interface TrendLineProps {
    /** Array of numeric values, ordered oldest to newest */
    data: number[];
    /** Accessible label for the chart */
    label?: string;
    /** Stroke color (hex/rgb) */
    color?: string;
    /** Chart width in px (default: 100%, stretches to container) */
    width?: number | string;
    /** Chart height in px (default: 64) */
    height?: number;
    /** Show area fill below the line */
    showArea?: boolean;
    /** Show the last value as a dot */
    showEndDot?: boolean;
    /** Stroke width (default: 2) */
    strokeWidth?: number;
    /** Optional CSS class */
    className?: string;
    /** Optional test-id */
    id?: string;
}

// ─── Component ──────────────────────────────────────────────────────

export default function TrendLine({
    data,
    label = 'Trend line',
    color = '#6366f1',
    width = '100%',
    height = 64,
    showArea = true,
    showEndDot = true,
    strokeWidth = 2,
    className = '',
    id,
}: TrendLineProps) {
    // Empty / insufficient data
    if (!data || data.length < 2) {
        return (
            <div
                id={id}
                className={`flex items-center justify-center text-xs text-content-subtle ${className}`}
                style={{ width, height }}
            >
                {data?.length === 1 ? `${data[0]}` : 'No trend data'}
            </div>
        );
    }

    // Compute SVG path
    const svgWidth = typeof width === 'number' ? width : 300; // viewBox width for responsive
    const padding = 4;
    const chartW = svgWidth - padding * 2;
    const chartH = height - padding * 2;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1; // Avoid division by zero for flat lines

    const points = data.map((val, i) => {
        const x = padding + (i / (data.length - 1)) * chartW;
        const y = padding + chartH - ((val - min) / range) * chartH;
        return { x, y };
    });

    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(' ');

    // Area polygon: line points + bottom-right + bottom-left
    const areaPoints = [
        ...points.map(p => `${p.x},${p.y}`),
        `${points[points.length - 1].x},${height - padding}`,
        `${points[0].x},${height - padding}`,
    ].join(' ');

    const gradientId = `trend-gradient-${id || Math.random().toString(36).slice(2, 8)}`;
    const lastPoint = points[points.length - 1];

    return (
        <div id={id} className={className} style={{ width }}>
            <svg
                width="100%"
                height={height}
                viewBox={`0 0 ${svgWidth} ${height}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={label}
            >
                {/* Gradient definition for area fill */}
                {showArea && (
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                )}

                {/* Area fill */}
                {showArea && (
                    <polygon
                        points={areaPoints}
                        fill={`url(#${gradientId})`}
                        className="transition-all duration-500"
                    />
                )}

                {/* Main line */}
                <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="transition-all duration-500"
                />

                {/* End dot */}
                {showEndDot && (
                    <circle
                        cx={lastPoint.x}
                        cy={lastPoint.y}
                        r={3}
                        fill={color}
                        stroke="#0f172a"
                        strokeWidth={1.5}
                    >
                        <title>{`Latest: ${data[data.length - 1]}`}</title>
                    </circle>
                )}
            </svg>
        </div>
    );
}
