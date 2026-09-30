using System;
using System.Collections.Generic;
using Colossal.PSI.Common;
using Colossal.PSI.Steamworks;
using Colossal.UI.Binding;
using Game.Dlc;

namespace BetterAssetMenu
{
    /// <summary>
    /// Each DLC's Steam app ID, for the context menu's "Copy DLC store link".
    /// Resolved the way the game's Steam backend does it
    /// (SteamworksPlatform.RemapDLCs): the game's SteamworksDlcsMapping first
    /// (the oldest DLCs), then the DLC's own "steamAppId" attribute. This is
    /// static game data, available whichever launcher the game runs on.
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        private RawValueBinding _dlcSteamApps;
        private List<(string name, uint appId)> _dlcSteamAppsCache;

        private void CreateStoreLinkBindings()
        {
            AddBinding(_dlcSteamApps = new RawValueBinding(kGroup, "dlcSteamApps", WriteDlcSteamApps));
        }

        private void WriteDlcSteamApps(IJsonWriter writer)
        {
            _dlcSteamAppsCache ??= BuildDlcSteamApps();
            writer.ArrayBegin(_dlcSteamAppsCache.Count);
            foreach (var (name, appId) in _dlcSteamAppsCache)
            {
                writer.TypeBegin("betterAssetMenu.DlcSteamApp");
                // Matches the icon name in Asset.dlc ("Media/DLC/<name>.svg").
                writer.PropertyName("name");
                writer.Write(name);
                writer.PropertyName("appId");
                writer.Write(appId);
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }

        private static List<(string name, uint appId)> BuildDlcSteamApps()
        {
            var result = new List<(string, uint)>();
            try
            {
                var mapping = new SteamworksDlcsMapping();
                foreach (var entry in DlcHelper.GetDlcAttributes())
                {
                    var name = PlatformManager.instance?.GetDlcName(entry.Key);
                    if (string.IsNullOrEmpty(name)) continue;
                    if ((mapping.Lookup(entry.Key, out var appId) && appId != 0) || entry.Value.GetSteamAppId(out appId))
                    {
                        if (appId != 0) result.Add((name, appId));
                    }
                }
            }
            catch (Exception e)
            {
                // DLC assets then offer no Steam link.
                Mod.LOG.Warn(e, "Could not resolve DLC Steam app IDs; DLC assets get no store link");
            }
            return result;
        }
    }
}
