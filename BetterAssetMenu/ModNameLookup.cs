using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Colossal.Json;
using Colossal.PSI.Environment;
using Game.SceneFlow;

namespace BetterAssetMenu
{
    // Snapshot of source mod titles. ModManager contains executable mods only,
    // so asset-only packs also need the locally synced Paradox Mods cache.
    internal static class ModNameLookup
    {
        private static bool _loggedNativeFailure;
        private static bool _loggedCacheFailure;

        internal static Dictionary<string, string> Build()
        {
            var names = new Dictionary<string, string>(StringComparer.Ordinal);
            try
            {
                var manager = GameManager.instance?.modManager;
                if (manager != null)
                    foreach (var mod in manager)
                    {
                        try
                        {
                            if (mod.asset == null) continue;
                            var meta = mod.asset.GetMeta();
                            if (!string.IsNullOrWhiteSpace(meta.platformID) &&
                                !string.IsNullOrWhiteSpace(meta.displayName))
                                names[meta.platformID] = meta.displayName;
                        }
                        catch (Exception e)
                        {
                            LogNativeFailure(e);
                        }
                    }
            }
            catch (Exception e)
            {
                LogNativeFailure(e);
            }

            // No SDK/network requests and no blocking async work inside a binding.
            // Missing/unreadable/malformed caches only remove the optional title.
            try
            {
                AddCachedNames(names, Path.Combine(EnvPath.kCacheDataPath, "Mods", "pdx_mods_cache.json"));
            }
            catch (Exception e)
            {
                if (!_loggedCacheFailure)
                {
                    _loggedCacheFailure = true;
                    Mod.LOG.Warn(e, "Could not read cached Paradox Mods names; unresolved mod titles are left out (logged once)");
                }
            }
            return names;
        }

        internal static void AddCachedNames(Dictionary<string, string> names, string path)
        {
            if (!File.Exists(path)) return;
            var root = JSON.Load(File.ReadAllText(path)) as ProxyObject;
            if (root == null || !root.TryGetValue("items", out var items) || !(items is ProxyArray array)) return;
            foreach (var value in array)
            {
                if (!(value is ProxyObject item) || !item.TryGetValue("id", out var idValue) ||
                    !(idValue is ProxyString || idValue is ProxyNumber) ||
                    !item.TryGetValue("displayName", out var nameValue) || !(nameValue is ProxyString)) continue;
                var id = idValue.ToString(CultureInfo.InvariantCulture);
                var name = nameValue.ToString(CultureInfo.InvariantCulture);
                if (!string.IsNullOrWhiteSpace(id) && !string.IsNullOrWhiteSpace(name) && !names.ContainsKey(id))
                    names.Add(id, name);
            }
        }

        private static void LogNativeFailure(Exception e)
        {
            if (_loggedNativeFailure) return;
            _loggedNativeFailure = true;
            Mod.LOG.Warn(e, "Could not read a native mod title; falling back to cached Paradox Mods names (logged once)");
        }
    }
}
