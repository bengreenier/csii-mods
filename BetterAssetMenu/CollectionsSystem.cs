using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Colossal.PSI.Environment;
using Colossal.Serialization.Entities;
using Game;
using Game.Prefabs;
using Game.Serialization;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// The menu's collections: named lists of assets the player makes. City
    /// collections are stored in each save, like <see cref="FavoritesSystem"/>;
    /// global ones in a file in the user data folder
    /// (ModsData/BetterAssetMenu/collections.txt), shared by every city.
    /// </summary>
    /// <remarks>
    /// The same save rules as <see cref="FavoritesSystem"/> apply: never rename
    /// this class, its namespace or the assembly (the save block is keyed by
    /// the assembly-qualified type name), and Deserialize must always consume
    /// its block exactly. A save from before collections has no block for this
    /// system, and then SetDefaults runs. Assets are kept as PrefabIDs; IDs that
    /// don't resolve (an uninstalled asset mod) are kept and come back if it's
    /// reinstalled. See docs/game-internals.md.
    /// </remarks>
    public partial class CollectionsSystem : GameSystemBase, IDefaultSerializable, ISerializable
    {
        // Bump when the payload layout changes; Deserialize must keep reading
        // every older version.
        private const int kFormatVersion = 1;
        public const int kMaxNameLength = 40;
        // Ids carry their scope, so the UI and the triggers never need it apart.
        public const string kCityPrefix = "c";
        public const string kGlobalPrefix = "g";

        public class Collection
        {
            public string Id;
            public string Name;
            public readonly List<PrefabID> Assets = new List<PrefabID>();
            public bool IsGlobal => Id.StartsWith(kGlobalPrefix, StringComparison.Ordinal);
        }

        private readonly List<Collection> _city = new List<Collection>();
        private readonly List<Collection> _global = new List<Collection>();
        private PrefabSystem _prefabSystem;
        private string _globalPath;

        /// <summary>
        /// Bumped whenever any collection changes. Polled
        /// (BetterAssetMenuUISystem), as for favorites.
        /// </summary>
        public int Revision { get; private set; }

        protected override void OnCreate()
        {
            base.OnCreate();
            _prefabSystem = World.GetOrCreateSystemManaged<PrefabSystem>();
            World.GetExistingSystemManaged<SerializerSystem>()?.systemLibrary?.SetDirty();
            _globalPath = Path.Combine(EnvPath.kUserDataPath, "ModsData", nameof(BetterAssetMenu), "collections.txt");
            LoadGlobal();
        }

        protected override void OnUpdate()
        {
        }

        /// <summary>City collections, then global ones, each in the order made.</summary>
        public IEnumerable<Collection> All => _city.Concat(_global);

        /// <summary>The collection's assets that resolve to a loaded prefab, in the order added.</summary>
        public IEnumerable<Entity> GetResolvedAssets(Collection collection)
        {
            foreach (var id in collection.Assets)
            {
                if (_prefabSystem.TryGetPrefab(id, out var prefab) && _prefabSystem.TryGetEntity(prefab, out var entity))
                    yield return entity;
            }
        }

        /// <summary>
        /// Makes a collection, with `firstAsset` in it unless that's
        /// Entity.Null. Refused for an empty name or one already taken (any
        /// scope, ignoring case): names are what the player searches by.
        /// </summary>
        public void Create(string name, bool global, Entity firstAsset)
        {
            name = CleanName(name);
            if (name == null || IsNameTaken(name, null))
            {
                Mod.LOG.Info($"Collection not created: empty or taken name \"{name}\"");
                return;
            }
            var collection = new Collection
            {
                Id = (global ? kGlobalPrefix : kCityPrefix) + Guid.NewGuid().ToString("N"),
                Name = name,
            };
            if (firstAsset != Entity.Null && TryGetId(firstAsset, out var id)) collection.Assets.Add(id);
            (global ? _global : _city).Add(collection);
            Changed(collection);
        }

        public void Rename(string collectionId, string name)
        {
            var collection = Find(collectionId);
            name = CleanName(name);
            if (collection == null || name == null || IsNameTaken(name, collection)) return;
            collection.Name = name;
            Changed(collection);
        }

        public void Delete(string collectionId)
        {
            var collection = Find(collectionId);
            if (collection == null) return;
            (collection.IsGlobal ? _global : _city).Remove(collection);
            Changed(collection);
        }

        public void Add(string collectionId, Entity prefabEntity)
        {
            var collection = Find(collectionId);
            if (collection == null || !TryGetId(prefabEntity, out var id) || collection.Assets.Contains(id)) return;
            collection.Assets.Add(id);
            Changed(collection);
        }

        public void Remove(string collectionId, Entity prefabEntity)
        {
            var collection = Find(collectionId);
            if (collection != null && TryGetId(prefabEntity, out var id) && collection.Assets.Remove(id))
                Changed(collection);
        }

        /// <summary>
        /// Part of "Remove Better Asset Menu data from this city": forgets the
        /// city's collections. Global ones aren't the city's, and stay.
        /// </summary>
        public void ResetCityData()
        {
            _city.Clear();
            Revision++;
        }

        private Collection Find(string collectionId) =>
            collectionId == null ? null : All.FirstOrDefault(c => c.Id == collectionId);

        private bool IsNameTaken(string name, Collection except) =>
            All.Any(c => c != except && string.Equals(c.Name, name, StringComparison.OrdinalIgnoreCase));

        // Trimmed, capped and on one line; null if nothing's left.
        private static string CleanName(string name)
        {
            if (name == null) return null;
            name = string.Join(" ", name.Split((char[])null, StringSplitOptions.RemoveEmptyEntries));
            if (name.Length > kMaxNameLength) name = name.Substring(0, kMaxNameLength).TrimEnd();
            return name.Length == 0 ? null : name;
        }

        private void Changed(Collection collection)
        {
            Revision++;
            if (collection.IsGlobal) SaveGlobal();
        }

        private bool TryGetId(Entity prefabEntity, out PrefabID id)
        {
            if (_prefabSystem.TryGetPrefab(prefabEntity, out PrefabBase prefab))
            {
                id = prefab.GetPrefabID();
                return true;
            }
            id = default;
            return false;
        }

        // ---- Text format (save payload and global file) ---------------------
        //
        // v1: one line per collection header and per asset:
        //   "#<id>/<name>"  starts a collection; id and name URL-escaped
        //   "<segment>"     an asset of the collection above, as
        //                   PrefabID.ToUrlSegment() (see FavoritesSystem)
        // Unreadable lines are skipped, never the whole payload.

        private static string Write(List<Collection> collections)
        {
            var lines = new List<string>();
            foreach (var c in collections)
            {
                lines.Add("#" + Uri.EscapeDataString(c.Id) + "/" + Uri.EscapeDataString(c.Name));
                foreach (var id in c.Assets) lines.Add(id.ToUrlSegment());
            }
            return string.Join("\n", lines);
        }

        // Reads `payload` into `into`, keeping only collections whose id has
        // `prefix` (a city id in the global file, or the reverse, is dropped).
        private static int Read(string payload, string prefix, List<Collection> into)
        {
            var skipped = 0;
            Collection current = null;
            foreach (var line in (payload ?? string.Empty).Split('\n'))
            {
                if (line.Length == 0) continue;
                if (line[0] == '#')
                {
                    current = null;
                    var slash = line.IndexOf('/');
                    if (slash < 0) { skipped++; continue; }
                    var id = Uri.UnescapeDataString(line.Substring(1, slash - 1));
                    var name = CleanName(Uri.UnescapeDataString(line.Substring(slash + 1)));
                    if (!id.StartsWith(prefix, StringComparison.Ordinal) || name == null || into.Any(c => c.Id == id))
                    {
                        skipped++;
                        continue;
                    }
                    current = new Collection { Id = id, Name = name };
                    into.Add(current);
                }
                else if (current != null && FavoritesSystem.TryParseUrlSegment(line, out var asset))
                {
                    if (!current.Assets.Contains(asset)) current.Assets.Add(asset);
                }
                else skipped++;
            }
            return skipped;
        }

        // ---- Global collections: a file ------------------------------------

        private void LoadGlobal()
        {
            _global.Clear();
            try
            {
                // A write cut short after the temporary file was complete
                // leaves only that (see SaveGlobal).
                var path = File.Exists(_globalPath) ? _globalPath : _globalPath + ".tmp";
                if (!File.Exists(path)) return;
                var lines = File.ReadAllText(path);
                var newline = lines.IndexOf('\n');
                var header = newline < 0 ? lines : lines.Substring(0, newline);
                if (!int.TryParse(header.Trim(), out var version) || version < 1 || version > kFormatVersion)
                {
                    Mod.LOG.Warn($"Global collections not loaded: unknown format \"{header}\"");
                    return;
                }
                var skipped = Read(newline < 0 ? string.Empty : lines.Substring(newline + 1), kGlobalPrefix, _global);
                Mod.LOG.Info($"Global collections loaded: {_global.Count}" + (skipped > 0 ? $" ({skipped} lines unreadable, skipped)" : ""));
            }
            catch (Exception e)
            {
                _global.Clear();
                Mod.LOG.Error(e, $"Global collections could not be read from {_globalPath}; starting empty");
            }
            finally
            {
                Revision++;
            }
        }

        // First line: the format version. Written to a temporary file first,
        // then swapped in, so a failed write never leaves half a file behind.
        private void SaveGlobal()
        {
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_globalPath));
                var temp = _globalPath + ".tmp";
                File.WriteAllText(temp, kFormatVersion + "\n" + Write(_global));
                if (File.Exists(_globalPath)) File.Replace(temp, _globalPath, null);
                else File.Move(temp, _globalPath);
            }
            catch (Exception e)
            {
                Mod.LOG.Error(e, $"Global collections could not be written to {_globalPath}");
            }
        }

        // ---- City collections: the save -------------------------------------

        public void SetDefaults(Context context)
        {
            _city.Clear();
            Revision++;
        }

        // Block layout, for every format version: one int (the version) and one
        // string, as FavoritesSystem's (see there for why).
        public void Serialize<TWriter>(TWriter writer) where TWriter : IWriter
        {
            writer.Write(kFormatVersion);
            writer.Write(Write(_city));
            Mod.LOG.Info($"City collections saved: {_city.Count}");
        }

        public void Deserialize<TReader>(TReader reader) where TReader : IReader
        {
            _city.Clear();
            reader.Read(out int version);
            reader.Read(out string payload);
            try
            {
                if (version < 1 || version > kFormatVersion)
                {
                    Mod.LOG.Warn($"City collections not loaded: unknown format version {version}");
                    return;
                }
                var skipped = Read(payload, kCityPrefix, _city);
                Mod.LOG.Info($"City collections loaded: {_city.Count}" + (skipped > 0 ? $" ({skipped} lines unreadable, skipped)" : ""));
            }
            catch (Exception e)
            {
                _city.Clear();
                Mod.LOG.Error(e, "City collections could not be read from the save; starting empty");
            }
            finally
            {
                Revision++;
            }
        }
    }
}
