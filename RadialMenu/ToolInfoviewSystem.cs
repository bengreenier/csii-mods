using System.Collections.Generic;
using System.Reflection;
using Game;
using Game.Prefabs;
using Game.Tools;
using UnityEngine;

namespace RadialMenu
{
    /// <summary>
    /// Tracks whether the current tool selection was made through the radial
    /// menu, so mod behaviour changes apply only to radial-menu selections and
    /// never leak into the vanilla toolbar, hotkeys etc.
    /// </summary>
    /// <remarks>
    /// Attribution by identity and event order, no timing: vanilla's toolbar
    /// triggers (<c>ToolbarUISystem.SelectAsset/SelectAssetMenu/SelectAssetCategory</c>
    /// -> <c>Apply</c> -> <c>ToolSystem.ActivatePrefabTool</c>) change the tool
    /// synchronously, and UI triggers are handled in order. The UI sends
    /// "radialSelect" right after each vanilla select, so <see cref="Mark"/>
    /// snapshots exactly what the radial menu selected. It stays the radial
    /// menu's for as long as the active tool and its prefab are unchanged; any
    /// other change (vanilla toolbar, hotkeys, picking a building, ...) ends it
    /// for good.
    /// </remarks>
    public static class RadialSelection
    {
        private static ToolBaseSystem _tool;
        private static PrefabBase _prefab;

        /// <summary>Whether the current selection was made via the radial menu.</summary>
        public static bool IsCurrent => _tool != null && _prefab != null;

        /// <summary>Record the current selection as the radial menu's.</summary>
        public static void Mark(ToolSystem toolSystem)
        {
            _tool = toolSystem.activeTool;
            _prefab = _tool?.GetPrefab();
        }

        /// <summary>Call once per frame; drops ownership once the selection changes.</summary>
        internal static void Update(ToolSystem toolSystem)
        {
            if (_tool == null) return;
            var tool = toolSystem.activeTool;
            if (tool != _tool || tool.GetPrefab() != _prefab)
            {
                _tool = null;
                _prefab = null;
            }
        }
    }

    /// <summary>
    /// Optionally stops tools from switching on their related info view when an
    /// asset is selected via the radial menu (e.g. power lines -> electricity
    /// overlay). Selections made any other way keep vanilla behaviour.
    /// </summary>
    /// <remarks>
    /// Vanilla: tools set <c>ToolBaseSystem.infoview</c> from the selected prefab
    /// during their update (the ToolUpdate phase, run from inside
    /// <c>ToolSystem.ToolUpdate</c>); right after that phase, ToolUpdate compares
    /// it with its private <c>m_LastToolInfoview</c> and calls <c>SetInfoview</c>
    /// only when it changed.
    ///
    /// This system runs in <see cref="SystemUpdatePhase.ToolUpdate"/> after the
    /// game's tools and, when the setting is off, records the tool's new info view
    /// as already applied, so vanilla never switches it on (no flicker). An info
    /// view the player opens themselves is untouched. If the private fields go
    /// away in a game update, <see cref="ToolInfoviewFallbackSystem"/> takes over.
    /// See docs/game-internals.md.
    /// </remarks>
    public partial class ToolInfoviewSystem : GameSystemBase
    {
        private static readonly FieldInfo LastToolInfoviewField =
            typeof(ToolSystem).GetField("m_LastToolInfoview", BindingFlags.Instance | BindingFlags.NonPublic);
        private static readonly FieldInfo LastToolInfomodesField =
            typeof(ToolSystem).GetField("m_LastToolInfomodes", BindingFlags.Instance | BindingFlags.NonPublic);

        /// <summary>Whether vanilla's private state could be found (else the fallback is used).</summary>
        public static bool PreventionAvailable { get; private set; }

        private ToolSystem _toolSystem;

        protected override void OnCreate()
        {
            base.OnCreate();
            _toolSystem = World.GetOrCreateSystemManaged<ToolSystem>();
            PreventionAvailable = LastToolInfoviewField?.FieldType == typeof(InfoviewPrefab) &&
                                  LastToolInfomodesField?.FieldType == typeof(List<InfomodePrefab>);
            if (!PreventionAvailable)
                Mod.LOG.Warn("ToolSystem.m_LastToolInfoview/m_LastToolInfomodes not found; " +
                             "using the fallback for \"Show info views when selecting tools\"");
        }

        protected override void OnUpdate()
        {
            RadialSelection.Update(_toolSystem);

            if (!PreventionAvailable || (Mod.Settings?.ShowToolInfoviews ?? true) || !_toolSystem.actionMode.IsGame())
                return;
            if (!RadialSelection.IsCurrent) return; // vanilla toolbar, hotkeys, ...: untouched

            var tool = _toolSystem.activeTool;
            var toolInfoview = tool?.infoview;
            if (toolInfoview == null) return; // let vanilla clear as usual
            if (ReferenceEquals(LastToolInfoviewField.GetValue(_toolSystem), toolInfoview)) return;

            // Mirror what ToolUpdate would record after applying it - without applying it.
            LastToolInfoviewField.SetValue(_toolSystem, toolInfoview);
            var lastInfomodes = (List<InfomodePrefab>)LastToolInfomodesField.GetValue(_toolSystem);
            lastInfomodes.Clear();
            if (tool.infomodes != null) lastInfomodes.AddRange(tool.infomodes);
        }
    }

    /// <summary>
    /// Fallback for <see cref="ToolInfoviewSystem"/> when vanilla's private state
    /// isn't available: undoes the tool's info view right after ToolUpdate applied
    /// it (PostTool phase, same frame). Also switches the shader flag off at once,
    /// since vanilla only refreshes it at the end of next frame's ToolUpdate.
    /// </summary>
    public partial class ToolInfoviewFallbackSystem : GameSystemBase
    {
        private ToolSystem _toolSystem;
        private InfoviewPrefab _lastToolInfoview;
        private bool _loggedUse;

        protected override void OnCreate()
        {
            base.OnCreate();
            _toolSystem = World.GetOrCreateSystemManaged<ToolSystem>();
        }

        protected override void OnUpdate()
        {
            var toolInfoview = _toolSystem.activeTool?.infoview;
            if (toolInfoview == _lastToolInfoview) return;
            _lastToolInfoview = toolInfoview;

            if ((Mod.Settings?.ShowToolInfoviews ?? true) || toolInfoview == null || !_toolSystem.actionMode.IsGame())
                return;
            if (!RadialSelection.IsCurrent) return; // not a radial-menu selection
            if (_toolSystem.infoview != toolInfoview) return; // prevented, or the player's own choice

            if (!_loggedUse)
            {
                _loggedUse = true;
                Mod.LOG.Info("Tool info view suppressed via fallback (may flicker for a frame)");
            }
            _toolSystem.infoview = null;
            Shader.SetGlobalInt("colossal_InfoviewOn", 0);
        }
    }
}
