// What an item looks like in detail: its title and preview image.
import { useMapValue, useValue } from "cs2/api";
import { prefab } from "cs2/bindings";
import { Entity } from "cs2/utils";
import { usePrefabTitle } from "./asset-data";
import { hubImage$ } from "./bindings";
import { useFindItFallbackIcon } from "./find-it";
import { fallBackThrough } from "./item-icon";
import { MenuItem } from "./model";

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
// Falls back through `fallbackIcons` if the picture doesn't load.
export const PrefabPreview = ({
    entity,
    fallbackIcons,
    className,
}: {
    entity: Entity;
    fallbackIcons: (string | undefined)[];
    className?: string;
}) => {
    const details = useMapValue(prefab.prefabDetails$, entity);
    const src = details?.preview || details?.icon || fallbackIcons.find((i) => i) || "";
    return <img className={className} src={src} onError={fallBackThrough([src, ...fallbackIcons])} />;
};

// A leaf item's large picture, as the "Preview image" setting picks. If it
// doesn't load: the item's icon, a Find It asset's subcategory icon (as Find
// It does), then vanilla's placeholder.
export const ItemPreview = ({ item, className }: { item: MenuItem; className?: string }) => {
    const hubImage = useValue(hubImage$);
    const findItIcon = useFindItFallbackIcon(item.asset?.entity);
    const fallbacks = [item.icon, item.fallbackIcon ?? findItIcon];
    return hubImage === HUB_IMAGE_BUTTON_ICON ? (
        // The button's own image.
        <img className={className} src={item.icon} onError={fallBackThrough(fallbacks)} />
    ) : (
        <PrefabPreview entity={item.entity} fallbackIcons={fallbacks} className={className} />
    );
};
