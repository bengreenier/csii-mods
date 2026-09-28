using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace RadialMenu
{
    /// <summary>
    /// "Use Find It's catalogue": a snapshot of Find It's prefab index
    /// (FindItBridge), taken once Find It has finished indexing after a load.
    /// </summary>
    public partial class RadialMenuUISystem
    {
        private List<FindItBridge.Entry> _findItEntries;

        /// <summary>The integration is wanted and possible right now.</summary>
        internal static bool FindItActive => (Mod.Settings?.UseFindIt ?? true) && FindItBridge.IsAvailable;

        // A new load gets a fresh snapshot (Find It re-indexes on each load).
        private void ResetFindIt() => _findItEntries = null;

        // Called every update; reads the index once Find It is ready.
        private void UpdateFindIt()
        {
            if (_findItEntries != null || !FindItActive || !FindItBridge.IsReady()) return;

            var stopwatch = Stopwatch.StartNew();
            var entries = FindItBridge.ReadIndex(_prefabSystem);
            if (entries == null) return;
            _findItEntries = entries;
            Mod.LOG.Info($"Find It {FindItBridge.Version}: read {entries.Count} catalogue entries " +
                         $"({entries.Select(e => e.SubCategory).Distinct().Count()} subcategories) in {stopwatch.ElapsedMilliseconds} ms");
        }
    }
}
