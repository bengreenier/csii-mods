using System.Collections.Generic;
using Colossal.Entities;
using Colossal.Serialization.Entities;
using Colossal.UI.Binding;
using Game;
using Game.Buildings;
using Game.Prefabs;
using Game.Zones;
using Unity.Collections;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// Static per-asset data the search filters need that vanilla's toolbar
    /// bindings don't carry (see docs/search-schema.md). Built once per game
    /// load and sent to the UI as one list.
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        private struct AssetMeta
        {
            public Entity Entity;
            public List<string> Packs;
            // BuildingData.m_LotSize in cells: x = frontage, y = depth. 0 = not a building.
            public int LotWidth;
            public int LotDepth;
            // Zone words, e.g. "residential high", "office low", "industrial".
            public string Zone;
            // SpawnableBuildingData.m_Level; 0 = none.
            public int Level;
            // Paradox Mods ID of the mod the asset comes from; null otherwise.
            public string ModId;
            // NetGeometryData.m_DefaultWidth in metres for networks (roads,
            // tracks, paths, ...); 0 otherwise.
            public float NetWidth;
            // Find It's subcategory for the asset, e.g. "Props_Decals" (cat:),
            // while the Find It integration is on; null otherwise.
            public string FindItCategory;

            public bool IsEmpty => Packs == null && LotWidth == 0 && Zone == null && Level == 0 && ModId == null &&
                                   NetWidth == 0 && FindItCategory == null;
        }

        private RawValueBinding _assetMeta;
        private PrefabSystem _prefabSystem;
        private EntityQuery _toolbarAssetQuery;
        private List<AssetMeta> _assetMetaCache;

        private void CreateAssetMetaBinding()
        {
            _prefabSystem = World.GetOrCreateSystemManaged<PrefabSystem>();
            // Everything that can appear in the toolbar (ToolbarUISystem lists
            // assets through UIObjectData / UIGroupElement).
            _toolbarAssetQuery = GetEntityQuery(ComponentType.ReadOnly<PrefabData>(), ComponentType.ReadOnly<UIObjectData>());
            AddBinding(_assetMeta = new RawValueBinding(kGroup, "assetMeta", WriteAssetMeta));
        }

        protected override void OnGameLoadingComplete(Purpose purpose, GameMode mode)
        {
            base.OnGameLoadingComplete(purpose, mode);
            OnFindItLoadComplete();
            // Before assetMeta, which includes Platter's sizes.
            LookUpPlatter();
            // The UI may have subscribed mid-load and received a partial list.
            _assetMetaCache = null;
            _assetMeta.Update();
            RefreshAllAssets();
        }

        // Rebuilds and resends assetMeta (e.g. once Find It's catalogue is read).
        private void RefreshAssetMeta()
        {
            _assetMetaCache = null;
            _assetMeta.Update();
        }

        private void WriteAssetMeta(IJsonWriter writer)
        {
            _assetMetaCache ??= BuildAssetMeta();
            writer.ArrayBegin(_assetMetaCache.Count);
            foreach (var meta in _assetMetaCache)
            {
                writer.TypeBegin("betterAssetMenu.AssetMeta");
                writer.PropertyName("entity");
                writer.Write(meta.Entity);
                writer.PropertyName("packs");
                writer.ArrayBegin(meta.Packs?.Count ?? 0);
                if (meta.Packs != null)
                    foreach (var pack in meta.Packs) writer.Write(pack);
                writer.ArrayEnd();
                writer.PropertyName("lotWidth");
                writer.Write(meta.LotWidth);
                writer.PropertyName("lotDepth");
                writer.Write(meta.LotDepth);
                writer.PropertyName("zone");
                if (meta.Zone != null) writer.Write(meta.Zone);
                else writer.WriteNull();
                writer.PropertyName("level");
                writer.Write(meta.Level);
                writer.PropertyName("modId");
                if (meta.ModId != null) writer.Write(meta.ModId);
                else writer.WriteNull();
                writer.PropertyName("netWidth");
                writer.Write(meta.NetWidth);
                writer.PropertyName("findItCategory");
                WriteNullable(writer, meta.FindItCategory);
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }

        private List<AssetMeta> BuildAssetMeta()
        {
            var result = new List<AssetMeta>();
            using var toolbarEntities = _toolbarAssetQuery.ToEntityArray(Allocator.Temp);
            // Toolbar assets, plus everything in Find It's catalogue while the
            // integration is on (most of it isn't in the toolbar).
            var entities = new HashSet<Entity>(toolbarEntities);
            if (FindItActive && _findItEntries != null)
                foreach (var entry in _findItEntries) entities.Add(entry.Entity);
            // Platter's parcel sizes: not toolbar assets, and not buildings, so
            // their size comes from Platter's names.
            foreach (var parcel in _platter) entities.Add(parcel.Parcel);
            foreach (var entity in entities)
            {
                var meta = new AssetMeta { Entity = entity, Packs = GetPacks(entity) };
                if (EntityManager.TryGetComponent(entity, out BuildingData building))
                {
                    meta.LotWidth = building.m_LotSize.x;
                    meta.LotDepth = building.m_LotSize.y;
                }
                else if (PlatterParcelSize(entity) is (int width, int depth))
                {
                    meta.LotWidth = width;
                    meta.LotDepth = depth;
                }
                // Zoned buildings (e.g. signature buildings) take their zone from
                // their zone prefab; the Zones tab's items are zone prefabs.
                var zonePrefab = entity;
                if (EntityManager.TryGetComponent(entity, out SpawnableBuildingData spawnable))
                {
                    zonePrefab = spawnable.m_ZonePrefab;
                    meta.Level = spawnable.m_Level;
                }
                meta.Zone = GetZoneWords(zonePrefab);
                meta.ModId = GetModId(entity);
                if (EntityManager.TryGetComponent(entity, out NetGeometryData net) && net.m_DefaultWidth > 0)
                    meta.NetWidth = net.m_DefaultWidth;
                meta.FindItCategory = FindItCategoryOf(entity);
                if (!meta.IsEmpty) result.Add(meta);
            }
            return result;
        }

        // PrefabBase adds ModPrerequisiteData exactly when the prefab's asset has
        // a platformID, which is the asset's Paradox Mods ID (as Find It uses it
        // for its mods.paradoxplaza.com links). ToolbarUISystem.BindAsset shows
        // those assets with the Paradox Mods icon.
        private string GetModId(Entity entity)
        {
            if (!EntityManager.HasComponent<ModPrerequisiteData>(entity) ||
                !_prefabSystem.TryGetPrefab(entity, out PrefabBase prefab) || prefab.asset == null)
                return null;
            // Guarded: a throw here would stop the whole assetMeta list (and the
            // search filters built on it) from being sent. A bad asset just gets
            // no "Copy Paradox Mods link".
            try
            {
                var id = prefab.asset.GetMeta().platformID;
                return string.IsNullOrEmpty(id) ? null : id;
            }
            catch (System.Exception e)
            {
                if (!_loggedModIdFailure)
                {
                    _loggedModIdFailure = true;
                    Mod.LOG.Warn(e, $"Could not read the Paradox Mods ID of {prefab.name}; its mod link is left out (logged once)");
                }
                return null;
            }
        }

        private bool _loggedModIdFailure;

        // Offices are Industrial areas with ZoneFlags.Office (as in LevelSection,
        // TaxationUISystem). Density as PropertyUtils.GetZoneDensity, which
        // always says "low" for plain industrial, so that's left out.
        private string GetZoneWords(Entity zonePrefab)
        {
            if (zonePrefab == Entity.Null || !EntityManager.TryGetComponent(zonePrefab, out ZoneData zone)) return null;

            var office = zone.IsOffice();
            string type;
            switch (zone.m_AreaType)
            {
                case AreaType.Residential: type = "residential"; break;
                case AreaType.Commercial: type = "commercial"; break;
                case AreaType.Industrial: type = office ? "office" : "industrial"; break;
                default: return null;
            }
            if ((zone.m_AreaType == AreaType.Industrial && !office) ||
                !EntityManager.TryGetComponent(zonePrefab, out ZonePropertiesData properties))
                return type;

            switch (PropertyUtils.GetZoneDensity(zone, properties))
            {
                case ZoneDensity.Low: return type + " low";
                case ZoneDensity.Medium: return type + " medium";
                case ZoneDensity.High: return type + " high";
                default: return type;
            }
        }

        // Same membership test as ToolbarUISystem.FilterByPacks / BindPacks.
        // Names are prefab names; the UI localizes them as Assets.NAME[<name>].
        private List<string> GetPacks(Entity entity)
        {
            if (!EntityManager.TryGetBuffer(entity, true, out DynamicBuffer<AssetPackElement> buffer)) return null;

            List<string> packs = null;
            foreach (var element in buffer)
            {
                if (!EntityManager.HasComponent<AssetPackData>(element.m_Pack)) continue;
                if (_prefabSystem.TryGetPrefab(element.m_Pack, out PrefabBase pack))
                    (packs ??= new List<string>()).Add(pack.name);
            }
            return packs;
        }
    }
}
