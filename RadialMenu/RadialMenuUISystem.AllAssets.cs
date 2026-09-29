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

namespace RadialMenu
{
    /// <summary>
    /// A copy of vanilla's <c>toolbar.assets</c> map binding for search that
    /// leaves out the asset menu's theme and pack filters, so every theme and
    /// pack is searchable without touching vanilla's selection (whose setters
    /// re-run ToolbarUISystem.Apply and can switch the active tool).
    /// </summary>
    public partial class RadialMenuUISystem
    {
        private RawMapBinding<Entity> _allAssets;
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
        private void RefreshAllAssets() => _allAssets.UpdateAll();

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
    }
}
