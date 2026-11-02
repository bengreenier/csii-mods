using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using Colossal.UI.Binding;
using Game.Prefabs;
using Game.SceneFlow;
using Game.UI;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// Reads Find It's prefab index (FindIt.Utilities.FindItUtil.CategorizedPrefabs)
    /// at runtime, for the "Use Find It's catalogue" integration. Find It is
    /// optional and has no public API (or licence to copy from), so this only
    /// reads its public static state through reflection, with no compile-time
    /// reference. Anything unexpected turns the integration off with one warning.
    /// Every member used is listed in docs/game-internals.md, "Find It".
    /// </summary>
    internal static class FindItBridge
    {
        internal struct Entry
        {
            public Entity Entity;
            // Find It's PrefabCategory / PrefabSubCategory values and the
            // subcategory's enum name, e.g. 500 / 50x / "Props_Decals".
            public int Category;
            public int SubCategory;
            public string CategoryName;
            public string SubCategoryName;
        }

        private const string kAssemblyName = "FindIt";
        private const string kUtilType = "FindIt.Utilities.FindItUtil";
        // PrefabCategory.Any / PrefabSubCategory.Any: the list of everything.
        private const int kAny = -1;
        private const string kUISystemType = "FindIt.Systems.FindItUISystem";
        private const string kModType = "FindIt.Mod";
        internal const string kPickerToolId = "FindIt.Picker";
        private const string kIconTrigger = "FindItIconToggled";
        private const string kPanelBinding = "ShowFindItPanel";
        private const string kLockedBinding = "IsWindowLocked";

        private static bool? _enabled;
        private static bool _failed;
        private static bool _iconButtonHooked;
        private static bool? _pickerBound;
        private static object _findItSettings;
        private static PropertyInfo _openPanelOnPicker;
        private static object _pickerPanelWas;
        private static bool _pickerPanelSuppressed;
        private static PropertyInfo _categorizedPrefabs;
        private static PropertyInfo _isReady;
        private static Type _categoryType;
        private static Type _subCategoryType;
        private static Func<object, PrefabBase> _getPrefab;
        private static Func<object, int> _getCategory;
        private static Func<object, int> _getSubCategory;

        /// <summary>
        /// Find It is enabled in the playset (as Find It itself detects other
        /// mods). Mods load one by one, and Find It may load after us, so this
        /// is only cached once Settle() is called after all have loaded;
        /// before that it's checked again each time.
        /// </summary>
        internal static bool IsEnabled => _enabled ?? Detect();

        /// <summary>Caches IsEnabled; call once every mod has loaded.</summary>
        internal static void Settle() => _enabled ??= Detect();

        private static bool Detect() =>
            GameManager.instance?.modManager?.ListModsEnabled().Any(x => x.StartsWith(kAssemblyName + ", ")) ?? false;

        /// <summary>Enabled, and its index could be read so far.</summary>
        internal static bool IsAvailable => IsEnabled && !_failed;

        internal static string Version { get; private set; } = "?";

        /// <summary>Find It has finished (re)indexing.</summary>
        internal static bool IsReady()
        {
            if (!Bind()) return false;
            try
            {
                return (bool)_isReady.GetValue(null);
            }
            catch (Exception e)
            {
                Fail(e, "reading IsReady");
                return false;
            }
        }

        /// <summary>Every entry in Find It's index, or null if it can't be read.</summary>
        internal static List<Entry> ReadIndex(PrefabSystem prefabSystem)
        {
            if (!Bind()) return null;
            try
            {
                var byCategory = (IDictionary)_categorizedPrefabs.GetValue(null);
                if (!(byCategory?[Enum.ToObject(_categoryType, kAny)] is IDictionary bySubCategory) ||
                    !(bySubCategory[Enum.ToObject(_subCategoryType, kAny)] is IEnumerable all))
                    return new List<Entry>();

                var names = new Dictionary<int, string>();
                var categoryNames = new Dictionary<int, string>();
                var result = new List<Entry>();
                foreach (var index in all)
                {
                    var prefab = _getPrefab(index);
                    if (prefab == null || !prefabSystem.TryGetEntity(prefab, out var entity)) continue;
                    var subCategory = _getSubCategory(index);
                    var category = _getCategory(index);
                    if (!names.TryGetValue(subCategory, out var name))
                        names[subCategory] = name = Enum.GetName(_subCategoryType, subCategory) ?? subCategory.ToString();
                    if (!categoryNames.TryGetValue(category, out var categoryName))
                        categoryNames[category] = categoryName = Enum.GetName(_categoryType, category) ?? category.ToString();
                    result.Add(new Entry
                    {
                        Entity = entity,
                        Category = category,
                        SubCategory = subCategory,
                        CategoryName = categoryName,
                        SubCategoryName = name,
                    });
                }
                return result;
            }
            catch (Exception e)
            {
                Fail(e, "reading the index");
                return null;
            }
        }

        /// <summary>
        /// The icon Find It shows for a category or subcategory (its
        /// CategoryIconAttribute), or null. Some are coui://uil or
        /// coui://findit paths, which Find It itself serves.
        /// </summary>
        internal static string IconOf(bool subCategory, int value)
        {
            if (!Bind()) return null;
            var type = subCategory ? _subCategoryType : _categoryType;
            try
            {
                var field = type.GetField(Enum.GetName(type, value) ?? "", BindingFlags.Public | BindingFlags.Static);
                var attribute = field?.GetCustomAttributes(false).FirstOrDefault(a => a.GetType().Name == "CategoryIconAttribute");
                return attribute?.GetType().GetProperty("Icon")?.GetValue(attribute) as string;
            }
            catch (Exception)
            {
                // Only an icon: the entry still works without it.
                return null;
            }
        }

        /// <summary>
        /// Routes Find It's toolbar magnifying glass through <paramref name="open"/>
        /// (false: not handled). Its own behaviour still runs whenever its panel is
        /// open or locked, or open declines. Find It has no hook for this, so it
        /// swaps the callback of its FindItIconToggled trigger; if anything's
        /// missing the button simply stays Find It's, and the catalogue is
        /// unaffected. See docs/game-internals.md, "Find It".
        /// </summary>
        internal static void HookIconButton(Func<bool> open)
        {
            if (_iconButtonHooked || !IsEnabled) return;
            try
            {
                var assembly = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == kAssemblyName);
                var systemType = assembly?.GetType(kUISystemType);
                var system = systemType == null ? null : World.DefaultGameObjectInjectionWorld?.GetExistingSystemManaged(systemType);
                // Created with the world, so a miss here can be retried next load.
                if (system == null) return;

                _iconButtonHooked = true;
                var bindings = typeof(UISystemBase).GetField("m_Bindings", BindingFlags.NonPublic | BindingFlags.Instance)
                    ?.GetValue(system) as List<IBinding>;
                var callback = typeof(TriggerBinding).GetField("m_Callback", BindingFlags.NonPublic | BindingFlags.Instance);
                var trigger = bindings?.OfType<TriggerBinding>().FirstOrDefault(b => b.name == kIconTrigger);
                var panel = bindings?.OfType<ValueBinding<bool>>().FirstOrDefault(b => b.name == kPanelBinding);
                var locked = bindings?.OfType<ValueBinding<bool>>().FirstOrDefault(b => b.name == kLockedBinding);
                if (callback == null || trigger == null || panel == null || locked == null)
                {
                    Mod.LOG.Warn("Find It's button can't be redirected: its trigger or panel state wasn't found. It keeps opening Find It.");
                    return;
                }

                var original = (Action)callback.GetValue(trigger);
                callback.SetValue(trigger, (Action)(() =>
                {
                    if (panel.value || locked.value || !open()) original();
                }));
            }
            catch (Exception e)
            {
                Mod.LOG.Warn(e, "Find It's button can't be redirected. It keeps opening Find It.");
            }
        }

        /// <summary>
        /// Finds what the Picker override needs: Find It's OpenPanelOnPicker option.
        /// False if it's missing, and the Picker then stays Find It's. See
        /// docs/game-internals.md, "Find It".
        /// </summary>
        internal static bool BindPicker()
        {
            if (_pickerBound.HasValue) return _pickerBound.Value;
            if (!IsEnabled) return false;
            try
            {
                var assembly = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == kAssemblyName);
                _findItSettings = assembly?.GetType(kModType)?.GetProperty("Settings", BindingFlags.Public | BindingFlags.Static)?.GetValue(null);
                // Find It creates its settings while loading; try again later.
                if (_findItSettings == null) return false;
                _openPanelOnPicker = _findItSettings.GetType().GetProperty("OpenPanelOnPicker", BindingFlags.Public | BindingFlags.Instance);
                _pickerBound = _openPanelOnPicker != null;
                if (!_pickerBound.Value) Mod.LOG.Warn("Find It's picker can't be redirected: OpenPanelOnPicker wasn't found. It keeps opening Find It.");
            }
            catch (Exception e)
            {
                _pickerBound = false;
                Mod.LOG.Warn(e, "Find It's picker can't be redirected. It keeps opening Find It.");
            }
            return _pickerBound ?? false;
        }

        /// <summary>
        /// Turns Find It's OpenPanelOnPicker off while the override is in use, and
        /// back to what it was afterwards. Only in memory, for as long as the
        /// Picker is active: Find It's panel is closed then, so nothing saves it.
        /// </summary>
        internal static void SuppressPickerPanel(bool suppress)
        {
            if (suppress == _pickerPanelSuppressed || _pickerBound != true) return;
            if (suppress)
            {
                _pickerPanelWas = _openPanelOnPicker.GetValue(_findItSettings);
                _openPanelOnPicker.SetValue(_findItSettings, false);
            }
            else
            {
                _openPanelOnPicker.SetValue(_findItSettings, _pickerPanelWas);
            }
            _pickerPanelSuppressed = suppress;
        }

        // Resolves the members once. False (and the integration off) if Find
        // It isn't there or doesn't look as expected.
        private static bool Bind()
        {
            if (_failed || !IsEnabled) return false;
            if (_isReady != null) return true;
            try
            {
                var assembly = AppDomain.CurrentDomain.GetAssemblies().FirstOrDefault(a => a.GetName().Name == kAssemblyName);
                if (assembly == null) return Fail(null, "assembly not loaded");
                Version = assembly.GetName().Version?.ToString() ?? "?";

                var util = assembly.GetType(kUtilType);
                _categorizedPrefabs = util?.GetProperty("CategorizedPrefabs", BindingFlags.Public | BindingFlags.Static);
                var isReady = util?.GetProperty("IsReady", BindingFlags.Public | BindingFlags.Static);
                var dictionaryArgs = _categorizedPrefabs?.PropertyType.GetGenericArguments();
                if (isReady == null || dictionaryArgs == null || dictionaryArgs.Length != 2)
                    return Fail(null, "FindItUtil.CategorizedPrefabs / IsReady not found");
                _categoryType = dictionaryArgs[0];
                _subCategoryType = dictionaryArgs[1].GetGenericArguments().FirstOrDefault();
                var listType = dictionaryArgs[1].GetGenericArguments().ElementAtOrDefault(1);
                var indexType = listType?.GetInterfaces()
                    .FirstOrDefault(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IEnumerable<>))
                    ?.GetGenericArguments()[0];
                if (_subCategoryType == null || indexType == null)
                    return Fail(null, "unexpected CategorizedPrefabs type");

                _getPrefab = Getter<PrefabBase>(indexType, "Prefab");
                _getCategory = EnumGetter(indexType, "Category");
                _getSubCategory = EnumGetter(indexType, "SubCategory");
                _isReady = isReady;
                return true;
            }
            catch (Exception e)
            {
                return Fail(e, "binding");
            }
        }

        // Compiled property getters, so reading tens of thousands of entries
        // doesn't go through reflection each time.
        private static Func<object, T> Getter<T>(Type type, string name)
        {
            var property = type.GetProperty(name, BindingFlags.Public | BindingFlags.Instance)
                ?? throw new MissingMemberException(type.FullName, name);
            var obj = Expression.Parameter(typeof(object));
            var body = Expression.Convert(Expression.Property(Expression.Convert(obj, type), property), typeof(T));
            return Expression.Lambda<Func<object, T>>(body, obj).Compile();
        }

        private static Func<object, int> EnumGetter(Type type, string name)
        {
            var property = type.GetProperty(name, BindingFlags.Public | BindingFlags.Instance)
                ?? throw new MissingMemberException(type.FullName, name);
            var obj = Expression.Parameter(typeof(object));
            var value = Expression.Property(Expression.Convert(obj, type), property);
            return Expression.Lambda<Func<object, int>>(Expression.Convert(value, typeof(int)), obj).Compile();
        }

        private static bool Fail(Exception e, string what)
        {
            if (!_failed)
            {
                _failed = true;
                var message = $"Find It integration off: {what} (Find It {Version}). The menu works without it.";
                if (e != null) Mod.LOG.Warn(e, message);
                else Mod.LOG.Warn(message);
            }
            return false;
        }
    }
}
