/**
 * Guardrail: token CSS integrity.
 *
 * Verifies that every CSS custom property referenced in tailwind.config.js
 * is actually defined in src/styles/tokens.css. Catches typos and missing
 * token definitions that would silently produce transparent/invisible UI.
 */
import * as fs from 'fs';
import * as path from 'path';

const TOKENS_PATH = path.resolve(__dirname, '../../src/styles/tokens.css');
const TAILWIND_PATH = path.resolve(__dirname, '../../tailwind.config.js');

const tokensCss = fs.readFileSync(TOKENS_PATH, 'utf-8');
const tailwindConfig = fs.readFileSync(TAILWIND_PATH, 'utf-8');

function extractDefinedVars(css: string): Set<string> {
    const vars = new Set<string>();
    for (const m of css.matchAll(/--[\w-]+(?=\s*:)/g)) {
        vars.add(m[0]);
    }
    return vars;
}

function extractReferencedVars(config: string): string[] {
    const refs: string[] = [];
    for (const m of config.matchAll(/var\((--[\w-]+)\)/g)) {
        refs.push(m[1]);
    }
    return [...new Set(refs)];
}

const definedVars = extractDefinedVars(tokensCss);
const referencedVars = extractReferencedVars(tailwindConfig);

describe('Token CSS integrity', () => {
    it('tokens.css defines variables', () => {
        expect(definedVars.size).toBeGreaterThan(30);
    });

    it('tailwind.config.js references variables', () => {
        expect(referencedVars.length).toBeGreaterThan(20);
    });

    it.each(referencedVars)(
        'CSS variable %s referenced in tailwind.config.js is defined in tokens.css',
        (varName) => {
            expect(definedVars).toContain(varName);
        },
    );

    it('no orphan status tokens (every status color has bg, content, border)', () => {
        const statusGroups = ['success', 'warning', 'error', 'info', 'attention'];
        for (const s of statusGroups) {
            expect(definedVars).toContain(`--bg-${s}`);
            expect(definedVars).toContain(`--content-${s}`);
            expect(definedVars).toContain(`--border-${s}`);
        }
    });

    it('light theme defines all surface tokens', () => {
        const lightBlock = tokensCss.slice(tokensCss.indexOf('[data-theme="light"]'));
        for (const v of ['--bg-page', '--bg-default', '--bg-muted', '--bg-subtle', '--bg-elevated', '--bg-inverted', '--bg-overlay']) {
            expect(lightBlock).toContain(v);
        }
    });

    it('light theme defines all content tokens', () => {
        const lightBlock = tokensCss.slice(tokensCss.indexOf('[data-theme="light"]'));
        for (const v of ['--content-emphasis', '--content-default', '--content-muted', '--content-subtle', '--content-inverted']) {
            expect(lightBlock).toContain(v);
        }
    });

    it('light theme defines all border tokens', () => {
        const lightBlock = tokensCss.slice(tokensCss.indexOf('[data-theme="light"]'));
        for (const v of ['--border-default', '--border-subtle', '--border-emphasis']) {
            expect(lightBlock).toContain(v);
        }
    });
});
