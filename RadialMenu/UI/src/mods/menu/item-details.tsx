// What an item looks like in detail: its title and preview image.
import { useMapValue, useValue } from "cs2/api";
import { prefab } from "cs2/bindings";
import { Entity } from "cs2/utils";
import { usePrefabTitle } from "./asset-data";
import { hubImage$ } from "./bindings";

// Setting.HubImageMode values ("Preview image").
export const HUB_IMAGE_BUTTON_ICON = 1;

// `title` is shown as is; without it, the prefab's title from `entity`.
export const ItemTitle = ({ label }: { label: { entity: Entity; name: string; title?: string } }) =>
    label.title !== undefined ? <>{label.title}</> : <PrefabTitle entity={label.entity} fallback={label.name} />;

export const PrefabTitle = ({ entity, fallback }: { entity: Entity; fallback: string }) => (
    <>{usePrefabTitle(entity, fallback)}</>
);

// Uses the prefab's dedicated preview when it has one (e.g. signature buildings),
// otherwise its thumbnail, as the vanilla asset detail panel does.
export const PrefabPreview = ({
    entity,
    fallbackIcon,
    className,
}: {
    entity: Entity;
    fallbackIcon: string;
    className?: string;
}) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const src = details?.preview || details?.icon || fallbackIcon;
    return <img className={className} src={src} />;
};

// A leaf item's large picture, as the "Preview image" setting picks.
export const ItemPreview = ({ entity, icon, className }: { entity: Entity; icon: string; className?: string }) => {
    const hubImage = useValue(hubImage$);
    return hubImage === HUB_IMAGE_BUTTON_ICON ? (
        // The button's own image.
        <img className={className} src={icon} />
    ) : (
        <PrefabPreview entity={entity} fallbackIcon={icon} className={className} />
    );
};
