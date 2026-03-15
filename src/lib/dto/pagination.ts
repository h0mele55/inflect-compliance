/**
 * Standard pagination DTOs for the API response contract.
 *
 * All paginated list endpoints return:
 * {
 *   items: T[];
 *   pageInfo: { nextCursor?: string; hasNextPage: boolean }
 * }
 */

export interface PageInfo {
    nextCursor?: string;
    hasNextPage: boolean;
}

export interface PaginatedResponse<T> {
    items: T[];
    pageInfo: PageInfo;
}
