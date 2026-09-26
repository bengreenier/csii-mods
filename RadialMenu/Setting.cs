using Colossal;
using Colossal.IO.AssetDatabase;
using Game.Input;
using Game.Modding;
using Game.Settings;
using System.Collections.Generic;

namespace RadialMenu
{
    [FileLocation(nameof(RadialMenu))]
    [SettingsUIGroupOrder(KGeneralGroup, KKeybindingGroup)]
    [SettingsUIShowGroupName(KGeneralGroup, KKeybindingGroup)]
    [SettingsUIKeyboardAction(Mod.KToggleActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    [SettingsUIMouseAction(Mod.KToggleActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    public class Setting : ModSetting
    {
        public const string KSection = "Main";
        public const string KGeneralGroup = "General";
        public const string KKeybindingGroup = "KeyBinding";

        public Setting(IMod mod) : base(mod)
        {
            SetDefaults();
        }

        [SettingsUISection(KSection, KGeneralGroup)]
        public bool HideVanillaToolbar { get; set; }

        [SettingsUIKeyboardBinding(BindingKeyboard.Tab, Mod.KToggleActionName)]
        [SettingsUISection(KSection, KKeybindingGroup)]
        public ProxyBinding ToggleKeyboardBinding { get; set; }

        [SettingsUIMouseBinding(BindingMouse.Forward, Mod.KToggleActionName)]
        [SettingsUISection(KSection, KKeybindingGroup)]
        public ProxyBinding ToggleMouseBinding { get; set; }

        [SettingsUISection(KSection, KKeybindingGroup)]
        public bool ResetBindings
        {
            set
            {
                Mod.LOG.Info("Reset key bindings");
                ResetKeyBindings();
            }
        }

        public override void SetDefaults()
        {
            HideVanillaToolbar = true;
        }
    }

    public class LocaleEn : IDictionarySource
    {
        private readonly Setting _setting;

        public LocaleEn(Setting setting)
        {
            _setting = setting;
        }

        public IEnumerable<KeyValuePair<string, string>> ReadEntries(IList<IDictionaryEntryError> errors, Dictionary<string, int> indexCounts)
        {
            return new Dictionary<string, string>
            {
                { _setting.GetSettingsLocaleID(), "Radial Menu" },
                { _setting.GetOptionTabLocaleID(Setting.KSection), "Main" },

                { _setting.GetOptionGroupLocaleID(Setting.KGeneralGroup), "General" },
                { _setting.GetOptionGroupLocaleID(Setting.KKeybindingGroup), "Key bindings" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.HideVanillaToolbar)), "Hide vanilla toolbar tabs" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.HideVanillaToolbar)), "Hide the bottom toolbar's tab buttons and the asset panel that opens from them, so the radial menu replaces them" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ToggleKeyboardBinding)), "Toggle radial menu" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ToggleKeyboardBinding)), "Keyboard key that opens or closes the radial menu" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ToggleMouseBinding)), "Toggle radial menu (mouse)" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ToggleMouseBinding)), "Mouse button that opens or closes the radial menu" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ResetBindings)), "Reset key bindings" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ResetBindings)), "Reset all key bindings of the mod" },

                { _setting.GetBindingKeyLocaleID(Mod.KToggleActionName), "Toggle radial menu" },

                { _setting.GetBindingMapLocaleID(), "Radial Menu" },
            };
        }

        public void Unload()
        {
        }
    }
}
