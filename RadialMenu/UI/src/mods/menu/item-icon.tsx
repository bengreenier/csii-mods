// An item's icon: a tinted glyph, or an image with a fallback.
import { TintedIcon } from "./tinted-icon";

export const ItemIcon = ({
    icon,
    fallbackIcon,
    iconColor,
    className,
}: {
    icon: string;
    // Shown if `icon` fails to load.
    fallbackIcon?: string;
    // Draws `icon` as a single-colour glyph in this colour (TintedIcon).
    iconColor?: string;
    className?: string;
}) =>
    iconColor ? (
        <TintedIcon className={className} src={icon} color={iconColor} />
    ) : (
        <img
            className={className}
            src={icon}
            // As vanilla's missing-icon-handler: swap in the
            // fallback once, if the icon can't be loaded.
            onError={(e) => {
                if (fallbackIcon && e.currentTarget.getAttribute("src") !== fallbackIcon)
                    e.currentTarget.src = fallbackIcon;
            }}
        />
    );
