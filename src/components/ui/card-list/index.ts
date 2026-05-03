/**
 * Epic 66 — `@/components/ui/card-list` barrel.
 *
 * Compound surface:
 *   - `<CardList>`            — responsive grid container
 *   - `<CardList.Card>`       — single card with optional select + click
 *   - `<CardList.CardHeader>` — title / badge / actions slot
 *   - `<CardList.CardContent>` — body slot with optional `kv` shorthand
 *
 * Hooks for descendant access:
 *   - `useCardListContext()`  — read the grid's loading state
 *   - `useCardItemContext()`  — read the parent card's selected state
 */

import {
    CardList as CardListContainer,
    CardListContext,
    useCardListContext,
} from './card-list';
import {
    CardListCard,
    CardListCardContent,
    CardListCardHeader,
    useCardItemContext,
} from './card-list-card';

export type { CardListProps } from './card-list';
export type {
    CardListCardProps,
    CardListCardHeaderProps,
    CardListCardContentProps,
    CardKeyValue,
} from './card-list-card';

export const CardList = Object.assign(CardListContainer, {
    Card: CardListCard,
    CardHeader: CardListCardHeader,
    CardContent: CardListCardContent,
});

export {
    CardListContext,
    useCardListContext,
    useCardItemContext,
};
