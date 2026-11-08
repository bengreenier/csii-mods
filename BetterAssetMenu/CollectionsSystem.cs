using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Colossal.Json;
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
    /// (ModsData/BetterAssetMenu/collections.json), shared by every city.
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
        // The global file exists but couldn't be read (bad JSON, or a newer
        // version's): never overwrite it, or its collections would be lost.
        private bool _keepGlobalFile;

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
            _globalPath = Path.Combine(EnvPath.kUserDataPath, "ModsData", nameof(BetterAssetMenu), "collections.json");
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

        // ---- Format: JSON, in the save and in the global file ----------------
        //
        // {
        //   "version": 1,
        //   "collections": [
        //     { "id": "c...", "name": "Parks",
        //       "assets": [ { "type": "BuildingPrefab", "name": "...", "hash": "..." } ] }
        //   ]
        // }
        // The same document is the save block's string (city collections, "c"
        // ids) and the global file (global ones, "g" ids). Read and written
        // with the game's Colossal.Json (public fields). "hash" is empty for
        // prefabs without one. Unreadable collections or assets are skipped,
        // never the whole document.

        public class CollectionsDocument
        {
            public int version;
            public List<CollectionEntry> collections = new List<CollectionEntry>();
        }

        public class CollectionEntry
        {
            public string id;
            public string name;
            public List<AssetEntry> assets = new List<AssetEntry>();
        }

        public class AssetEntry
        {
            public string type;
            public string name;
            public string hash;
        }

        private static string ToJson(List<Collection> collections)
        {
            var document = new CollectionsDocument { version = kFormatVersion };
            foreach (var c in collections)
            {
                var entry = new CollectionEntry { id = c.Id, name = c.Name };
                foreach (var id in c.Assets) entry.assets.Add(ToEntry(id));
                document.collections.Add(entry);
            }
            return JSON.Dump(document);
        }

        // Reads `json` into `into`, keeping only collections whose id has
        // `prefix` (a city id in the global file, or the reverse, is dropped).
        // Returns how many entries were skipped, or -1 for an unknown version
        // (then nothing is read). Throws on JSON that doesn't parse.
        private static int FromJson(string json, string prefix, List<Collection> into, out int version)
        {
            var document = JSON.MakeInto<CollectionsDocument>(JSON.Load(json));
            version = document?.version ?? 0;
            if (document == null || version < 1 || version > kFormatVersion) return -1;
            var skipped = 0;
            foreach (var entry in document.collections ?? new List<CollectionEntry>())
            {
                var name = CleanName(entry?.name);
                if (entry?.id == null || !entry.id.StartsWith(prefix, StringComparison.Ordinal) || name == null ||
                    into.Any(c => c.Id == entry.id))
                {
                    skipped++;
                    continue;
                }
                var collection = new Collection { Id = entry.id, Name = name };
                foreach (var asset in entry.assets ?? new List<AssetEntry>())
                {
                    if (!TryFromEntry(asset, out var id)) skipped++;
                    else if (!collection.Assets.Contains(id)) collection.Assets.Add(id);
                }
                into.Add(collection);
            }
            return skipped;
        }

        // PrefabID keeps its parts private; ToUrlSegment is its one public
        // form ("<type>/<name>[/<hash>]", type and name URL-escaped).
        private static AssetEntry ToEntry(PrefabID id)
        {
            var parts = id.ToUrlSegment().Split('/');
            return new AssetEntry
            {
                type = Uri.UnescapeDataString(parts[0]),
                name = Uri.UnescapeDataString(parts[1]),
                hash = parts.Length > 2 ? parts[2] : string.Empty,
            };
        }

        private static bool TryFromEntry(AssetEntry asset, out PrefabID id)
        {
            id = default;
            if (asset == null || string.IsNullOrEmpty(asset.type) || string.IsNullOrEmpty(asset.name)) return false;
            var hash = default(Colossal.Hash128);
            if (!string.IsNullOrEmpty(asset.hash) && !Colossal.Hash128.TryParse(asset.hash, out hash)) return false;
            id = new PrefabID(asset.type, asset.name, hash);
            return true;
        }

        private static string Skipped(int skipped) => skipped > 0 ? $" ({skipped} entries unreadable, skipped)" : "";

        // ---- Global collections: the file -------------------------------------

        private void LoadGlobal()
        {
            _global.Clear();
            _keepGlobalFile = false;
            try
            {
                // A write cut short after the temporary file was complete
                // leaves only that (see SaveGlobal).
                var path = File.Exists(_globalPath) ? _globalPath : _globalPath + ".tmp";
                if (!File.Exists(path)) return;
                var skipped = FromJson(File.ReadAllText(path), kGlobalPrefix, _global, out var version);
                if (skipped < 0)
                {
                    _keepGlobalFile = true;
                    Mod.LOG.Warn($"Global collections not loaded: unknown format version {version}; the file is left as is");
                    return;
                }
                Mod.LOG.Info($"Global collections loaded: {_global.Count}" + Skipped(skipped));
            }
            catch (Exception e)
            {
                _global.Clear();
                _keepGlobalFile = true;
                Mod.LOG.Error(e, $"Global collections could not be read from {_globalPath}; starting empty, the file is left as is");
            }
            finally
            {
                Revision++;
            }
        }

        // Written to a temporary file first, then swapped in, so a failed
        // write never leaves half a file behind.
        private void SaveGlobal()
        {
            if (_keepGlobalFile)
            {
                Mod.LOG.Warn($"Global collections not saved: {_globalPath} couldn't be read at start, so it's left as is");
                return;
            }
            try
            {
                Directory.CreateDirectory(Path.GetDirectoryName(_globalPath));
                var temp = _globalPath + ".tmp";
                File.WriteAllText(temp, ToJson(_global));
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
        // string (the JSON document), as FavoritesSystem's (see there for why).
        // The int repeats the document's own version, so the block's version is
        // known without parsing.
        public void Serialize<TWriter>(TWriter writer) where TWriter : IWriter
        {
            writer.Write(kFormatVersion);
            writer.Write(ToJson(_city));
            Mod.LOG.Info($"City collections saved: {_city.Count}");
        }

        // After both reads nothing here can affect loading: an unknown version
        // or bad JSON only costs the city's collections.
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
                var skipped = FromJson(payload ?? string.Empty, kCityPrefix, _city, out var documentVersion);
                if (skipped < 0)
                {
                    Mod.LOG.Warn($"City collections not loaded: unknown format version {documentVersion}");
                    return;
                }
                Mod.LOG.Info($"City collections loaded: {_city.Count}" + Skipped(skipped));
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
