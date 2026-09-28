using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Reflection;
using Game.Prefabs;
using Game.SceneFlow;
using Unity.Entities;

namespace RadialMenu
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
            public string SubCategoryName;
        }

        private const string kAssemblyName = "FindIt";
        private const string kUtilType = "FindIt.Utilities.FindItUtil";
        // PrefabCategory.Any / PrefabSubCategory.Any: the list of everything.
        private const int kAny = -1;

        private static bool? _enabled;
        private static bool _failed;
        private static PropertyInfo _categorizedPrefabs;
        private static PropertyInfo _isReady;
        private static Type _categoryType;
        private static Type _subCategoryType;
        private static Func<object, PrefabBase> _getPrefab;
        private static Func<object, int> _getCategory;
        private static Func<object, int> _getSubCategory;

        /// <summary>Find It is enabled in the playset (as Find It itself detects other mods).</summary>
        internal static bool IsEnabled =>
            _enabled ??= GameManager.instance?.modManager?.ListModsEnabled().Any(x => x.StartsWith(kAssemblyName + ", ")) ?? false;

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
                var result = new List<Entry>();
                foreach (var index in all)
                {
                    var prefab = _getPrefab(index);
                    if (prefab == null || !prefabSystem.TryGetEntity(prefab, out var entity)) continue;
                    var subCategory = _getSubCategory(index);
                    if (!names.TryGetValue(subCategory, out var name))
                        names[subCategory] = name = Enum.GetName(_subCategoryType, subCategory) ?? subCategory.ToString();
                    result.Add(new Entry
                    {
                        Entity = entity,
                        Category = _getCategory(index),
                        SubCategory = subCategory,
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
                var message = $"Find It integration off: {what} (Find It {Version}). The radial menu works without it.";
                if (e != null) Mod.LOG.Warn(e, message);
                else Mod.LOG.Warn(message);
            }
            return false;
        }
    }
}
