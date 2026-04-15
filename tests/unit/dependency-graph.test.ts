/**
 * Tests for Dependency Graph — Topological Sort & Cycle Detection.
 *
 * Covers:
 * - Topological sort produces correct dependency-first order
 * - Cycle detection with clear error messages
 * - Missing dependencies are tracked but don't crash
 * - Deterministic ordering (lexicographic tiebreaker)
 * - Edge cases (empty set, single node, no dependencies)
 */
import {
    topologicalSort,
    resolveDependencies,
    sortLibrariesByDependency,
    DependencyCycleError,
    type DependencyNode,
} from '@/app-layer/libraries/dependency-graph';

// ─── Test Fixtures ───────────────────────────────────────────────────

const LIB_A: DependencyNode = {
    urn: 'urn:inflect:library:a',
    name: 'Library A',
    dependencies: [],
};

const LIB_B: DependencyNode = {
    urn: 'urn:inflect:library:b',
    name: 'Library B',
    dependencies: ['urn:inflect:library:a'], // B depends on A
};

const LIB_C: DependencyNode = {
    urn: 'urn:inflect:library:c',
    name: 'Library C',
    dependencies: ['urn:inflect:library:b'], // C depends on B (which depends on A)
};

const LIB_D: DependencyNode = {
    urn: 'urn:inflect:library:d',
    name: 'Library D',
    dependencies: ['urn:inflect:library:a', 'urn:inflect:library:c'], // D depends on A and C
};

// ─── Topological Sort Tests ──────────────────────────────────────────

describe('topologicalSort', () => {
    it('should return empty array for empty input', () => {
        expect(topologicalSort([])).toEqual([]);
    });

    it('should return single node for single input', () => {
        const result = topologicalSort([LIB_A]);
        expect(result).toEqual(['urn:inflect:library:a']);
    });

    it('should sort independent nodes lexicographically', () => {
        const nodes: DependencyNode[] = [
            { urn: 'urn:inflect:library:z', name: 'Z', dependencies: [] },
            { urn: 'urn:inflect:library:a', name: 'A', dependencies: [] },
            { urn: 'urn:inflect:library:m', name: 'M', dependencies: [] },
        ];
        const result = topologicalSort(nodes);
        expect(result).toEqual([
            'urn:inflect:library:a',
            'urn:inflect:library:m',
            'urn:inflect:library:z',
        ]);
    });

    it('should place dependencies before dependents (A → B)', () => {
        const result = topologicalSort([LIB_B, LIB_A]);
        const indexA = result.indexOf('urn:inflect:library:a');
        const indexB = result.indexOf('urn:inflect:library:b');
        expect(indexA).toBeLessThan(indexB);
    });

    it('should handle transitive dependencies (A → B → C)', () => {
        const result = topologicalSort([LIB_C, LIB_A, LIB_B]);
        const indexA = result.indexOf('urn:inflect:library:a');
        const indexB = result.indexOf('urn:inflect:library:b');
        const indexC = result.indexOf('urn:inflect:library:c');
        expect(indexA).toBeLessThan(indexB);
        expect(indexB).toBeLessThan(indexC);
    });

    it('should handle diamond dependencies (A → B → D, A → C → D)', () => {
        const result = topologicalSort([LIB_D, LIB_C, LIB_B, LIB_A]);
        const indexA = result.indexOf('urn:inflect:library:a');
        const indexB = result.indexOf('urn:inflect:library:b');
        const indexC = result.indexOf('urn:inflect:library:c');
        const indexD = result.indexOf('urn:inflect:library:d');

        // A must come before B and C
        expect(indexA).toBeLessThan(indexB);
        expect(indexA).toBeLessThan(indexC);
        // B must come before C (because C depends on B)
        expect(indexB).toBeLessThan(indexC);
        // D must come last
        expect(indexC).toBeLessThan(indexD);
    });

    it('should produce deterministic output regardless of input order', () => {
        const order1 = topologicalSort([LIB_A, LIB_B, LIB_C, LIB_D]);
        const order2 = topologicalSort([LIB_D, LIB_C, LIB_B, LIB_A]);
        const order3 = topologicalSort([LIB_B, LIB_D, LIB_A, LIB_C]);

        expect(order1).toEqual(order2);
        expect(order2).toEqual(order3);
    });

    it('should throw DependencyCycleError for direct cycle (A ↔ B)', () => {
        const cycleA: DependencyNode = {
            urn: 'urn:inflect:library:cycle-a',
            name: 'Cycle A',
            dependencies: ['urn:inflect:library:cycle-b'],
        };
        const cycleB: DependencyNode = {
            urn: 'urn:inflect:library:cycle-b',
            name: 'Cycle B',
            dependencies: ['urn:inflect:library:cycle-a'],
        };

        expect(() => topologicalSort([cycleA, cycleB])).toThrow(DependencyCycleError);
    });

    it('should throw DependencyCycleError for transitive cycle (A → B → C → A)', () => {
        const nodes: DependencyNode[] = [
            { urn: 'urn:a', name: 'A', dependencies: ['urn:b'] },
            { urn: 'urn:b', name: 'B', dependencies: ['urn:c'] },
            { urn: 'urn:c', name: 'C', dependencies: ['urn:a'] },
        ];

        expect(() => topologicalSort(nodes)).toThrow(DependencyCycleError);
    });

    it('should include cycle path in error message', () => {
        const cycleA: DependencyNode = {
            urn: 'urn:x',
            name: 'X',
            dependencies: ['urn:y'],
        };
        const cycleB: DependencyNode = {
            urn: 'urn:y',
            name: 'Y',
            dependencies: ['urn:x'],
        };

        try {
            topologicalSort([cycleA, cycleB]);
            fail('Should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(DependencyCycleError);
            expect((err as DependencyCycleError).message).toContain('Dependency cycle detected');
            expect((err as DependencyCycleError).cycle.length).toBeGreaterThanOrEqual(2);
        }
    });

    it('should ignore dependencies not present in the input set', () => {
        const nodeWithExternalDep: DependencyNode = {
            urn: 'urn:inflect:library:local',
            name: 'Local',
            dependencies: ['urn:inflect:library:external-not-present'],
        };
        // Should not throw — missing deps are just ignored during sort
        const result = topologicalSort([nodeWithExternalDep]);
        expect(result).toEqual(['urn:inflect:library:local']);
    });

    it('should handle self-dependency gracefully', () => {
        const selfDep: DependencyNode = {
            urn: 'urn:self',
            name: 'Self',
            dependencies: ['urn:self'],
        };
        // Self-dependency is a cycle of length 1
        expect(() => topologicalSort([selfDep])).toThrow(DependencyCycleError);
    });
});

// ─── Dependency Resolution Tests ─────────────────────────────────────

describe('resolveDependencies', () => {
    it('should report fullyResolved=true when all deps are present', () => {
        const result = resolveDependencies([LIB_A, LIB_B, LIB_C]);
        expect(result.fullyResolved).toBe(true);
        expect(result.missingDependencies.size).toBe(0);
    });

    it('should report missing dependencies', () => {
        const result = resolveDependencies([LIB_B]); // B depends on A, but A is missing
        expect(result.fullyResolved).toBe(false);
        expect(result.missingDependencies.get('urn:inflect:library:b')).toEqual(
            ['urn:inflect:library:a']
        );
    });

    it('should report multiple missing dependencies per node', () => {
        const multi: DependencyNode = {
            urn: 'urn:multi',
            name: 'Multi',
            dependencies: ['urn:miss-1', 'urn:miss-2'],
        };
        const result = resolveDependencies([multi]);
        expect(result.missingDependencies.get('urn:multi')).toEqual(
            expect.arrayContaining(['urn:miss-1', 'urn:miss-2'])
        );
    });

    it('should still produce valid order even with missing deps', () => {
        const result = resolveDependencies([LIB_B]); // Missing A
        expect(result.order).toEqual(['urn:inflect:library:b']);
    });

    it('should handle empty input', () => {
        const result = resolveDependencies([]);
        expect(result.order).toEqual([]);
        expect(result.fullyResolved).toBe(true);
    });
});

// ─── sortLibrariesByDependency Tests ─────────────────────────────────

describe('sortLibrariesByDependency', () => {
    it('should return libraries in dependency order', () => {
        const { sorted, resolution } = sortLibrariesByDependency([LIB_D, LIB_C, LIB_B, LIB_A]);

        expect(sorted.map(l => l.urn)).toEqual(resolution.order);
        expect(sorted[0].urn).toBe('urn:inflect:library:a'); // A first (no deps)
    });

    it('should preserve library objects in output', () => {
        const { sorted } = sortLibrariesByDependency([LIB_B, LIB_A]);
        expect(sorted[0].name).toBe('Library A');
        expect(sorted[1].name).toBe('Library B');
    });

    it('should return resolution metadata', () => {
        const { resolution } = sortLibrariesByDependency([LIB_A, LIB_B]);
        expect(resolution.fullyResolved).toBe(true);
        expect(resolution.order).toHaveLength(2);
    });
});

// ─── Real YAML Library Dependency Test ───────────────────────────────

describe('Real YAML libraries (no dependencies)', () => {
    it('should sort current libraries without issues', () => {
        // Current libraries have no dependencies — should work fine
        const libs: DependencyNode[] = [
            { urn: 'urn:inflect:library:soc2-2017', name: 'SOC2', dependencies: [] },
            { urn: 'urn:inflect:library:iso27001-2022', name: 'ISO', dependencies: [] },
            { urn: 'urn:inflect:library:nist-csf-2.0', name: 'NIST', dependencies: [] },
        ];
        const result = resolveDependencies(libs);
        expect(result.fullyResolved).toBe(true);
        expect(result.order).toHaveLength(3);
    });
});
