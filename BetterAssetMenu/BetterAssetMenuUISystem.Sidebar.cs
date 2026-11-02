using Colossal.UI.Binding;
using UnityEngine;

namespace BetterAssetMenu
{
    /// <summary>
    /// The sidebar's settings ("Sidebar layout"), and where dragging it leaves it.
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        private void CreateSidebarBindings()
        {
            // Polled each update, so the options screen applies live.
            AddUpdateBinding(new GetterValueBinding<int>(kGroup, "sidebarPlacement",
                () => (int)(Mod.Settings?.SidebarPlacement ?? Setting.SidebarPlacementMode.DockedRight)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "sidebarTransparency", GetSidebarTransparency));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "sidebarScale",
                () => InRangeOrDefault(Mod.Settings?.SidebarScale, 0.5f, 2f)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "sidebarWidth",
                () => Mathf.Clamp(Mod.Settings?.SidebarWidth ?? kDefaultWidth, kMinWidth, kMaxWidth)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "sidebarHeight", () => FloatingHeight(Mod.Settings?.SidebarHeight)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "sidebarX", () => Fraction(Mod.Settings?.SidebarX)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "sidebarY", () => Fraction(Mod.Settings?.SidebarY)));
            // Sent once per drag, when the sidebar is dropped.
            AddBinding(new TriggerBinding<int, float, float>(kGroup, "setSidebarPlacement", SetSidebarPlacement));
            // Sent once per resize, when the edge is let go.
            AddBinding(new TriggerBinding<float, float>(kGroup, "setSidebarSize", SetSidebarSize));
        }

        // Setting.SidebarWidth's slider range.
        private const int kDefaultWidth = 440;
        private const int kMinWidth = 320;
        private const int kMaxWidth = 800;

        private static void SetSidebarSize(float width, float height)
        {
            var settings = Mod.Settings;
            if (settings == null || float.IsNaN(width)) return;

            settings.SidebarWidth = Mathf.Clamp(Mathf.RoundToInt(width), kMinWidth, kMaxWidth);
            settings.SidebarHeight = FloatingHeight(height);
            settings.ApplyAndSave();
        }

        // 0 (the default) for anything odd; the UI clamps it to the screen.
        private static float FloatingHeight(float? value) =>
            value is float v && !float.IsNaN(v) && v > 0f && v < 10000f ? v : 0f;

        private static void SetSidebarPlacement(int placement, float x, float y)
        {
            var settings = Mod.Settings;
            if (settings == null || !System.Enum.IsDefined(typeof(Setting.SidebarPlacementMode), placement)) return;

            settings.SidebarPlacement = (Setting.SidebarPlacementMode)placement;
            if (settings.SidebarPlacement == Setting.SidebarPlacementMode.Floating)
            {
                settings.SidebarX = Fraction(x);
                settings.SidebarY = Fraction(y);
            }
            settings.ApplyAndSave();
        }

        // Clamped to the slider's range; 0 (solid) for anything odd.
        private static float GetSidebarTransparency() =>
            Mod.Settings?.SidebarTransparency is float t && t >= 0f && t <= 0.9f ? t : 0f;

        // A position as a fraction of the screen: in [0, 1].
        private static float Fraction(float? value) =>
            value is float v && !float.IsNaN(v) ? Mathf.Clamp01(v) : 0f;
    }
}
