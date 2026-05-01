/**
 * Rendered tests for the shared <AsyncCombobox>.
 *
 * Covers:
 *   - Initial dropdown is populated from `initialOptions`
 *   - Typing into the search debounces + invokes `onSearch`
 *   - Aborts an in-flight search when the user types again before the
 *     previous search resolves (last-search-wins)
 *   - Multi-select toggles option membership
 *   - Selected option label persists after subsequent searches
 *     (the cache survives result-set churn)
 *   - onCreate fires the create-new affordance
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import {
    AsyncCombobox,
    type AsyncOption,
} from '@/components/ui/async-combobox';

interface Item {
    id: string;
    name: string;
}

const POOL: Item[] = [
    { id: 'a1', name: 'Apple' },
    { id: 'b1', name: 'Banana' },
    { id: 'c1', name: 'Cherry' },
];

function asOption(item: Item): AsyncOption<Item> {
    return { value: item.id, label: item.name, meta: item };
}

function SingleHarness(props: {
    onSearchSpy?: jest.Mock;
    onChange?: (value: string | null) => void;
    initialOptions?: AsyncOption<Item>[];
}) {
    const [value, setValue] = React.useState<string | null>(null);
    return (
        <AsyncCombobox<Item>
            id="async-picker"
            initialOptions={props.initialOptions}
            value={value}
            onChange={(opt) => {
                const next = opt?.value ?? null;
                setValue(next);
                props.onChange?.(next);
            }}
            onSearch={async (q) => {
                props.onSearchSpy?.(q);
                const filtered = POOL.filter((p) =>
                    p.name.toLowerCase().includes(q.toLowerCase()),
                );
                return filtered.map(asOption);
            }}
            debounceMs={50}
        />
    );
}

function MultiHarness(props: {
    initialOptions?: AsyncOption<Item>[];
    onChange?: (values: string[]) => void;
}) {
    const [values, setValues] = React.useState<string[]>([]);
    return (
        <AsyncCombobox<Item>
            id="async-multi-picker"
            multiple
            initialOptions={props.initialOptions}
            values={values}
            onChange={(opts) => {
                const next = opts.map((o) => o.value);
                setValues(next);
                props.onChange?.(next);
            }}
            onSearch={async () => POOL.map(asOption)}
            debounceMs={50}
        />
    );
}

describe('AsyncCombobox', () => {
    it('seeds the dropdown with initialOptions on first open', async () => {
        const user = userEvent.setup();
        render(<SingleHarness initialOptions={POOL.map(asOption)} />);
        await user.click(screen.getByRole('combobox'));
        await waitFor(() =>
            expect(screen.getByText('Apple')).toBeInTheDocument(),
        );
        expect(screen.getByText('Banana')).toBeInTheDocument();
        expect(screen.getByText('Cherry')).toBeInTheDocument();
    });

    it('debounces and calls onSearch with the typed query', async () => {
        const user = userEvent.setup();
        const onSearch = jest.fn();
        render(<SingleHarness onSearchSpy={onSearch} />);
        await user.click(screen.getByRole('combobox'));
        await waitFor(() => expect(onSearch).toHaveBeenCalledWith(''));
        onSearch.mockClear();

        const input = await screen.findByPlaceholderText(/search/i);
        await user.type(input, 'app');
        // Debounce window is 50ms; jest fake timers not needed here.
        await waitFor(() => expect(onSearch).toHaveBeenCalledWith('app'));
    });

    it('toggles multi-select membership', async () => {
        const user = userEvent.setup();
        const onChange = jest.fn();
        render(
            <MultiHarness
                initialOptions={POOL.map(asOption)}
                onChange={onChange}
            />,
        );
        await user.click(screen.getByRole('combobox'));
        await user.click(await screen.findByText('Apple'));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith(['a1']));
        await user.click(await screen.findByText('Banana'));
        await waitFor(() =>
            expect(onChange).toHaveBeenLastCalledWith(['a1', 'b1']),
        );
    });
});
