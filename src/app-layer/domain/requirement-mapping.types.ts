/**
 * Requirement Mapping Domain Types
 *
 * Typed contracts for the cross-framework requirement mapping system.
 * These types decouple the domain logic from Prisma internals,
 * ensuring the repository/service boundary stays clean.
 *
 * Architecture:
 *   YAML MappingEntry → RequirementMapping (persisted)
 *   RequirementMapping → ResolvedMappingEdge (query result with denormalized names)
 *
 * The MappingStrength values match the YAML library schema (schemas.ts)
 * so mappings can flow bidirectionally between YAML ingestion and DB persistence.
 */

// ─── Mapping Strength ────────────────────────────────────────────────
// Reuse the canonical enum values from the library system.
// These are kept as string literals (matching the Prisma enum) to avoid
// import coupling with the library module at the type level.

/**
 * Semantic strength of a mapping between two requirement nodes.
 *
 * EQUAL     — Semantically equivalent: source and target express the same obligation.
 *             Implementing source fully satisfies target and vice versa.
 *
 * SUPERSET  — Source fully covers target: implementing source satisfies target,
 *             but target may not fully satisfy source (source is broader).
 *
 * SUBSET    — Source partially covers target: implementing source only partially
 *             satisfies target (source is narrower).
 *
 * INTERSECT — Partial overlap: source and target share common ground but neither
 *             fully covers the other.
 *
 * RELATED   — Conceptually related: useful for awareness and traceability
 *             but no direct coverage claim can be made.
 */
export const MAPPING_STRENGTHS = ['EQUAL', 'SUPERSET', 'SUBSET', 'INTERSECT', 'RELATED'] as const;
export type MappingStrengthValue = typeof MAPPING_STRENGTHS[number];

/**
 * Ordered by coverage confidence (descending).
 * Useful for sorting/filtering in gap analysis.
 */
export const MAPPING_STRENGTH_RANK: Record<MappingStrengthValue, number> = {
    EQUAL: 5,
    SUPERSET: 4,
    SUBSET: 3,
    INTERSECT: 2,
    RELATED: 1,
};

/** Returns true if the given string is a valid MappingStrength value. */
export function isValidMappingStrength(value: string): value is MappingStrengthValue {
    return MAPPING_STRENGTHS.includes(value as MappingStrengthValue);
}

// ─── Stored Mapping Set ──────────────────────────────────────────────
// Represents a persisted set of mappings between two frameworks.

export interface RequirementMappingSetDTO {
    readonly id: string;
    readonly sourceFrameworkId: string;
    readonly targetFrameworkId: string;
    readonly name: string;
    readonly description: string | null;
    readonly version: number;
    readonly sourceUrn: string | null;
    readonly contentHash: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    /** Denormalized framework names (populated on read) */
    readonly sourceFramework?: { readonly key: string; readonly name: string };
    readonly targetFramework?: { readonly key: string; readonly name: string };
    /** Total mapping count (populated on read) */
    readonly _count?: { readonly mappings: number };
}

// ─── Stored Mapping ──────────────────────────────────────────────────
// A single persisted mapping edge between two requirement nodes.

export interface RequirementMappingDTO {
    readonly id: string;
    readonly mappingSetId: string;
    readonly sourceRequirementId: string;
    readonly targetRequirementId: string;
    readonly strength: MappingStrengthValue;
    readonly rationale: string | null;
    readonly metadataJson: string | null;
    readonly createdAt: Date;
}

// ─── Resolved Mapping Edge ───────────────────────────────────────────
// A mapping enriched with denormalized requirement/framework info.
// Used in query results to avoid N+1 lookups in consumers.

export interface ResolvedMappingEdge {
    readonly id: string;
    readonly strength: MappingStrengthValue;
    readonly rationale: string | null;
    readonly source: {
        readonly requirementId: string;
        readonly requirementCode: string;
        readonly requirementTitle: string;
        readonly frameworkId: string;
        readonly frameworkKey: string;
        readonly frameworkName: string;
    };
    readonly target: {
        readonly requirementId: string;
        readonly requirementCode: string;
        readonly requirementTitle: string;
        readonly frameworkId: string;
        readonly frameworkKey: string;
        readonly frameworkName: string;
    };
}

// ─── Query Inputs ────────────────────────────────────────────────────

export interface CreateMappingSetInput {
    readonly sourceFrameworkId: string;
    readonly targetFrameworkId: string;
    readonly name: string;
    readonly description?: string | null;
    readonly version?: number;
    readonly sourceUrn?: string | null;
    readonly contentHash?: string | null;
}

export interface CreateMappingInput {
    readonly mappingSetId: string;
    readonly sourceRequirementId: string;
    readonly targetRequirementId: string;
    readonly strength: MappingStrengthValue;
    readonly rationale?: string | null;
    readonly metadataJson?: string | null;
}

export interface MappingsBySourceQuery {
    readonly sourceRequirementId: string;
    /** Optional: filter to mappings targeting a specific framework */
    readonly targetFrameworkId?: string;
    /** Optional: minimum strength threshold */
    readonly minStrength?: MappingStrengthValue;
}

export interface MappingsByFrameworkPairQuery {
    readonly sourceFrameworkId: string;
    readonly targetFrameworkId: string;
    /** Optional: minimum strength threshold */
    readonly minStrength?: MappingStrengthValue;
}

/**
 * Query for finding all mappings targeting a specific requirement.
 * Used for reverse-direction edge loading (target → source traversal).
 */
export interface MappingsByTargetQuery {
    readonly targetRequirementId: string;
    /** Optional: filter to mappings from a specific source framework */
    readonly sourceFrameworkId?: string;
    /** Optional: minimum strength threshold */
    readonly minStrength?: MappingStrengthValue;
}

export interface BulkUpsertMappingInput {
    readonly sourceRequirementId: string;
    readonly targetRequirementId: string;
    readonly strength: MappingStrengthValue;
    readonly rationale?: string | null;
    readonly metadataJson?: string | null;
}
