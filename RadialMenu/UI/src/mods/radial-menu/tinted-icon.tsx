// A single-colour glyph (e.g. Media/Glyphs/*.svg, which are black) drawn in any
// colour: the image is a mask over a coloured box, as vanilla's TintedIcon
// (game-ui/common/image/tinted-icon.tsx) does.
import classNames from "classnames";
import styles from "./shared.module.scss";

export const TintedIcon = ({ src, color, className }: { src: string; color: string; className?: string }) => (
    <div className={classNames(styles.tintedIcon, className)} style={{ maskImage: `url(${src})`, backgroundColor: color }} />
);
