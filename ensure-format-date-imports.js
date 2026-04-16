/**
 * deep-fix-imports.js
 * Comprehensive scan: find any file using formatDate/formatDateTime 
 * without the import from '@/lib/format-date', and add it.
 * Uses glob with absolute paths and fs.readFileSync to avoid PowerShell bracket issues.
 */
const { globSync } = require('glob');
const fs = require('fs');
const path = require('path');

const BASE = 'd:/git/inflect-compliance/inflect-compliance';

const files = globSync('src/**/*.{tsx,ts}', {
    cwd: BASE,
    absolute: true,
    ignore: ['**/node_modules/**', '**/.next/**', '**/format-date.ts'],
});

let fixed = 0;
let checked = 0;

for (const file of files) {
    checked++;
    let content;
    try {
        content = fs.readFileSync(file, 'utf-8');
    } catch {
        continue;
    }

    const usesFormatDate = content.includes('formatDate(');
    const usesFormatDateTime = content.includes('formatDateTime(');

    if (!usesFormatDate && !usesFormatDateTime) continue;

    const hasImport =
        content.includes("from '@/lib/format-date'") ||
        content.includes('from "@/lib/format-date"');

    if (hasImport) continue;

    // Missing import — add it
    const fns = [
        usesFormatDate ? 'formatDate' : null,
        usesFormatDateTime ? 'formatDateTime' : null,
    ].filter(Boolean).join(', ');

    const importLine = `import { ${fns} } from '@/lib/format-date';\n`;

    let patched = content;

    // Detect 'use client' variants (with or without semicolon, single or double quotes)
    const useClientMatch = content.match(/^(['"]use client['"];?\n)/);
    if (useClientMatch) {
        // Insert right after 'use client'\n
        patched = content.slice(0, useClientMatch[0].length) +
                  importLine +
                  content.slice(useClientMatch[0].length);
    } else {
        // Insert before first import line
        const firstImportIdx = content.search(/^import\s/m);
        if (firstImportIdx >= 0) {
            patched = content.slice(0, firstImportIdx) +
                      importLine +
                      content.slice(firstImportIdx);
        } else {
            patched = importLine + content;
        }
    }

    try {
        fs.writeFileSync(file, patched, 'utf-8');
        const rel = file.replace(BASE + '/', '').replace(BASE + '\\', '');
        console.log('FIXED:', rel);
        fixed++;
    } catch (err) {
        console.error('ERROR writing', file, err.message);
    }
}

console.log(`\nChecked ${checked} files. Fixed ${fixed} missing imports.`);
