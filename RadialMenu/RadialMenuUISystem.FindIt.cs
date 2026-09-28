using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using Colossal.UI.Binding;
using Game.Prefabs;
using Game.Tools;
using Unity.Entities;

namespace RadialMenu
{
    /// <summary>
    /// "Use Find It's catalogue": a snapshot of Find It's prefab index
    /// (FindItBridge), taken once Find It has finished indexing after a load,
    /// and sent to the UI like vanilla's toolbar: the category tree as a value,
    /// the assets as a map by subcategory (only subscribed keys are written).
    /// </summary>
    public partial class RadialMenuUISystem
    {
        private List<FindItBridge.Entry> _findItEntries;
        private Dictionary<int, List<Entity>> _findItBySubCategory = new Dictionary<int, List<Entity>>();
        private Dictionary<Entity, string> _findItCategoryByEntity = new Dictionary<Entity, string>();
        private RawValueBinding _findItCategories;
        private RawMapBinding<int> _findItAssets;
        private ValueBinding<bool> _findItActive;

        /// <summary>The integration is wanted and possible right now.</summary>
        internal static bool FindItActive => (Mod.Settings?.UseFindIt ?? true) && FindItBridge.IsAvailable;

        private void CreateFindItBindings()
        {
            AddBinding(_findItActive = new ValueBinding<bool>(kGroup, "findItActive", false));
            AddBinding(_findItCategories = new RawValueBinding(kGroup, "findItCategories", WriteFindItCategories));
            AddBinding(_findItAssets = new RawMapBinding<int>(kGroup, "findItAssets", WriteFindItAssets));
            // Places any prefab directly, as Find It does: for assets that
            // aren't in the vanilla toolbar (toolbar.selectAsset can't).
            var toolSystem = World.GetOrCreateSystemManaged<ToolSystem>();
            AddBinding(new TriggerBinding<Entity>(kGroup, "activatePrefab", entity =>
            {
                if (!_prefabSystem.TryGetPrefab(entity, out PrefabBase prefab)) return;
                toolSystem.ActivatePrefabTool(prefab);
                RadialSelection.Mark(toolSystem);
            }));
        }

        // A new load gets a fresh snapshot (Find It re-indexes on each load).
        private void ResetFindIt()
        {
            _findItEntries = null;
            _findItBySubCategory = new Dictionary<int, List<Entity>>();
            _findItCategoryByEntity = new Dictionary<Entity, string>();
        }

        // Called every update: reads the index once Find It is ready, and
        // tells the UI whether the integration is on.
        private void UpdateFindIt()
        {
            var active = FindItActive && _findItEntries != null;
            if (_findItActive.value != active)
            {
                _findItActive.Update(active);
                // assetMeta includes Find It's catalogue only while it's on.
                RefreshAssetMeta();
            }

            if (_findItEntries != null || !FindItActive || !FindItBridge.IsReady()) return;

            var stopwatch = Stopwatch.StartNew();
            var entries = FindItBridge.ReadIndex(_prefabSystem);
            if (entries == null) return;
            _findItEntries = entries;
            _findItBySubCategory = entries
                .GroupBy(e => e.SubCategory)
                .ToDictionary(g => g.Key, g => g.Select(e => e.Entity).ToList());
            _findItCategoryByEntity = new Dictionary<Entity, string>();
            foreach (var entry in entries) _findItCategoryByEntity[entry.Entity] = entry.SubCategoryName;
            Mod.LOG.Info($"Find It {FindItBridge.Version}: read {entries.Count} catalogue entries " +
                         $"({_findItBySubCategory.Count} subcategories) in {stopwatch.ElapsedMilliseconds} ms");
            _findItCategories.Update();
            _findItAssets.UpdateAll();
            _findItActive.Update(FindItActive);
            RefreshAssetMeta();
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
                writer.TypeBegin("radialMenu.FindItCategory");
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
                    writer.TypeBegin("radialMenu.FindItSubCategory");
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
            foreach (var entity in entities)
            {
                _toolbarUISystem.BindAsset(writer, entity,
                    _uniqueAssetTrackingSystem.IsUniqueAsset(entity),
                    _uniqueAssetTrackingSystem.IsPlacedUniqueAsset(entity));
            }
            writer.ArrayEnd();
        }

        private static void WriteNullable(IJsonWriter writer, string value)
        {
            if (value != null) writer.Write(value);
            else writer.WriteNull();
        }
    }
}
