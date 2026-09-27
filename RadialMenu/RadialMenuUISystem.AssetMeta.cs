using System.Collections.Generic;
using Colossal.Entities;
using Colossal.Serialization.Entities;
using Colossal.UI.Binding;
using Game;
using Game.Prefabs;
using Unity.Collections;
using Unity.Entities;

namespace RadialMenu
{
    /// <summary>
    /// Static per-asset data the search filters need that vanilla's toolbar
    /// bindings don't carry (see docs/search-schema.md). Built once per game
    /// load and sent to the UI as one list.
    /// </summary>
    public partial class RadialMenuUISystem
    {
        private struct AssetMeta
        {
            public Entity Entity;
            public List<string> Packs;

            public bool IsEmpty => Packs == null;
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
            // The UI may have subscribed mid-load and received a partial list.
            _assetMetaCache = null;
            _assetMeta.Update();
        }

        private void WriteAssetMeta(IJsonWriter writer)
        {
            _assetMetaCache ??= BuildAssetMeta();
            writer.ArrayBegin(_assetMetaCache.Count);
            foreach (var meta in _assetMetaCache)
            {
                writer.TypeBegin("radialMenu.AssetMeta");
                writer.PropertyName("entity");
                writer.Write(meta.Entity);
                writer.PropertyName("packs");
                writer.ArrayBegin(meta.Packs?.Count ?? 0);
                if (meta.Packs != null)
                    foreach (var pack in meta.Packs) writer.Write(pack);
                writer.ArrayEnd();
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }

        private List<AssetMeta> BuildAssetMeta()
        {
            var result = new List<AssetMeta>();
            using var entities = _toolbarAssetQuery.ToEntityArray(Allocator.Temp);
            foreach (var entity in entities)
            {
                var meta = new AssetMeta { Entity = entity, Packs = GetPacks(entity) };
                if (!meta.IsEmpty) result.Add(meta);
            }
            return result;
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
