using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using Colossal.UI.Binding;
using Game;
using Game.Input;
using Game.Prefabs;
using Game.SceneFlow;
using Game.Tools;
using Game.UI.InGame;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// "Use Find It's catalogue": a snapshot of Find It's prefab index
    /// (FindItBridge), taken once Find It has finished indexing after a load,
    /// and sent to the UI like vanilla's toolbar: the category tree as a value,
    /// the assets as a map by subcategory (only subscribed keys are written).
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        private List<FindItBridge.Entry> _findItEntries;
        private Dictionary<int, List<Entity>> _findItBySubCategory = new Dictionary<int, List<Entity>>();
        private Dictionary<Entity, string> _findItCategoryByEntity = new Dictionary<Entity, string>();
        private RawValueBinding _findItCategories;
        private RawMapBinding<int> _findItAssets;
        private ValueBinding<bool> _findItActive;
        // This open came from Find It's button: start at the Find It level.
        private ValueBinding<bool> _openAtFindIt;
        // This open came from Find It's Picker: the picked asset and its
        // subcategory, -1 otherwise. Two ints; the UI waits for both.
        private ValueBinding<int> _pickedAsset;
        private ValueBinding<int> _pickedSubCategory;
        private Dictionary<Entity, int> _findItSubCategoryByEntity = new Dictionary<Entity, int>();
        private ToolSystem _pickerToolSystem;
        // Last update: the override was in use.
        private bool _pickerOverridden;
        // Set once this load has completed. Find It sets FindItUtil.IsReady
        // once and never resets it, so after a second load IsReady is already
        // true before Find It re-indexes; waiting for loading-complete (all its
        // callbacks, Find It's re-index included, run before our next update)
        // avoids snapshotting the previous load's index.
        private bool _findItLoadComplete;
        // Set by "Refresh Better Asset Menu data" (BetterAssetMenuUISystem.Refresh.cs):
        // re-read Find It's index and resend it, which also rebuilds the UI's
        // cached search records (keyed on the data sent).
        private bool _findItRebuildRequested;

        /// <summary>The integration is wanted and possible right now.</summary>
        internal static bool FindItActive => (Mod.Settings?.UseFindItWanted ?? true) && FindItBridge.IsAvailable;

        private void CreateFindItBindings()
        {
            AddBinding(_findItActive = new ValueBinding<bool>(kGroup, "findItActive", false));
            AddBinding(_openAtFindIt = new ValueBinding<bool>(kGroup, "openAtFindIt", false));
            AddBinding(_pickedAsset = new ValueBinding<int>(kGroup, "pickedAsset", -1));
            AddBinding(_pickedSubCategory = new ValueBinding<int>(kGroup, "pickedSubCategory", -1));
            AddBinding(_findItCategories = new RawValueBinding(kGroup, "findItCategories", WriteFindItCategories));
            AddBinding(_findItAssets = new RawMapBinding<int>(kGroup, "findItAssets", WriteFindItAssets));
            // Places any prefab directly, as Find It does: for assets that
            // aren't in the vanilla toolbar (toolbar.selectAsset can't).
            var toolSystem = _pickerToolSystem = World.GetOrCreateSystemManaged<ToolSystem>();
            AddBinding(new TriggerBinding<Entity>(kGroup, "activatePrefab", entity =>
            {
                if (!_prefabSystem.TryGetPrefab(PlatterPlaceholderOf(entity), out PrefabBase prefab)) return;
                toolSystem.ActivatePrefabTool(prefab);
                RadialSelection.Mark(toolSystem);
            }));
        }

        // A new load gets a fresh snapshot (Find It re-indexes on each load).
        private void ResetFindIt()
        {
            _findItLoadComplete = false;
            _findItRebuildRequested = false;
            _findItEntries = null;
            _findItBySubCategory = new Dictionary<int, List<Entity>>();
            _findItCategoryByEntity = new Dictionary<Entity, string>();
            _findItSubCategoryByEntity = new Dictionary<Entity, int>();
            // This system stops updating outside a city: never leave Find It's
            // option changed behind it.
            FindItBridge.SuppressPickerPanel(false);
            _pickerOverridden = false;
        }

        // Called every update: reads the index once Find It is ready, and
        // tells the UI whether the integration is on.
        private void UpdateFindIt()
        {
            UpdatePickerOverride();
            var active = FindItActive && _findItEntries != null;
            if (_findItActive.value != active)
            {
                _findItActive.Update(active);
                // assetMeta includes Find It's catalogue only while it's on.
                RefreshAssetMeta();
            }

            if (!_findItLoadComplete || !FindItActive || !FindItBridge.IsReady()) return;
            // A snapshot is taken once per load, or again on request ("Refresh
            // Better Asset Menu data"): replaced in place, so the integration never
            // blinks off (which would hide the Find It entry mid-use).
            var rebuild = _findItRebuildRequested;
            _findItRebuildRequested = false;
            if (_findItEntries != null && !rebuild) return;

            var stopwatch = Stopwatch.StartNew();
            var entries = FindItBridge.ReadIndex(_prefabSystem);
            if (entries == null) return;
            _findItEntries = entries;
            _findItBySubCategory = entries
                .GroupBy(e => e.SubCategory)
                .ToDictionary(g => g.Key, g => g.Select(e => e.Entity).ToList());
            _findItCategoryByEntity = new Dictionary<Entity, string>();
            _findItSubCategoryByEntity = new Dictionary<Entity, int>();
            foreach (var entry in entries)
            {
                _findItCategoryByEntity[entry.Entity] = entry.SubCategoryName;
                _findItSubCategoryByEntity[entry.Entity] = entry.SubCategory;
            }
            Mod.LOG.Info($"Find It {FindItBridge.Version}: {(rebuild ? "rebuilt" : "read")} {entries.Count} catalogue entries " +
                         $"({_findItBySubCategory.Count} subcategories) in {stopwatch.ElapsedMilliseconds} ms");
            _findItCategories.Update();
            _findItAssets.UpdateAll();
            _findItActive.Update(FindItActive);
            RefreshAssetMeta();
        }

        // From OnGameLoadingComplete: Find It's index for this load is built.
        // The first one (the main menu) comes after every mod has loaded, so
        // Find It's presence is settled then.
        private void OnFindItLoadComplete()
        {
            FindItBridge.Settle();
            FindItBridge.HookIconButton(OpenFromFindItButton);
            _findItLoadComplete = true;
        }

        // "Show Find It's picks in this menu". Find It's Picker opens its panel
        // from inside its tool, with no trigger to swap. So while the Picker is
        // active, its option to do that is off (it then only activates the
        // prefab tool), and we open the menu when that happens. Without the
        // catalogue there's nothing to show the pick in: the Picker stays Find It's.
        private void UpdatePickerOverride()
        {
            var onPicker = _pickerToolSystem.activeTool?.toolID == FindItBridge.kPickerToolId;
            var overriding = onPicker
                && (Mod.Settings?.PickerOpensMenuWanted ?? false)
                && _findItEntries != null && FindItActive
                && FindItBridge.BindPicker();
            FindItBridge.SuppressPickerPanel(overriding);

            // Left the Picker with a prefab tool on, with the mouse on the city: a
            // pick. (Choosing an asset from a toolbar has it over the UI.)
            if (_pickerOverridden && !onPicker && !InputManager.instance.mouseOverUI)
                OpenAtPick(_pickerToolSystem.activePrefab);
            _pickerOverridden = overriding;
        }

        // Not in the catalogue: no menu, the prefab tool is simply on.
        private void OpenAtPick(PrefabBase prefab)
        {
            if (prefab == null || !_prefabSystem.TryGetEntity(prefab, out var entity)
                || !_findItSubCategoryByEntity.TryGetValue(entity, out var subCategory)
                || GameManager.instance.gameMode != GameMode.Game
                || _gameScreenUISystem.activeScreen != GameScreenUISystem.GameScreen.Main)
                return;
            _pickedSubCategory.Update(subCategory);
            _pickedAsset.Update(entity.Index);
            SetOpen(true);
        }

        // Find It's magnifying glass was clicked. False leaves it to Find It:
        // setting off, or not on the city's main screen (e.g. in the editor).
        private bool OpenFromFindItButton()
        {
            if (!(Mod.Settings?.FindItButtonOpensMenuWanted ?? false)
                || GameManager.instance.gameMode != GameMode.Game
                || _gameScreenUISystem.activeScreen != GameScreenUISystem.GameScreen.Main)
                return false;
            _openAtFindIt.Update(true);
            SetOpen(true);
            return true;
        }

        // Find It's subcategory name for an asset (assetMeta), while it's on.
        private string FindItCategoryOf(Entity entity) =>
            FindItActive && _findItCategoryByEntity.TryGetValue(entity, out var name) ? name : null;

        // [{ id, name, icon, subCategories: [{ id, name, icon, count }] }], in
        // Find It's order. Names are Find It's enum names; the UI shows them
        // through Find It's locale keys (Tooltip.LABEL[FindIt.<name>]).
        private void WriteFindItCategories(IJsonWriter writer)
        {
            var categories = (_findItEntries ?? new List<FindItBridge.Entry>())
                .GroupBy(e => (e.Category, e.CategoryName))
                .OrderBy(g => g.Key.Category)
                .ToList();
            writer.ArrayBegin(categories.Count);
            foreach (var category in categories)
            {
                var subCategories = category
                    .GroupBy(e => (e.SubCategory, e.SubCategoryName))
                    .OrderBy(g => g.Key.SubCategory)
                    .ToList();
                writer.TypeBegin("betterAssetMenu.FindItCategory");
                writer.PropertyName("id");
                writer.Write(category.Key.Category);
                writer.PropertyName("name");
                writer.Write(category.Key.CategoryName);
                writer.PropertyName("icon");
                WriteNullable(writer, FindItBridge.IconOf(false, category.Key.Category));
                writer.PropertyName("subCategories");
                writer.ArrayBegin(subCategories.Count);
                foreach (var sub in subCategories)
                {
                    writer.TypeBegin("betterAssetMenu.FindItSubCategory");
                    writer.PropertyName("id");
                    writer.Write(sub.Key.SubCategory);
                    writer.PropertyName("name");
                    writer.Write(sub.Key.SubCategoryName);
                    writer.PropertyName("icon");
                    WriteNullable(writer, FindItBridge.IconOf(true, sub.Key.SubCategory));
                    writer.PropertyName("count");
                    writer.Write(sub.Count());
                    writer.TypeEnd();
                }
                writer.ArrayEnd();
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }

        // A subcategory's assets, each written by vanilla's BindAsset (the same
        // shape as toolbar.assets), so the UI treats them like toolbar assets.
        private void WriteFindItAssets(IJsonWriter writer, int subCategory)
        {
            if (!_findItBySubCategory.TryGetValue(subCategory, out var entities))
            {
                writer.WriteEmptyArray();
                return;
            }
            writer.ArrayBegin(entities.Count);
            foreach (var entity in entities) WriteAsset(writer, entity);
            writer.ArrayEnd();
        }

        private static void WriteNullable(IJsonWriter writer, string value)
        {
            if (value != null) writer.Write(value);
            else writer.WriteNull();
        }
    }
}
