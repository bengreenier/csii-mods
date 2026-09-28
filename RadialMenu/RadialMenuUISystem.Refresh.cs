using Colossal.UI.Binding;

namespace RadialMenu
{
    /// <summary>
    /// "Refresh radial menu data" (Utilities): rebuilds every cache that would
    /// otherwise only refresh on the next load, so nobody has to reload a city
    /// because something was cached. Everything else in the UI refreshes itself
    /// from the resent data (see docs/game-internals.md, "Caches").
    /// </summary>
    public partial class RadialMenuUISystem
    {
        private static bool _refreshRequested;
        private EventBinding _dataRefreshed;

        /// <summary>From the settings button; handled on the next update.</summary>
        public static void RequestDataRefresh()
        {
            _refreshRequested = true;
            Mod.LOG.Info("Refresh radial menu data requested");
        }

        private void CreateRefreshBindings()
        {
            // Tells the UI to drop its own session caches (fx: effect terms).
            AddBinding(_dataRefreshed = new EventBinding(kGroup, "dataRefreshed"));
        }

        // Called every update, before UpdateFindIt (which does the Find It part).
        private void HandleDataRefresh()
        {
            if (!_refreshRequested) return;
            _refreshRequested = false;

            _dlcSteamAppsCache = null;
            _dlcSteamApps.Update();
            // Re-read in place by UpdateFindIt this update; it resends
            // assetMeta itself when it does.
            _findItRebuildRequested = true;
            RefreshAssetMeta();
            RefreshAllAssets();
            RefreshFavorites();
            _dataRefreshed.Trigger();
            Mod.LOG.Info("Refreshed radial menu data");
        }
    }
}
