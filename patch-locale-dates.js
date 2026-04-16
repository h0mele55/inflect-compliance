/**
 * patch-locale-dates.js
 * Run from: d:\git\inflect-compliance\inflect-compliance
 * Usage:    node patch-locale-dates.js
 */
const { globSync } = require('glob');
const fs = require('fs');
const path = require('path');

const BASE = process.cwd();

const files = globSync('src/**/*.{tsx,ts}', {
    cwd: BASE,
    absolute: true,
    ignore: ['**/node_modules/**', '**/.next/**', '**/format-date.ts'],
});

let count = 0;

for (const file of files) {
    let content = fs.readFileSync(file, 'utf-8');
    const original = content;

    // 1. new Date(x).toLocaleString() -> formatDateTime(x)
    content = content.replace(
        /new Date\(([^)]+)\)\.toLocaleString\(\)/g,
        'formatDateTime($1)',
    );

    // 2. new Date(x).toLocaleDateString() -> formatDate(x)  [no args]
    content = content.replace(
        /new Date\(([^)]+)\)\.toLocaleDateString\(\)/g,
        'formatDate($1)',
    );

    // 3. new Date(x).toLocaleDateString(undefined, {...}) -> formatDate(x)
    content = content.replace(
        /new Date\(([^)]+)\)\.toLocaleDateString\(undefined,\s*\{[^}]+\}\)/g,
        'formatDate($1)',
    );

    if (content === original) continue;

    // Determine which functions are needed
    const needsDateTime = content.includes('formatDateTime(');
    const needsDate = content.includes('formatDate(');

    // Do not re-add import if already present
    const hasImport =
        content.includes("from '@/lib/format-date'") ||
        content.includes('from "@/lib/format-date"');

    if (!hasImport) {
        const fns = [
            needsDate ? 'formatDate' : null,
            needsDateTime ? 'formatDateTime' : null,
        ]
            .filter(Boolean)
            .join(', ');

        const importLine = `import { ${fns} } from '@/lib/format-date';\n`;

        if (content.startsWith("'use client'") || content.startsWith('"use client"')) {
            // Insert right after the 'use client' directive + newline
            content = content.replace(
                /^(['"]use client['"]\n)/,
                `$1${importLine}`,
            );
        } else {
            // Insert before the first import statement
            content = content.replace(/^(import\s)/m, `${importLine}$1`);
        }
    }

    fs.writeFileSync(file, content, 'utf-8');
    console.log('PATCHED:', path.relative(BASE, file));
    count++;
}

console.log(`\nDone. ${count} files patched.`);
