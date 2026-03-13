module.exports = {
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
    coverageThresholds: {
        global: {
            branches: 25,
            functions: 30,
            lines: 30,
            statements: 30,
        },
        './src/app-layer/usecases/': {
            branches: 20,
            functions: 40,
            lines: 40,
            statements: 40,
        },
        './src/lib/': {
            branches: 20,
            functions: 35,
            lines: 35,
            statements: 35,
        },
    },
    coverageReporters: ['text-summary', 'lcov'],
};
