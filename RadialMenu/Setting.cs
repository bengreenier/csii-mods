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
    [SettingsUIGroupOrder(KGeneralGroup, KKeybindingGroup,
        KSearchQuickStartGroup, KSearchNamesGroup, KSearchFiltersGroup, KSearchIsGroup, KSearchThemeGroup,
        KSearchDlcGroup, KSearchInGroup, KSearchFxGroup, KSearchCombiningGroup, KSearchKeysGroup)]
    [SettingsUIShowGroupName(KGeneralGroup, KKeybindingGroup,
        KSearchQuickStartGroup, KSearchNamesGroup, KSearchFiltersGroup, KSearchIsGroup, KSearchThemeGroup,
        KSearchDlcGroup, KSearchInGroup, KSearchFxGroup, KSearchCombiningGroup, KSearchKeysGroup)]
    [SettingsUIKeyboardAction(Mod.KToggleActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    [SettingsUIMouseAction(Mod.KToggleActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    public class Setting : ModSetting
    {
        public const string KSection = "Main";
        public const string KGeneralGroup = "General";
        public const string KKeybindingGroup = "KeyBinding";

        // Built-in reference for the search language (see docs/search-schema.md).
        public const string KFiltersSection = "Filters";
        public const string KSearchQuickStartGroup = "SearchQuickStart";
        public const string KSearchNamesGroup = "SearchNames";
        public const string KSearchFiltersGroup = "SearchFilters";
        public const string KSearchIsGroup = "SearchIs";
        public const string KSearchThemeGroup = "SearchTheme";
        public const string KSearchDlcGroup = "SearchDlc";
        public const string KSearchInGroup = "SearchIn";
        public const string KSearchFxGroup = "SearchFx";
        public const string KSearchCombiningGroup = "SearchCombining";
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

        // Read-only help text for the Filters tab; the displayed text is each
        // property's label in LocaleEn.
        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchQuickStartGroup)]
        public string SearchQuickStartText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchNamesGroup)]
        public string SearchNamesText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchFiltersGroup)]
        public string SearchFiltersText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchIsGroup)]
        public string SearchIsText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchThemeGroup)]
        public string SearchThemeText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchDlcGroup)]
        public string SearchDlcText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchInGroup)]
        public string SearchInText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchFxGroup)]
        public string SearchFxText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KFiltersSection, KSearchCombiningGroup)]
        public string SearchCombiningText => string.Empty;

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

                { _setting.GetOptionTabLocaleID(Setting.KFiltersSection), "Search & Filters" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchQuickStartGroup), "Quick start" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchNamesGroup), "Searching by name" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFiltersGroup), "Filters" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchIsGroup), "is: - what you can build" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchThemeGroup), "theme: - building style" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchDlcGroup), "dlc: - base game or DLC" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchInGroup), "in: - which tab it lives in" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFxGroup), "fx: - what it does for your city" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchCombiningGroup), "Combining searches" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchKeysGroup), "Keys while searching" },

                // Help text for the Search & Filters tab. Plain ASCII only (the game
                // font lacks some symbols); filters are written "key: value".
                // Rendered by the game's markup renderer: never use < > (makes a
                // link), ** (bold), a leading "- " (list item) or \ (escape) unless
                // intended; blank lines are dropped. See docs/game-internals.md.
                // Anything the player should type is wrapped in 'single quotes'
                // (double quotes are part of the search syntax: exact phrases).
                // Keep in sync with docs/search-schema.md and UI query/filters.ts.
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchQuickStartText)),
                    "You don't need to click anything to search: open the radial menu and start typing. " +
                    "The wheel narrows to matching buildings, roads and props as you type, " +
                    "and Enter picks the first result, ready to place.\n" +
                    "\n" +
                    "Try it now: open the menu and type 'park'.\n" +
                    "Then try 'is: new' to see everything you have just unlocked.\n" +
                    "\n" +
                    "Throughout this page, text in 'single quotes' is exactly what to type (without the quotes)."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchNamesText)),
                    "Type one or more words. Every word has to appear in the name, in any order: " +
                    "'fire station' finds anything with both \"fire\" and \"station\" in its name.\n" +
                    "\n" +
                    "Wrap words in double quotes to match them exactly, in that order: '\"bus stop\"'\n" +
                    "\n" +
                    "Put a minus in front of a word to leave those results out: 'road -highway' " +
                    "finds roads, but no highways.\n" +
                    "\n" +
                    "Where you search matters. From the top ring you search every unlocked tab at once. " +
                    "Inside a tab or category, you only search that tab or category."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchFiltersText)),
                    "Filters narrow the results by something other than the name. " +
                    "Type the filter, a colon and a value, like 'is: new' or 'in: parks'. " +
                    "The space after the colon is optional.\n" +
                    "\n" +
                    "You don't need to remember the values: start typing a filter and suggestions appear " +
                    "in the middle of the wheel. Press Right Arrow to accept one. " +
                    "Values can also be shortened, so 'is: u' means 'is: unique'.\n" +
                    "\n" +
                    "A filter you haven't finished, or one the menu doesn't recognise, is shown faded or " +
                    "crossed out and simply ignored - it never hides your results."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchIsText)),
                    "'is: ok' - things you can place right now\n" +
                    "'is: new' - newly unlocked, like the ones with the new badge\n" +
                    "'is: unique' - unique buildings, of which you can only have one per city\n" +
                    "'is: placed' - unique buildings you have already built\n" +
                    "'is: locked' - things you haven't unlocked yet\n" +
                    "\n" +
                    "Try 'is: unique -is: placed' to find the unique buildings still waiting for a spot."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchThemeText)),
                    "'theme: european' - buildings in a regional architectural style. Values are single words, " +
                    "so use 'theme: north' for North American.\n" +
                    "\n" +
                    "Note: only themes enabled in the vanilla asset menu's theme filter can be found. " +
                    "To change which themes are enabled, turn off \"Hide vanilla toolbar tabs\" on the Main tab " +
                    "and use the theme buttons in the vanilla asset menu."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchDlcText)),
                    "'dlc: none' - base game content only\n" +
                    "'-dlc: none' - only content from DLCs and content packs\n" +
                    "'dlc:' followed by part of a DLC's name - one DLC in particular. " +
                    "Type 'dlc:' to see suggestions for the ones you have."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchInText)),
                    "'in: parks' - anything in a toolbar tab or category whose name starts with the value. " +
                    "Also try 'in: health', 'in: roads' or 'in: water'.\n" +
                    "\n" +
                    "Handy from the top ring to search a single tab: 'in: parks bench'"
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchFxText)),
                    "'fx: crime' - things with an effect on crime, such as police stations\n" +
                    "Other effects to try: 'fx: wellbeing', 'fx: health', 'fx: entertainment', 'fx: attractiveness'\n" +
                    "\n" +
                    "The fx filter matches the kind of effect, not whether it helps or hurts. " +
                    "The first search for an effect can take a moment while the details load."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchCombiningText)),
                    "Mix words and filters freely - everything you type has to match:\n" +
                    "'school is: ok' - schools you can place right now\n" +
                    "'in: parks is: new' - newly unlocked park items\n" +
                    "\n" +
                    "Separate values with a comma (no space) to accept either one: 'is: new,unique'\n" +
                    "\n" +
                    "Put a minus in front of a filter to exclude it: '-dlc: none' shows only DLC content.\n" +
                    "\n" +
                    "Results you can't place right now are dimmed and listed last."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchKeysText)),
                    "Enter - pick the first result, ready to place\n" +
                    "Right Arrow - accept the suggestion shown in the middle of the wheel\n" +
                    "Escape, right-click or clicking the middle - clear what you typed; press again to go back a level\n" +
                    "Your toggle key (Tab by default) - close the menu"
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
