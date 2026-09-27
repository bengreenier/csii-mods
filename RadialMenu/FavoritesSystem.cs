using System;
using System.Collections.Generic;
using Colossal.Serialization.Entities;
using Game;
using Game.Prefabs;
using Game.Serialization;
using Unity.Entities;

namespace RadialMenu
{
    /// <summary>
    /// The radial menu's favorite assets, stored in each save.
    /// </summary>
    /// <remarks>
    /// Every <see cref="IDefaultSerializable"/> system in the world is written
    /// into the save by the game's SystemSerializerLibrary, keyed by the class
    /// name: never rename this class (or add [FormerlySerializedAs] with the old
    /// name if it must be). A save loaded without the mod skips this block
    /// (ObsoleteSystemSerializer). Favorites are kept as PrefabIDs (prefab type,
    /// name and asset hash), since prefab entities differ between sessions and
    /// mod sets. IDs that don't resolve, e.g. an uninstalled asset mod, are kept
    /// and come back if it's reinstalled. See docs/game-internals.md.
    /// </remarks>
    public partial class FavoritesSystem : GameSystemBase, IDefaultSerializable, ISerializable
    {
        // Bump when the layout below changes; Deserialize must keep reading
        // every older version.
        private const int kFormatVersion = 1;
        private const char kLineSeparator = '\n';

        private readonly List<PrefabID> _favorites = new List<PrefabID>();
        private PrefabSystem _prefabSystem;

        /// <summary>
        /// Bumped whenever the list changes. Polled (RadialMenuUISystem) rather
        /// than an event, because Deserialize/SetDefaults run inside the game's
        /// load and shouldn't push UI updates from there.
        /// </summary>
        public int Revision { get; private set; }

        protected override void OnCreate()
        {
            base.OnCreate();
            _prefabSystem = World.GetOrCreateSystemManaged<PrefabSystem>();
            // The serializer builds its system list once; make sure it includes
            // this system even if the list was built before the mod loaded.
            World.GetExistingSystemManaged<SerializerSystem>()?.systemLibrary?.SetDirty();
        }

        // Nothing to do per frame; this system only holds data.
        protected override void OnUpdate()
        {
        }

        /// <summary>Favorites that resolve to a loaded prefab, in the order added.</summary>
        public IEnumerable<Entity> GetResolvedFavorites()
        {
            foreach (var id in _favorites)
            {
                if (_prefabSystem.TryGetPrefab(id, out var prefab) && _prefabSystem.TryGetEntity(prefab, out var entity))
                    yield return entity;
            }
        }

        public void Add(Entity prefabEntity)
        {
            if (!TryGetId(prefabEntity, out var id) || _favorites.Contains(id)) return;
            _favorites.Add(id);
            Revision++;
        }

        public void Remove(Entity prefabEntity)
        {
            if (TryGetId(prefabEntity, out var id) && _favorites.Remove(id))
                Revision++;
        }

        /// <summary>
        /// Forgets everything this mod stores for the loaded city ("Remove
        /// Radial Menu data from this city"). The save keeps an empty block
        /// until the mod is disabled and the city saved again.
        /// </summary>
        public void ResetCityData()
        {
            _favorites.Clear();
            Revision++;
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

        public void SetDefaults(Context context)
        {
            _favorites.Clear();
            Revision++;
        }

        // Block layout, for every format version: one int (the version) and one
        // string. Later versions may change what's inside the string, never the
        // layout. The game throws ("Data size mismatch") and the save fails to
        // load unless Deserialize consumes the block exactly, so reading both
        // values unconditionally means any version can read (and skip) any
        // other version's block.
        //
        // v1 string: one favorite per line, as PrefabID.ToUrlSegment():
        // "<type>/<name>" or "<type>/<name>/<hash>", type and name URL-escaped.
        public void Serialize<TWriter>(TWriter writer) where TWriter : IWriter
        {
            var lines = new List<string>(_favorites.Count);
            foreach (var id in _favorites) lines.Add(id.ToUrlSegment());
            writer.Write(kFormatVersion);
            writer.Write(string.Join(kLineSeparator.ToString(), lines));
            Mod.LOG.Info($"Favorites saved: {_favorites.Count}");
        }

        // Resolving IDs to prefabs happens later (GetResolvedFavorites). After
        // both reads nothing here can affect loading: an unknown version or a
        // bad line only costs favorites.
        public void Deserialize<TReader>(TReader reader) where TReader : IReader
        {
            _favorites.Clear();
            reader.Read(out int version);
            reader.Read(out string payload);
            try
            {
                if (version < 1 || version > kFormatVersion)
                {
                    Mod.LOG.Warn($"Favorites not loaded: unknown format version {version}");
                    return;
                }
                var skipped = 0;
                foreach (var line in (payload ?? string.Empty).Split(kLineSeparator))
                {
                    if (line.Length == 0) continue;
                    if (TryParseUrlSegment(line, out var id)) _favorites.Add(id);
                    else skipped++;
                }
                Mod.LOG.Info($"Favorites loaded: {_favorites.Count}" + (skipped > 0 ? $" ({skipped} unreadable, skipped)" : ""));
            }
            catch (Exception e)
            {
                _favorites.Clear();
                Mod.LOG.Error(e, "Favorites could not be read from the save; starting empty");
            }
            finally
            {
                Revision++;
            }
        }

        // Inverse of PrefabID.ToUrlSegment().
        private static bool TryParseUrlSegment(string segment, out PrefabID id)
        {
            id = default;
            var parts = segment.Split('/');
            if (parts.Length < 2 || parts.Length > 3) return false;
            var type = Uri.UnescapeDataString(parts[0]);
            var name = Uri.UnescapeDataString(parts[1]);
            if (type.Length == 0 || name.Length == 0) return false;
            var hash = default(Colossal.Hash128);
            if (parts.Length == 3 && !Colossal.Hash128.TryParse(parts[2], out hash)) return false;
            id = new PrefabID(type, name, hash);
            return true;
        }
    }
}
