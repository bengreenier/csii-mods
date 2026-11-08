// Where things are, as text, for list views: a row's menu and category, and
// one breadcrumb (the views lay crumbs out themselves).
import { Entity } from "cs2/utils";
import { usePrefabTitle } from "./asset-data";
import { COLLECTIONS_TITLE, useCollections } from "./collections";
import { FAVORITES_TITLE } from "./favorites";
import { FIND_IT_TITLE, findItTitle } from "./find-it";
import { useLocalization } from "./localization";
import { MenuItem } from "./model";
import { Crumb } from "./navigation";

// "Roads > Small Roads", or "Find It" for an asset from its catalogue. One
// string: Gameface lays out adjacent JSX text nodes as separate lines.
export const PlaceLabel = ({ place }: { place: NonNullable<MenuItem["place"]> }) => {
    const { titles } = place;
    // Subscribes to prefab details only without titles (favorites).
    const menu = usePrefabTitle(titles ? undefined : place.menu ?? undefined, titles?.menu ?? "");
    const category = usePrefabTitle(titles ? undefined : place.category ?? undefined, titles?.category ?? "");
    if (!place.menu && !place.category) return <>{FIND_IT_TITLE}</>;
    return <>{[menu, category].filter((t) => t).join(" > ")}</>;
};

const PrefabCrumb = ({ entity, name }: { entity: Entity; name: string }) => <>{usePrefabTitle(entity, name)}</>;

const CollectionCrumb = ({ id }: { id: string }) => <>{useCollections().list.find((c) => c.id === id)?.name ?? ""}</>;

export const CrumbText = ({ crumb }: { crumb: Crumb }) => {
    const loc = useLocalization();
    if (crumb.kind === "prefab") return <PrefabCrumb entity={crumb.entity} name={crumb.name} />;
    if (crumb.kind === "favorites") return <>{FAVORITES_TITLE}</>;
    if (crumb.kind === "collections") return <>{COLLECTIONS_TITLE}</>;
    if (crumb.kind === "collection") return <CollectionCrumb id={crumb.id} />;
    return <>{crumb.name ? findItTitle(loc, crumb.name) : FIND_IT_TITLE}</>;
};
