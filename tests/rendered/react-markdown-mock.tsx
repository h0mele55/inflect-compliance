/**
 * Stub for react-markdown under the jsdom Jest project.
 * react-markdown ships as ESM which Jest can't transform; render tests
 * for the form primitives don't exercise markdown content so this
 * minimal pass-through is sufficient.
 */
import * as React from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactMarkdown = ({ children }: { children?: React.ReactNode } & any) => (
    <>{children}</>
);

export default ReactMarkdown;
