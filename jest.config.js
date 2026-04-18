module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    forceExit: true,
    setupFiles: ['<rootDir>/jest.setup.js'],
    globalSetup: '<rootDir>/tests/setup/globalSetup.ts',
    globalTeardown: '<rootDir>/tests/setup/teardown.ts',
    moduleNameMapper: {
        '^@/env$': '<rootDir>/tests/mocks/env.ts',
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    testMatch: ['**/*.test.ts', '**/*.test.js'],
    testPathIgnorePatterns: ['<rootDir>/.next/', '<rootDir>/node_modules/', '<rootDir>/tests/e2e/'],

    // ── Coverage ──
    collectCoverageFrom: [
        'src/app-layer/**/*.ts',
        'src/lib/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/types.ts',
    ],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/.next/',
        '/tests/',
    ],
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
