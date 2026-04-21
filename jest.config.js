/**
 * Jest configuration — multi-project split.
 *
 *   `node` project: the existing 10,031-test suite (unit / integration /
 *     guards / ratchets) — runs under node, no DOM. Keeps the fast
 *     source-contract + backend tests isolated from the heavier jsdom
 *     boot.
 *
 *   `jsdom` project (Epic 55 hardening pass): real React render tests
 *     for the shared UI primitives. Scoped to `tests/rendered/**` so the
 *     existing suite continues to run under node with no behavioural
 *     change. Adds `@testing-library/react` + `@testing-library/jest-dom`
 *     + `jest-axe` for accessibility checks.
 *
 * Coverage settings live on the node project since the jsdom project
 * covers only the UI layer which has its own contract.
 */

/** @type {import('jest').Config} */
const nodeProject = {
    displayName: 'node',
    preset: 'ts-jest',
    testEnvironment: 'node',
    setupFiles: ['<rootDir>/jest.setup.js'],
    globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
    globalTeardown: '<rootDir>/tests/setup/teardown.ts',
    moduleNameMapper: {
        '^@/env$': '<rootDir>/tests/mocks/env.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    testMatch: ['**/*.test.ts', '**/*.test.js'],
    testPathIgnorePatterns: [
        '<rootDir>/.next/',
        '<rootDir>/node_modules/',
        '<rootDir>/tests/e2e/',
        '<rootDir>/tests/rendered/',
        '<rootDir>/dub-reference/',
    ],
};

/** @type {import('jest').Config} */
const jsdomProject = {
    displayName: 'jsdom',
    preset: 'ts-jest',
    testEnvironment: 'jsdom',
    setupFiles: ['<rootDir>/jest.setup.js'],
    setupFilesAfterEnv: ['<rootDir>/tests/rendered/setup.ts'],
    moduleNameMapper: {
        '^@/env$': '<rootDir>/tests/mocks/env.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@dub/utils$': '<rootDir>/tests/rendered/dub-utils-mock.ts',
        // Pass-through stub for render tests that transitively touch the
        // Tooltip primitive through Button / Switch / StatusBadge (all of
        // which import it via `./tooltip`). Radix Tooltip requires a
        // TooltipProvider in the tree and emits portalised content — the
        // stub keeps those tests decoupled from that lifecycle. The
        // dedicated tooltip test at `tests/rendered/tooltip.test.tsx`
        // imports via `@/components/ui/tooltip` which is resolved by the
        // generic `@/` mapper above and bypasses this stub.
        '^\\.\\./tooltip$': '<rootDir>/tests/rendered/tooltip-mock.tsx',
        '^\\./tooltip$': '<rootDir>/tests/rendered/tooltip-mock.tsx',
        // Same problem with react-markdown directly.
        '^react-markdown$': '<rootDir>/tests/rendered/react-markdown-mock.tsx',
        // CSS and static asset stubs for jsdom.
        '\\.(css|less|scss|sass)$': '<rootDir>/tests/rendered/style-mock.ts',
    },
    testMatch: ['<rootDir>/tests/rendered/**/*.test.{ts,tsx}'],
    testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/'],
    transform: {
        '^.+\\.(ts|tsx)$': [
            'ts-jest',
            { tsconfig: '<rootDir>/tests/rendered/tsconfig.json' },
        ],
        // Allow Jest to transpile transitively-imported ESM in
        // node_modules (react-markdown, @tiptap/*, etc.) so the shared
        // Tooltip / RichTextArea imports resolve under jsdom.
        '^.+\\.m?js$': [
            'ts-jest',
            { tsconfig: '<rootDir>/tests/rendered/tsconfig.json' },
        ],
    },
    transformIgnorePatterns: [
        // Explicitly allow ESM packages in the shared primitive graph
        // to be transformed. Everything else stays native-require.
        'node_modules/(?!(' +
            'react-markdown|' +
            'vfile|vfile-message|' +
            'unist-util-[^/]+|' +
            'mdast-util-[^/]+|' +
            'micromark[^/]*|' +
            'decode-named-character-reference|' +
            'character-entities[^/]*|' +
            'property-information|' +
            'hast-util-[^/]+|' +
            'space-separated-tokens|' +
            'comma-separated-tokens|' +
            'bail|is-plain-obj|trough|unified|' +
            'remark-[^/]+|rehype-[^/]+|' +
            '@tiptap/[^/]+|' +
            'prosemirror-[^/]+|' +
            'linkify-it|markdown-it|orderedmap|' +
            'w3c-keyname|' +
            // Epic 59 — chart platform. visx re-exports d3 modules
            // that ship as ESM; ts-jest must transform them so any
            // jsdom test importing `@/components/ui/charts` resolves
            // its full graph.
            '@visx/[^/]+|' +
            'd3-[^/]+|' +
            'internmap|delaunator|robust-predicates' +
            ')/)',
    ],
};

module.exports = {
    projects: [nodeProject, jsdomProject],
    forceExit: true,
    // Coverage settings apply across the projects; the node suite carries
    // the backend layer, the jsdom suite carries the UI primitives.
    collectCoverageFrom: [
        'src/app-layer/**/*.ts',
        'src/lib/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/types.ts',
    ],
    coveragePathIgnorePatterns: ['/node_modules/', '/.next/', '/tests/'],
    coverageThreshold: {
        global: {
            branches: 60,
            functions: 60,
            lines: 60,
            statements: 60,
        },
        './src/app-layer/usecases/': {
            branches: 55,
            functions: 60,
            lines: 60,
            statements: 60,
        },
        './src/lib/': {
            branches: 55,
            functions: 60,
            lines: 60,
            statements: 60,
        },
    },
    coverageReporters: ['text-summary', 'lcov'],
};
