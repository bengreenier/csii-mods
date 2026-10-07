using System.Collections.Generic;
using Colossal.Entities;
using Colossal.UI.Binding;
using Game;
using Game.City;
using Game.Prefabs;
using Game.SceneFlow;
using Game.UI;
using Game.UI.InGame;
using Unity.Collections;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// A copy of vanilla's <c>toolbar.assets</c> map binding for search that
    /// leaves out the asset menu's theme and pack filters, so every theme and
    /// pack is searchable without touching vanilla's selection (whose setters
    /// re-run ToolbarUISystem.Apply and can switch the active tool).
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        private RawMapBinding<Entity> _allAssets;
        private RawMapBinding<Entity> _subCategories;
        private ImageSystem _imageSystem;
        private ToolbarUISystem _toolbarUISystem;
        private UniqueAssetTrackingSystem _uniqueAssetTrackingSystem;
        private CityConfigurationSystem _cityConfigurationSystem;
        private RawEventBinding _resetVanillaThemes;
        private static bool _themeResetRequested;

        /// <summary>From the "Reset vanilla theme filter" settings button.</summary>
        /// This system only updates in a city, so outside one the request is
        /// dropped right away rather than left to fire after the next load.
        public static void RequestThemeReset()
        {
            if (GameManager.instance.gameMode != GameMode.Game)
            {
                Mod.LOG.Info("Reset vanilla theme filter skipped: no city loaded");
                return;
            }
            _themeResetRequested = true;
        }

        private void CreateAllAssetsBinding()
        {
            _toolbarUISystem = World.GetOrCreateSystemManaged<ToolbarUISystem>();
            _uniqueAssetTrackingSystem = World.GetOrCreateSystemManaged<UniqueAssetTrackingSystem>();
            AddBinding(_allAssets = new RawMapBinding<Entity>(kGroup, "allAssets", BindAllAssets));
            _imageSystem = World.GetOrCreateSystemManaged<ImageSystem>();
            AddBinding(_subCategories = new RawMapBinding<Entity>(kGroup, "subCategories", BindSubCategories));
            _cityConfigurationSystem = World.GetOrCreateSystemManaged<CityConfigurationSystem>();
            AddBinding(_resetVanillaThemes = new RawEventBinding(kGroup, "resetVanillaThemes"));
        }

        // The UI applies it through vanilla's toolbar.clearAssetSelection and
        // toolbar.setSelectedThemes triggers, so ToolbarUISystem does its usual
        // bookkeeping (see useResetVanillaThemes in UI/src/mods/menu/shell.tsx). Clearing first means the theme
        // change can't swap the active tool to the "closest" asset in the theme.
        private void HandleThemeResetRequest()
        {
            if (!_themeResetRequested) return;

            var theme = _cityConfigurationSystem.defaultTheme;
            if (theme == Entity.Null)
            {
                _themeResetRequested = false;
                Mod.LOG.Info("Reset vanilla theme filter skipped: no city loaded");
                return;
            }
            // The in-game UI may not be listening while the options screen is
            // up; keep the request until it is.
            if (!_resetVanillaThemes.active) return;

            _themeResetRequested = false;
            var writer = _resetVanillaThemes.EventBegin();
            writer.Write(theme);
            _resetVanillaThemes.EventEnd();
        }

        // Unlocks and unique placements change entries (vanilla refreshes its
        // copy on those); refreshing whenever the menu opens covers anything
        // that changed while it was closed. Only subscribed keys are written.
        private void RefreshAllAssets()
        {
            // assetMeta may have been built before Platter made its prefabs.
            if (LookUpPlatter()) RefreshAssetMeta();
            _allAssets.UpdateAll();
            _subCategories.UpdateAll();
        }

        // ToolbarUISystem.BindAssets without FilterByThemes / FilterByPacks.
        private void BindAllAssets(IJsonWriter writer, Entity assetCategory)
        {
            if (!EntityManager.HasComponent<UIAssetCategoryData>(assetCategory) ||
                !EntityManager.TryGetBuffer(assetCategory, true, out DynamicBuffer<UIGroupElement> buffer))
            {
                writer.WriteEmptyArray();
                return;
            }

            var objects = UIObjectInfo.GetObjects(EntityManager, buffer, Allocator.TempJob);
            try
            {
                // FilterOutUpgrades
                for (var i = objects.Length - 1; i >= 0; i--)
                {
                    if (EntityManager.HasComponent<ServiceUpgradeData>(objects[i].entity))
                        objects.RemoveAtSwapBack(i);
                }
                objects.Sort();
                writer.ArrayBegin(objects.Length);
                foreach (var info in objects)
                {
                    _toolbarUISystem.BindAsset(writer, info.entity,
                        _uniqueAssetTrackingSystem.IsUniqueAsset(info.entity),
                        _uniqueAssetTrackingSystem.IsPlacedUniqueAsset(info.entity));
                }
                writer.ArrayEnd();
            }
            finally
            {
                objects.Dispose();
            }
        }

        // Categories nested in a category, as ExtraLib builds them for Extra
        // Assets Importer: Extra Assets > Surfaces > "Brick Surfaces" > assets.
        // ExtraLib's parent category (UIAssetParentCategoryPrefab) has
        // UIAssetCategoryData but no UIAssetMenuData, so vanilla lists it among
        // the menu's categories. Its UIGroupElement buffer holds child
        // categories, which vanilla's BindAssets writes as if they were assets;
        // toolbar.selectAsset on one activates no tool. ExtraLib's own UI shows
        // them as a second tab row that calls toolbar.selectAssetCategory.
        // Written as the leaf categories under `assetCategory`, in vanilla's
        // toolbar.AssetCategory shape (BindAssetCategories); empty for an
        // ordinary category.
        private void BindSubCategories(IJsonWriter writer, Entity assetCategory)
        {
            var leaves = new List<Entity>();
            CollectLeafCategories(assetCategory, leaves, 0);
            writer.ArrayBegin(leaves.Count);
            foreach (var entity in leaves)
            {
                var prefab = _prefabSystem.GetPrefab<PrefabBase>(EntityManager.GetComponentData<PrefabData>(entity));
                writer.TypeBegin("toolbar.AssetCategory");
                writer.PropertyName("entity");
                writer.Write(entity);
                writer.PropertyName("name");
                writer.Write(prefab.name);
                writer.PropertyName("icon");
                writer.Write(ImageSystem.GetIcon(prefab) ?? _imageSystem.placeholderIcon);
                writer.PropertyName("locked");
                writer.Write(EntityManager.HasEnabledComponent<Locked>(entity));
                writer.PropertyName("uiTag");
                writer.Write(prefab.uiTag);
                writer.PropertyName("highlight");
                writer.Write(EntityManager.HasComponent<UIHighlight>(entity));
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }

        // Vanilla's GetSortedCategories rule: UIAssetCategoryData and a
        // non-empty buffer of its own.
        private bool IsListedCategory(Entity entity) =>
            EntityManager.HasComponent<UIAssetCategoryData>(entity) &&
            EntityManager.TryGetBuffer(entity, true, out DynamicBuffer<UIGroupElement> buffer) && buffer.Length > 0;

        private void CollectLeafCategories(Entity group, List<Entity> leaves, int depth)
        {
            // Capped, so a prefab cycle can't hang the game.
            if (depth > 8 || !EntityManager.TryGetBuffer(group, true, out DynamicBuffer<UIGroupElement> buffer)) return;
            // Most categories hold only assets: check before sorting them all
            // (search subscribes every category).
            var hasCategory = false;
            for (var i = 0; i < buffer.Length && !hasCategory; i++)
                hasCategory = EntityManager.HasComponent<UIAssetCategoryData>(buffer[i].m_Prefab);
            if (!hasCategory) return;
            var objects = UIObjectInfo.GetSortedObjects(EntityManager, buffer, Allocator.Temp);
            try
            {
                foreach (var info in objects)
                {
                    if (!IsListedCategory(info.entity)) continue;
                    var before = leaves.Count;
                    CollectLeafCategories(info.entity, leaves, depth + 1);
                    if (leaves.Count == before) leaves.Add(info.entity);
                }
            }
            finally
            {
                objects.Dispose();
            }
        }
    }
}
