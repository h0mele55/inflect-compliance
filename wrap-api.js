const fs = require('fs');
const path = require('path');

function walk(dir, filelist = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            walk(filepath, filelist);
        } else if (filepath.endsWith('route.ts')) {
            filelist.push(filepath);
        }
    }
    return filelist;
}

const apiDir = path.join(__dirname, 'src/app/api');
const routes = walk(apiDir);

let updatedFiles = 0;

for (const file of routes) {
    if (file.includes('[...nextauth]')) continue; // Skip NextAuth catch-all

    let content = fs.readFileSync(file, 'utf8');
    let originalConfig = content;

    // Check if already modified
    if (!content.includes('withApiErrorHandling')) {
        // Add import
        const importStatement = `import { withApiErrorHandling } from '@/lib/errors/api';\n`;
        // Insert after the last import
        const lastImportIndex = content.lastIndexOf('import ');
        if (lastImportIndex !== -1) {
            const endOfLastImport = content.indexOf('\n', lastImportIndex) + 1;
            content = content.slice(0, endOfLastImport) + importStatement + content.slice(endOfLastImport);
        } else {
            content = importStatement + content;
        }
    }

    let dirty = false;

    // Wrap `export async function METHOD(...) { ... }`
    const functionRegex = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(([^)]*)\)\s*\{/g;
    let match;
    let replacements = [];

    // We can't easily replace the closing `}` with `});` via standard Regex easily in multi-line code without counting braces.
    // However, if we change them individually with brace counting:
    const functionMatches = [...content.matchAll(functionRegex)];
    for (const m of functionMatches) {
        const method = m[1];
        const args = m[2];
        const startIdx = m.index;
        const braceIdx = startIdx + m[0].length - 1; // Index of `{`

        let braceCount = 1;
        let endIdx = braceIdx + 1;
        while (braceCount > 0 && endIdx < content.length) {
            if (content[endIdx] === '{') braceCount++;
            if (content[endIdx] === '}') braceCount--;
            endIdx++;
        }

        // endIdx-1 is the closing `}`
        const before = content.slice(startIdx, endIdx);
        // Replace definition
        const inner = before.substring(m[0].length, before.length - 1); // code inside braces

        const newCode = `export const ${method} = withApiErrorHandling(async (${args}) => {${inner}});`;
        replacements.push({ before, after: newCode });
    }

    // Apply block replacements
    for (const rep of replacements) {
        content = content.replace(rep.before, rep.after);
        dirty = true;
    }

    // Wrap `export const METHOD = withValidatedBody(...)` or similar HoFs
    const constRegex = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*(withValidated[a-zA-Z]*)\(/g;
    const constMatches = [...content.matchAll(constRegex)];
    for (const m of constMatches) {
        const method = m[1];
        const wrapper = m[2]; // e.g. withValidatedBody
        const startIdx = m.index;
        const braceIdx = startIdx + m[0].length - 1; // Index of `(` from withValidatedBody

        let braceCount = 1;
        let endIdx = braceIdx + 1;
        while (braceCount > 0 && endIdx < content.length) {
            if (content[endIdx] === '(') braceCount++;
            if (content[endIdx] === ')') braceCount--;
            endIdx++;
        }

        // endIdx is right after closing `)`
        const before = content.slice(startIdx, endIdx + (content[endIdx] === ';' ? 1 : 0));

        // Remove `export const METHOD =`
        const rightSide = before.replace(new RegExp(`export\\s+const\\s+${method}\\s*=\\s*`), '');
        const rightSideNoSemi = rightSide.endsWith(';') ? rightSide.slice(0, -1) : rightSide;

        const newCode = `export const ${method} = withApiErrorHandling(${rightSideNoSemi});`;
        content = content.replace(before, newCode);
        dirty = true;
    }

    if (dirty) {
        // Also clean up manual manual catch (error) blocks that return NextResponse
        // E.g., catch (error) { return NextResponse.json(...) }
        // For safety, let's keep them and let them throw or return, but wait:
        // if we just remove the manual `try {` and its `catch () { return ... }` it's cleaner,
        // but AST transformation is safer. Let's let the script just do the outer wrapping.
        // The outer wrapper catches all throws. If they manually catch but return a generic 500, it's fine,
        // but maybe we can replace generic returns.

        fs.writeFileSync(file, content, 'utf8');
        updatedFiles++;
        console.log(`Wrapped: ${file}`);
    }
}

console.log(`\nTotal files wrapped: ${updatedFiles}`);
