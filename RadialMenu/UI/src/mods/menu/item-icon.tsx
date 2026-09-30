// An item's icon: a tinted glyph, or an image with fallbacks.
import { SyntheticEvent } from "react";
import { useFindItFallbackIcon } from "./find-it";
import { MenuItem } from "./model";
import { TintedIcon } from "./tinted-icon";

// Vanilla's placeholder image (ImageSystem.placeholderIcon), the last resort.
export const PLACEHOLDER_ICON = "Media/Placeholder.svg";

/**
 * An <img> onError handler that moves to the next of `candidates` after the
 * one that failed (as vanilla's missing-icon-handler does, with a list).
 * Thumbnails can fail to load, e.g. a Find It prop's camera thumbnail.
 */
export const fallBackThrough =
    (candidates: (string | null | undefined)[]) => (e: SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        const current = img.getAttribute("src");
        const list = [...candidates, PLACEHOLDER_ICON].filter((c): c is string => !!c);
        const next = list.slice(list.indexOf(current ?? "") + 1).find((c) => c !== current);
        if (next) img.src = next;
    };

export const ItemIcon = ({
    icon,
    fallbackIcon,
    iconColor,
    className,
}: {
    icon: string;
    // Shown if `icon` fails to load (then vanilla's placeholder).
    fallbackIcon?: string;
    // Draws `icon` as a single-colour glyph in this colour (TintedIcon).
    iconColor?: string;
    className?: string;
}) =>
    iconColor ? (
        <TintedIcon className={className} src={icon} color={iconColor} />
    ) : (
        <img className={className} src={icon} onError={fallBackThrough([icon, fallbackIcon])} />
    );

// A menu item's icon; a Find It asset falls back to its subcategory's icon.
export const MenuItemIcon = ({ item, className }: { item: MenuItem; className?: string }) => {
    const findItIcon = useFindItFallbackIcon(item.asset?.entity);
    return (
        <ItemIcon
            className={className}
            icon={item.icon}
            fallbackIcon={item.fallbackIcon ?? findItIcon}
            iconColor={item.iconColor}
        />
    );
};
