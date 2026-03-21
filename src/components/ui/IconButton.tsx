/**
 * IconButton — accessible icon-only button with enforced aria-label.
 *
 * Use this instead of hand-crafting icon-only buttons.
 * The aria-label prop is required to ensure screen readers announce
 * the button's purpose.
 *
 * Usage:
 *   <IconButton icon="error" aria-label="Remove item" onClick={handleRemove} variant="danger" />
 *   <IconButton icon="settings" aria-label="Settings" onClick={openSettings} />
 *   <IconButton icon="edit" aria-label="Edit" onClick={edit} btnSize="sm" />
 */
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';

export interface IconButtonProps {
    /** Semantic icon to render. */
    icon: AppIconName;
    /** Required accessible label — screen readers announce this. */
    'aria-label': string;
    /** Click handler. */
    onClick: () => void;
    /** Icon size in px (default: 16 for md, 14 for sm). */
    size?: number;
    /** Button size variant. */
    btnSize?: 'md' | 'sm';
    /** Visual variant. */
    variant?: 'ghost' | 'danger';
    /** Disables the button. */
    disabled?: boolean;
    /** Additional CSS classes. */
    className?: string;
    /** Optional HTML id. */
    id?: string;
}

export function IconButton({
    icon,
    'aria-label': ariaLabel,
    onClick,
    size,
    btnSize = 'md',
    variant = 'ghost',
    disabled,
    className = '',
    id,
}: IconButtonProps) {
    const iconSize = size ?? (btnSize === 'sm' ? 14 : 16);
    const sizeClass = btnSize === 'sm' ? 'icon-btn-sm' : '';
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            className={`icon-btn ${sizeClass} ${variant === 'danger' ? 'icon-btn-danger' : ''} ${className}`}
            id={id}
        >
            <AppIcon name={icon} size={iconSize} />
        </button>
    );
}
