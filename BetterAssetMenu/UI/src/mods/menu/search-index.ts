// Building search indexes from asset lists (used by search.ts). An index is
// made of parts (records + the filter suggestions they contribute) so large,
// stable parts (Find It's catalogue) can be built once and reused, while the
// small toolbar part is built per search.
import { toolbar } from "cs2/bindings";
import * as l10n from "cs2/l10n";
import { Entity, entityKey } from "cs2/utils";
import { assetTitle as title } from "./asset-data";
import { AssetMeta } from "./bindings";
import { findItCategoryText } from "./find-it";
import { FilterContext } from "./query/filters";
import { AssetRecord, buildRecord, dlcSlug as iconSlug, netWidthLabel } from "./query/record";

// A match, with where it lives in the vanilla toolbar (picking it selects the
// menu, category and asset, as a manual drill-down would). Assets only in Find
// It's catalogue have no menu or category: they're placed directly.
export interface SearchResult {
    asset: toolbar.Asset;
    menu?: Entity | null;
    category?: Entity | null;
    // The menu's and category's titles, for showing where it lives; unset
    // for Find It's catalogue.
    location?: Location;
}

export interface Location {
    menuName: string;
    menuTitle: string;
    categoryName: string;
    categoryTitle: string;
}

export const NO_LOCATION: Location = { menuName: "", menuTitle: "", categoryName: "", categoryTitle: "" };

export interface IndexEntry {
    record: AssetRecord;
    result: SearchResult;
}

export interface IndexPart {
    entries: IndexEntry[];
    suggestions: Suggestions;
}

// What the records in scope contribute to the filter context; the search
// adds the favorites (FilterContext.favoriteKeys).
export type IndexContext = Omit<FilterContext, "favoriteKeys">;

export interface SearchIndex {
    records: AssetRecord[];
    byKey: Map<string, SearchResult>;
    ctx: IndexContext;
}

export type RecordFactory = (asset: toolbar.Asset, location: Location, order: number) => AssetRecord;

/** Turns assets into search records; everything per-asset is looked up here. */
export function createRecordFactory(
    themes: { name: string; icon: string }[],
    metaByKey: ReadonlyMap<string, AssetMeta>,
    loc: l10n.Localization
): RecordFactory {
    // Name + both titles the game may use for it (the theme filter tooltip
    // uses ToolOptions.TOOLTIP_TITLE[<name>]).
    const themeText = new Map(
        themes.map((t) => [
            t.icon,
            [t.name, loc.translate(`ToolOptions.TOOLTIP_TITLE[${t.name}]`), title(loc, t.name)].filter(Boolean).join(" "),
        ])
    );
    const cached = (compute: (name: string) => string) => {
        const map = new Map<string, string>();
        return (name: string) => {
            let text = map.get(name);
            if (text === undefined) map.set(name, (text = compute(name)));
            return text;
        };
    };
    // Pack name + title (Assets.NAME[<name>], as in the vanilla pack filter).
    const packTextOf = cached((name) => `${name} ${title(loc, name)}`);
    // cat: text per Find It subcategory name.
    const catTextOf = cached((name) => findItCategoryText(loc, name));

    return (asset, location, order) => {
        const key = entityKey(asset.entity);
        const meta = metaByKey.get(key);
        return buildRecord(
            {
                key,
                name: asset.name,
                title: title(loc, asset.name),
                ...location,
                // Unmapped theme icons fall back to the icon's file name,
                // so theme: still has something to match.
                themeText: asset.theme ? themeText.get(asset.theme) ?? iconSlug(asset.theme) : null,
                packText: meta?.packs.map(packTextOf).join(" ") || null,
                catText: meta?.findItCategory ? catTextOf(meta.findItCategory) : null,
                lotWidth: meta?.lotWidth ?? 0,
                lotDepth: meta?.lotDepth ?? 0,
                netWidth: meta?.netWidth ?? 0,
                zone: meta?.zone ?? null,
                level: meta?.level ?? 0,
                dlcIcon: asset.dlc,
                unique: asset.unique,
                placed: asset.placed,
                highlight: asset.highlight,
                locked: asset.locked,
            },
            order
        );
    };
}

export interface PartSource {
    assets: toolbar.Asset[] | undefined;
    place: { menu?: Entity; category?: Entity };
    location: Location;
}

/** Records for `sources`, in order; `orderBase` sorts parts against each other. */
export function buildPart(sources: PartSource[], factory: RecordFactory, orderBase: number): IndexPart {
    const entries: IndexEntry[] = [];
    const suggestions = new Suggestions();
    const seen = new Set<string>();
    for (const { assets, place, location } of sources) {
        for (const asset of assets ?? []) {
            const record = factory(asset, location, orderBase + entries.length);
            if (seen.has(record.key)) continue;
            seen.add(record.key);
            const result: SearchResult = { asset, ...place };
            if (location !== NO_LOCATION) result.location = location;
            entries.push({ record, result });
            suggestions.add(record);
        }
    }
    return { entries, suggestions };
}

/** One index from parts, in order: an asset in several parts keeps the first. */
export function combineParts(parts: IndexPart[]): SearchIndex {
    const records: AssetRecord[] = [];
    const byKey = new Map<string, SearchResult>();
    const suggestions = new Suggestions();
    for (const part of parts) {
        for (const { record, result } of part.entries) {
            if (byKey.has(record.key)) continue;
            byKey.set(record.key, result);
            records.push(record);
        }
        suggestions.merge(part.suggestions);
    }
    return { records, byKey, ctx: suggestions.toContext() };
}

// Values that filter hints suggest, collected from the records in scope (so
// only themes/packs/... that occur are offered). Completions must be single
// words (a space would end the token).
export class Suggestions {
    private themes = new Set<string>();
    private packs = new Set<string>();
    private cats = new Set<string>();
    private zones = new Set<string>();
    private dlcs = new Set<string>();
    private sizes = new Map<string, number>();
    private widths = new Set<number>();
    private netWidths = new Set<number>();
    private depths = new Set<number>();
    private levels = new Set<number>();

    add(r: AssetRecord) {
        const words = (text: string, into: Set<string>) => {
            if (!text) return;
            for (const w of text.split(/[^a-z0-9]+/)) if (w.length >= 2) into.add(w);
        };
        words(r.themeLc, this.themes);
        words(r.packLc, this.packs);
        words(r.catLc, this.cats);
        words(r.zoneLc, this.zones);
        if (r.dlcLc) this.dlcs.add(r.dlcLc);
        if (r.lotWidth > 0) {
            this.sizes.set(`${r.lotWidth}x${r.lotDepth}`, r.lotWidth * r.lotDepth);
            this.widths.add(r.lotWidth);
            this.depths.add(r.lotDepth);
        }
        if (r.netWidth > 0) this.netWidths.add(r.netWidth);
        if (r.level > 0) this.levels.add(r.level);
    }

    merge(other: Suggestions) {
        const into = <T>(a: Set<T>, b: Set<T>) => b.forEach((v) => a.add(v));
        into(this.themes, other.themes);
        into(this.packs, other.packs);
        into(this.cats, other.cats);
        into(this.zones, other.zones);
        into(this.dlcs, other.dlcs);
        other.sizes.forEach((area, text) => this.sizes.set(text, area));
        into(this.widths, other.widths);
        into(this.netWidths, other.netWidths);
        into(this.depths, other.depths);
        into(this.levels, other.levels);
    }

    toContext(): IndexContext {
        const sorted = (s: Set<string>) => [...s].sort();
        const numbers = (s: Set<number>) => [...s].sort((a, b) => a - b).map(String);
        return {
            themes: sorted(this.themes),
            dlcs: sorted(this.dlcs),
            packs: sorted(this.packs),
            cats: sorted(this.cats),
            zones: sorted(this.zones),
            sizes: [...this.sizes.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([t]) => t),
            // Lot widths in cells, then network widths ("2u", or "12m" when
            // not whole cells).
            widths: [...numbers(this.widths), ...new Set([...this.netWidths].sort((a, b) => a - b).map(netWidthLabel))],
            depths: numbers(this.depths),
            levels: numbers(this.levels),
        };
    }
}
