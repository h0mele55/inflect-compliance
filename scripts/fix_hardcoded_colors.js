#!/usr/bin/env node
/**
 * Epic 51 — Codemod: replace hard-coded Tailwind color classes with semantic tokens.
 *
 * Maps the dark-theme-specific slate/white/black utility classes to
 * semantic token classes defined in tailwind.config.js + tokens.css.
 *
 * Safe mapping rules (preserves visual parity in dark mode):
 *   text-white      → text-content-emphasis
 *   text-slate-100  → text-content-emphasis
 *   text-slate-200  → text-content-emphasis
 *   text-slate-300  → text-content-default
 *   text-slate-400  → text-content-muted
 *   text-slate-500  → text-content-subtle
 *   text-slate-600  → text-content-subtle
 *   bg-slate-900    → bg-bg-page
 *   bg-slate-800    → bg-bg-default
 *   bg-slate-700    → bg-bg-elevated
 *   border-slate-700 → border-border-default
 *   border-slate-800 → border-border-subtle
 *   border-slate-600 → border-border-emphasis
 *   hover:bg-slate-700 → hover:bg-bg-muted
 *   hover:bg-slate-800 → hover:bg-bg-muted
 *
 * Exclusions:
 *   - Lines that are comments or imports
 *   - SVG fill/stroke color literals (hex in style attrs)
 *   - Data-viz segments (DonutChart, color: '...')
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');

const TARGET_DIR = path.resolve(__dirname, '../src/app/t');

// ── Mapping table ────────────────────────────────────────────────────
const REPLACEMENTS = [
    // Text: bright → emphasis
    [/\btext-white\b/g, 'text-content-emphasis'],
    [/\btext-slate-100\b/g, 'text-content-emphasis'],
    [/\btext-slate-200\b/g, 'text-content-emphasis'],
    // Text: default body
    [/\btext-slate-300\b/g, 'text-content-default'],
    // Text: muted secondary
    [/\btext-slate-400\b/g, 'text-content-muted'],
    // Text: subtle / disabled
    [/\btext-slate-500\b/g, 'text-content-subtle'],
    [/\btext-slate-600\b/g, 'text-content-subtle'],
    // Backgrounds
    [/\bbg-slate-900\b/g, 'bg-bg-page'],
    [/\bbg-slate-800\b/g, 'bg-bg-default'],
    [/\bbg-slate-700\b/g, 'bg-bg-elevated'],
    // Borders
    [/\bborder-slate-700\b/g, 'border-border-default'],
    [/\bborder-slate-800\b/g, 'border-border-subtle'],
    [/\bborder-slate-600\b/g, 'border-border-emphasis'],
    // Hover states
    [/\bhover:bg-slate-700\b/g, 'hover:bg-bg-muted'],
    [/\bhover:bg-slate-800\b/g, 'hover:bg-bg-muted'],
    [/\bhover:bg-slate-600\b/g, 'hover:bg-bg-muted'],
    // Divide
    [/\bdivide-slate-700\b/g, 'divide-border-default'],
    [/\bdivide-slate-800\b/g, 'divide-border-subtle'],
    // Ring
    [/\bring-slate-700\b/g, 'ring-border-default'],
    [/\bring-slate-600\b/g, 'ring-border-emphasis'],
    // Focus ring
    [/\bfocus:ring-slate-600\b/g, 'focus:ring-border-emphasis'],
    [/\bfocus:ring-slate-500\b/g, 'focus:ring-brand-default'],
    // Placeholder
    [/\bplaceholder-slate-500\b/g, 'placeholder-content-subtle'],
    [/\bplaceholder-slate-400\b/g, 'placeholder-content-muted'],
];

// ── Runner ───────────────────────────────────────────────────────────
function shouldSkipLine(line) {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('import ')) return true;
    // SVG/chart color literals — e.g. color: '#334155' or stroke="#64748b"
    if (/color:\s*['"]#/.test(line)) return true;
    if (/stroke=["']#/.test(line)) return true;
    if (/fill=["']#/.test(line)) return true;
    return false;
}

function processFile(filePath) {
    const original = fs.readFileSync(filePath, 'utf8');
    const lines = original.split('\n');
    let changed = false;

    const result = lines.map(line => {
        if (shouldSkipLine(line)) return line;

        let updated = line;
        for (const [pattern, replacement] of REPLACEMENTS) {
            updated = updated.replace(pattern, replacement);
        }
        if (updated !== line) changed = true;
        return updated;
    });

    if (changed) {
        fs.writeFileSync(filePath, result.join('\n'), 'utf8');
    }
    return changed;
}

// ── Main ─────────────────────────────────────────────────────────────
const files = glob.sync(path.join(TARGET_DIR, '**/*.tsx'));
let changedCount = 0;
let totalReplacements = 0;

for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    if (processFile(file)) {
        changedCount++;
        const after = fs.readFileSync(file, 'utf8');
        // Count actual replacements
        const beforeMatches = (before.match(/\b(?:text|bg|border|hover:bg|divide|ring|focus:ring|placeholder)-slate-\d+\b|\btext-white\b/g) || []).length;
        const afterMatches = (after.match(/\b(?:text|bg|border|hover:bg|divide|ring|focus:ring|placeholder)-slate-\d+\b|\btext-white\b/g) || []).length;
        totalReplacements += (beforeMatches - afterMatches);
    }
}

console.log(`✅ Token migration complete`);
console.log(`   Files modified: ${changedCount}/${files.length}`);
console.log(`   Replacements:   ~${totalReplacements}`);
console.log(`\nRemaining raw colors:`);

// Report remaining
const remaining = {};
for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/\b(?:text|bg|border|hover:bg)-(?:slate|gray|white)-?\d*\b/g);
    if (matches) {
        for (const m of matches) {
            remaining[m] = (remaining[m] || 0) + 1;
        }
    }
}
const sorted = Object.entries(remaining).sort((a, b) => b[1] - a[1]);
for (const [cls, count] of sorted) {
    console.log(`   ${cls}: ${count}`);
}
