using Colossal;
using Colossal.IO.AssetDatabase;
using Game.Input;
using Game.Modding;
using Game.Settings;
using System.Collections.Generic;

namespace RadialMenu
{
    [FileLocation(nameof(RadialMenu))]
    [SettingsUITabOrder(KSection, KFiltersSection)]
    [SettingsUIGroupOrder(KGeneralGroup, KKeybindingGroup, KSearchBasicsGroup, KSearchFiltersGroup, KSearchKeysGroup)]
    [SettingsUIShowGroupName(KGeneralGroup, KKeybindingGroup, KSearchBasicsGroup, KSearchFiltersGroup, KSearchKeysGroup)]
    [SettingsUIKeyboardAction(Mod.KToggleActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    [SettingsUIMouseAction(Mod.KToggleActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    public class Setting : ModSetting
    {
        public const string KSection = "Main";
        public const string KGeneralGroup = "General";
        public const string KKeybindingGroup = "KeyBinding";

        // Built-in reference for the search language (see docs/search-schema.md).
        public const string KFiltersSection = "Filters";
        public const string KSearchBasicsGroup = "SearchBasics";
        public const string KSearchFiltersGroup = "SearchFilters";
        public const string KSearchKeysGroup = "SearchKeys";

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

        // Read-only help text; the displayed text is each property's label in LocaleEn.
        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchBasicsGroup)]
        public string SearchBasicsText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchFiltersGroup)]
        public string SearchFiltersText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchKeysGroup)]
        public string SearchKeysText => string.Empty;

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

                { _setting.GetOptionTabLocaleID(Setting.KFiltersSection), "Filters" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchBasicsGroup), "Searching" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFiltersGroup), "Filters" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchKeysGroup), "Keys while searching" },

                // Keep in sync with docs/search-schema.md and UI query/filters.ts.
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchBasicsText)),
                    "Open the radial menu and start typing to filter it.\n" +
                    "\n" +
                    "park bench - every word must appear in the asset's name\n" +
                    "\"bus stop\" - exact phrase\n" +
                    "-highway - exclude assets whose name contains the word\n" +
                    "\n" +
                    "Where you are sets what is searched: the top ring searches every unlocked tab; " +
                    "inside a tab or category, only that tab or category."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchFiltersText)),
                    "is:ok - can be placed right now\n" +
                    "is:new - newly unlocked\n" +
                    "is:unique - unique buildings\n" +
                    "is:placed - unique buildings already placed\n" +
                    "is:locked - not unlocked yet\n" +
                    "theme:european - from a theme (only themes selected in the vanilla theme filter are available)\n" +
                    "dlc:none - base game only; dlc:<name> - from a DLC\n" +
                    "in:parks - in a tab or category, e.g. in:health, in:roads\n" +
                    "fx:crime - has an effect, e.g. fx:wellbeing, fx:entertainment\n" +
                    "\n" +
                    "Values can be shortened (is:u) and combined with commas for either/or (is:new,unique). " +
                    "Separate filters with spaces; all must match. Put - in front to negate (-dlc:none = DLC only). " +
                    "A space after the colon is fine: is: ok works the same as is:ok.\n" +
                    "Unfinished or unknown filters are dimmed or struck through and ignored."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchKeysText)),
                    "Right Arrow - accept the suggested completion\n" +
                    "Enter - pick the first result\n" +
                    "Escape / right-click / click the center - clear the search, then go back a level"
                },

                { _setting.GetBindingKeyLocaleID(Mod.KToggleActionName), "Toggle radial menu" },

                { _setting.GetBindingMapLocaleID(), "Radial Menu" },
            };
        }

        public void Unload()
        {
        }
    }
}
