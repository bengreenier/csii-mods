using Colossal;
using Colossal.IO.AssetDatabase;
using Colossal.Json;
using Game;
using Game.Input;
using Game.Modding;
using Game.SceneFlow;
using Game.Settings;
using Game.UI;
using System.Collections.Generic;
using Unity.Entities;

namespace RadialMenu
{
    [FileLocation(nameof(RadialMenu))]
    [SettingsUITabOrder(KSection, KGuideSection)]
    // Main tab first (settings), then the Usage Guide, which reads top to bottom:
    // basics, then each filter.
    [SettingsUIGroupOrder(KLayoutGroup, KRadialLayoutGroup, KPaneLayoutGroup, KAssetsGroup, KVanillaGroup, KKeybindingGroup, KUtilitiesGroup,
        KSearchQuickStartGroup, KSearchKeysGroup, KSearchRadialGroup, KSearchPaneGroup, KSearchNamesGroup, KSearchFavoritesGroup, KSearchFindItGroup,
        KSearchFiltersGroup, KSearchIsGroup, KSearchInGroup, KSearchThemeGroup, KSearchPackGroup, KSearchDlcGroup,
        KSearchZoneGroup, KSearchFxGroup, KSearchCombiningGroup)]
    [SettingsUIShowGroupName(KLayoutGroup, KRadialLayoutGroup, KPaneLayoutGroup, KAssetsGroup, KVanillaGroup, KKeybindingGroup, KUtilitiesGroup,
        KSearchQuickStartGroup, KSearchKeysGroup, KSearchRadialGroup, KSearchPaneGroup, KSearchNamesGroup, KSearchFavoritesGroup, KSearchFindItGroup,
        KSearchFiltersGroup, KSearchIsGroup, KSearchInGroup, KSearchThemeGroup, KSearchPackGroup, KSearchDlcGroup,
        KSearchZoneGroup, KSearchFxGroup, KSearchCombiningGroup)]
    [SettingsUIKeyboardAction(Mod.KOpenActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    [SettingsUIMouseAction(Mod.KOpenActionName, ActionType.Button, usages: new[] { Usages.kDefaultUsage, Usages.kToolUsage, Usages.kCancelableToolUsage, Usages.kDiscardableToolUsage })]
    // Own usage: only read while typing in the menu, so it shouldn't be reported
    // as conflicting with e.g. the arrow-key camera controls.
    [SettingsUIKeyboardAction(Mod.KAcceptSuggestionActionName, ActionType.Button, usages: new[] { KSearchUsage })]
    public class Setting : ModSetting
    {
        public const string KSection = "Main";
        // Main tab groups. Settings are saved by property name, so moving one
        // between groups doesn't reset it.
        // Settings for any view of the menu; the wheel's own are in
        // KRadialLayoutGroup.
        public const string KLayoutGroup = "Layout";
        public const string KRadialLayoutGroup = "RadialLayout";
        public const string KPaneLayoutGroup = "PaneLayout";
        public const string KAssetsGroup = "Assets";
        public const string KVanillaGroup = "Vanilla";
        public const string KKeybindingGroup = "KeyBinding";
        public const string KUtilitiesGroup = "Utilities";
        public const string KSearchUsage = "RadialMenuSearch";

        // Usage Guide tab: built-in help, including the search language (see
        // docs/search-schema.md).
        public const string KGuideSection = "Guide";
        public const string KSearchQuickStartGroup = "SearchQuickStart";
        public const string KSearchNamesGroup = "SearchNames";
        public const string KSearchFiltersGroup = "SearchFilters";
        public const string KSearchIsGroup = "SearchIs";
        public const string KSearchThemeGroup = "SearchTheme";
        public const string KSearchPackGroup = "SearchPack";
        public const string KSearchZoneGroup = "SearchZone";
        public const string KSearchDlcGroup = "SearchDlc";
        public const string KSearchInGroup = "SearchIn";
        public const string KSearchFxGroup = "SearchFx";
        public const string KSearchCombiningGroup = "SearchCombining";
        public const string KSearchKeysGroup = "SearchKeys";
        public const string KSearchRadialGroup = "SearchRadial";
        public const string KSearchPaneGroup = "SearchPane";
        public const string KSearchFavoritesGroup = "SearchFavorites";
        public const string KSearchFindItGroup = "SearchFindIt";

        public Setting(IMod mod) : base(mod)
        {
            SetDefaults();
        }

        // --- Menu layout ---

        // How the open menu is drawn. Sent to the UI as an int: keep the values
        // in sync with MENU_STYLE_* in UI/src/mods/menu/bindings.ts.
        public enum MenuStyleMode
        {
            // A wheel of items around a hub (views/radial).
            Radial = 0,
            // A search field over a list of rows and a detail side (views/pane).
            Pane = 1,
        }

        [SettingsUISection(KSection, KLayoutGroup)]
        public MenuStyleMode MenuStyle { get; set; }

        [SettingsUISection(KSection, KLayoutGroup)]
        public bool OpenAtCursor { get; set; }

        // Each style's layout settings show only while that style is chosen.
        // Re-checked live, and a group with nothing visible drops its header
        // (OptionsUISystem.Section.UpdateVisibility).
        private bool IsPaneStyle() => MenuStyle == MenuStyleMode.Pane;
        private bool IsRadialStyle() => MenuStyle != MenuStyleMode.Pane;

        // --- Radial menu layout ---

        // Scale factor for the whole wheel (1 = 100%), shown as a percentage like
        // the vanilla audio sliders.
        [SettingsUISlider(min = 50f, max = 200f, step = 5f, unit = Unit.kPercentage, scalarMultiplier = 100f)]
        [SettingsUIHideByCondition(typeof(Setting), nameof(IsPaneStyle))]
        [SettingsUISection(KSection, KRadialLayoutGroup)]
        public float MenuScale { get; set; }

        // Gap between the center and the first ring (1 = 100%; 0 = touching).
        [SettingsUISlider(min = 0f, max = 400f, step = 25f, unit = Unit.kPercentage, scalarMultiplier = 100f)]
        [SettingsUIHideByCondition(typeof(Setting), nameof(IsPaneStyle))]
        [SettingsUISection(KSection, KRadialLayoutGroup)]
        public float RingDistance { get; set; }

        // Gap between neighbouring buttons and between rings (1 = 100%; 0 = touching).
        [SettingsUISlider(min = 0f, max = 400f, step = 25f, unit = Unit.kPercentage, scalarMultiplier = 100f)]
        [SettingsUIHideByCondition(typeof(Setting), nameof(IsPaneStyle))]
        [SettingsUISection(KSection, KRadialLayoutGroup)]
        public float ItemSpacing { get; set; }

        // The large image of the asset pointed at: in the middle of the wheel,
        // or in the pane's detail side. Sent to
        // the UI as an int: keep the values in sync with HUB_IMAGE_* in
        // UI/src/mods/menu/item-details.tsx.
        public enum HubImageMode
        {
            // The prefab's dedicated preview when it has one (e.g. signature
            // buildings), otherwise its thumbnail; as the vanilla asset panel.
            Preview = 0,
            // Always the thumbnail shown on the item's button.
            ButtonIcon = 1,
        }

        [SettingsUISection(KSection, KLayoutGroup)]
        public HubImageMode HubImage { get; set; }

        // --- Pane layout ---

        // Scale factor for the whole pane (1 = 100%), like MenuScale for the wheel.
        [SettingsUISlider(min = 50f, max = 200f, step = 5f, unit = Unit.kPercentage, scalarMultiplier = 100f)]
        [SettingsUIHideByCondition(typeof(Setting), nameof(IsRadialStyle))]
        [SettingsUISection(KSection, KPaneLayoutGroup)]
        public float PaneScale { get; set; }

        // --- Assets ---

        // On: search lists every theme and asset pack (RadialMenuUISystem
        // "allAssets"). Off: only what the vanilla asset menu's theme and pack
        // filters let through (toolbar.assets).
        [SettingsUISection(KSection, KAssetsGroup)]
        public bool SearchAllThemes { get; set; }

        // The same choice for browsing a category in the wheel (no search typed).
        [SettingsUISection(KSection, KAssetsGroup)]
        public bool BrowseAllThemes { get; set; }

        // On: unique buildings already placed are dimmed and can't be picked
        // (vanilla's rule). Off: they stay pickable. Favorites never dim them.
        [SettingsUISection(KSection, KAssetsGroup)]
        public bool LockPlacedUnique { get; set; }

        // Search and browse Find It's whole catalogue too (FindItBridge.cs).
        // The saved choice (on by default) is UseFindItWanted; UseFindIt is
        // what's shown: ticked only when wanted AND Find It is there, and
        // greyed out without Find It, where clicks don't change the choice.
        [SettingsUIHidden]
        public bool UseFindItWanted { get; set; }

        [Exclude]
        [SettingsUIDisableByCondition(typeof(Setting), nameof(IsFindItMissing))]
        [SettingsUISection(KSection, KAssetsGroup)]
        public bool UseFindIt
        {
            get => UseFindItWanted && FindItBridge.IsEnabled;
            set
            {
                if (FindItBridge.IsEnabled) UseFindItWanted = value;
            }
        }

        private static bool IsFindItMissing() => !FindItBridge.IsEnabled;

        // --- Vanilla toolbar and tools ---

        [SettingsUISection(KSection, KVanillaGroup)]
        public bool HideVanillaToolbar { get; set; }

        // Off: the bulldozer is left out of the radial menu and stays in the
        // vanilla toolbar, even while the other tab buttons are hidden.
        [SettingsUISection(KSection, KVanillaGroup)]
        public bool BulldozerInRadial { get; set; }

        [SettingsUISection(KSection, KVanillaGroup)]
        public bool ShowToolInfoviews { get; set; }

        // --- Key bindings ---

        [SettingsUIKeyboardBinding(BindingKeyboard.Tab, Mod.KOpenActionName)]
        [SettingsUISection(KSection, KKeybindingGroup)]
        public ProxyBinding OpenKeyboardBinding { get; set; }

        [SettingsUIMouseBinding(BindingMouse.Forward, Mod.KOpenActionName)]
        [SettingsUISection(KSection, KKeybindingGroup)]
        public ProxyBinding OpenMouseBinding { get; set; }

        [SettingsUIKeyboardBinding(BindingKeyboard.Enter, Mod.KAcceptSuggestionActionName)]
        [SettingsUISection(KSection, KKeybindingGroup)]
        public ProxyBinding AcceptSuggestionBinding { get; set; }

        [SettingsUISection(KSection, KKeybindingGroup)]
        public bool ResetBindings
        {
            set
            {
                Mod.LOG.Info("Reset key bindings");
                ResetKeyBindings();
            }
        }

        // --- Utilities ---

        // Picking an asset from another theme switches the vanilla asset menu's
        // theme filter to it; this puts it back to the city's default theme.
        [SettingsUIDisableByCondition(typeof(Setting), nameof(IsNoCityLoaded))]
        [SettingsUISection(KSection, KUtilitiesGroup)]
        public bool ResetVanillaThemes
        {
            set
            {
                Mod.LOG.Info("Reset vanilla theme filter");
                RadialMenuUISystem.RequestThemeReset();
            }
        }

        // Rebuilds every cache that otherwise only refreshes on the next load
        // (RadialMenuUISystem.Refresh.cs). Needs a city.
        [SettingsUIButton]
        [SettingsUIDisableByCondition(typeof(Setting), nameof(IsNoCityLoaded))]
        [SettingsUISection(KSection, KUtilitiesGroup)]
        public bool RefreshData
        {
            set
            {
                if (IsNoCityLoaded()) return;
                RadialMenuUISystem.RequestDataRefresh();
            }
        }

        // Clears everything the mod stores in the loaded city's save (see
        // FavoritesSystem.ResetCityData); takes effect when the city is saved.
        // Last in Utilities (declaration order is display order) as the only
        // destructive one; [SettingsUIConfirmation] asks first, with the
        // GetOptionWarningLocaleID text from LocaleEn.
        [SettingsUIButton]
        [SettingsUIConfirmation]
        [SettingsUIDisableByCondition(typeof(Setting), nameof(IsNoCityLoaded))]
        [SettingsUISection(KSection, KUtilitiesGroup)]
        public bool RemoveCityData
        {
            set
            {
                if (IsNoCityLoaded())
                {
                    Mod.LOG.Info("Remove Radial Menu data skipped: no city loaded");
                    return;
                }
                World.DefaultGameObjectInjectionWorld?.GetExistingSystemManaged<FavoritesSystem>()?.ResetCityData();
                Mod.LOG.Info("Removed Radial Menu data from this city");
            }
        }

        private static bool IsNoCityLoaded() => GameManager.instance.gameMode != GameMode.Game;

        // --- Usage Guide ---

        // Read-only help text for the Usage Guide tab; the displayed text is each
        // property's label in LocaleEn.
        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchQuickStartGroup)]
        public string SearchQuickStartText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchNamesGroup)]
        public string SearchNamesText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchFiltersGroup)]
        public string SearchFiltersText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchIsGroup)]
        public string SearchIsText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchThemeGroup)]
        public string SearchThemeText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchPackGroup)]
        public string SearchPackText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchZoneGroup)]
        public string SearchZoneText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchDlcGroup)]
        public string SearchDlcText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchInGroup)]
        public string SearchInText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchFxGroup)]
        public string SearchFxText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchCombiningGroup)]
        public string SearchCombiningText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchKeysGroup)]
        public string SearchKeysText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchRadialGroup)]
        public string SearchRadialText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchPaneGroup)]
        public string SearchPaneText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchFavoritesGroup)]
        public string SearchFavoritesText => string.Empty;

        [SettingsUIMultilineText]
        [SettingsUISection(KGuideSection, KSearchFindItGroup)]
        public string SearchFindItText => string.Empty;

        public override void SetDefaults()
        {
            HideVanillaToolbar = true;
            BulldozerInRadial = true;
            SearchAllThemes = true;
            BrowseAllThemes = false;
            LockPlacedUnique = false;
            UseFindItWanted = true;
            MenuStyle = MenuStyleMode.Radial;
            MenuScale = 1f;
            PaneScale = 1f;
            RingDistance = 1f;
            ItemSpacing = 1f;
            OpenAtCursor = false;
            HubImage = HubImageMode.Preview;
            ShowToolInfoviews = true;
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

                { _setting.GetOptionGroupLocaleID(Setting.KLayoutGroup), "Menu layout" },
                { _setting.GetOptionGroupLocaleID(Setting.KRadialLayoutGroup), "Radial menu layout" },
                { _setting.GetOptionGroupLocaleID(Setting.KPaneLayoutGroup), "Pane layout" },
                { _setting.GetOptionGroupLocaleID(Setting.KAssetsGroup), "Assets" },
                { _setting.GetOptionGroupLocaleID(Setting.KVanillaGroup), "Vanilla toolbar and tools" },
                { _setting.GetOptionGroupLocaleID(Setting.KKeybindingGroup), "Key bindings" },
                { _setting.GetOptionGroupLocaleID(Setting.KUtilitiesGroup), "Utilities" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ResetVanillaThemes)), "Reset vanilla theme filter" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ResetVanillaThemes)), "Set the vanilla asset menu's theme filter back to your city's default theme, as it is after loading the city. Picking an asset from another theme switches that filter to the asset's theme. Any asset you are placing is deselected. Only works while a city is loaded." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.RemoveCityData)), "Remove Radial Menu data from this city" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.RemoveCityData)), "Clear everything Radial Menu stores in this city's save, which is your favorites. Save the city afterwards to keep the change; loading it without saving brings the data back. The save then only has an empty Radial Menu section, which the game skips if the mod is not installed. To remove even that, disable the mod and save the city again. Only works while a city is loaded." },
                { _setting.GetOptionWarningLocaleID(nameof(Setting.RemoveCityData)), "Remove all Radial Menu data, including your favorites, from this city? Save the city afterwards to keep the change." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.RefreshData)), "Refresh radial menu data" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.RefreshData)), "If anything in the radial menu or its search looks out of date or missing, press this instead of reloading the city. It rebuilds everything the radial menu keeps about assets, including Find It's catalogue when Find It is enabled, and search updates right after. Only works while a city is loaded." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.HideVanillaToolbar)), "Hide vanilla toolbar tabs" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.HideVanillaToolbar)), "Hide the bottom toolbar's tab buttons and the asset panel that opens from them, so the radial menu replaces them. The bulldozer stays if 'Bulldozer in radial menu' is off." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.BulldozerInRadial)), "Bulldozer in radial menu" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.BulldozerInRadial)), "Show the bulldozer in the radial menu. Turn off to leave it out of the radial menu and keep it in the bottom toolbar instead, even while the other tab buttons are hidden." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.SearchAllThemes)), "Search every theme and asset pack" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.SearchAllThemes)), "Search finds assets from every theme and asset pack, such as North American buildings in a European city. Turn off to only find what the vanilla asset menu's theme and pack filters show. For browsing without searching, see 'Show every theme and asset pack'." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.LockPlacedUnique)), "Disable placed unique buildings" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.LockPlacedUnique)), "Dim unique buildings, such as signature buildings, once one is placed in your city, and don't let them be picked from the radial menu, as the vanilla asset menu does. When off, they can always be picked. Favorites are never greyed out this way. Things you haven't unlocked yet are always greyed out." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.UseFindIt)), "Use Find It's catalogue" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.UseFindIt)), "Requires the Find It mod. Search and browse everything Find It lists, such as props, decals, trees and vehicles, not just what the vanilla toolbar has. Adds a Find It button to the radial menu, and a 'cat:' filter for Find It's categories. Greyed out when Find It isn't enabled." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.BrowseAllThemes)), "Show every theme and asset pack" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.BrowseAllThemes)), "When browsing the radial menu without searching, show assets from every theme and asset pack, such as North American buildings in a European city. Turn off to only show what the vanilla asset menu's theme and pack filters show. Picking an asset from another theme switches the vanilla theme filter to it, as in the vanilla asset menu." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.MenuStyle)), "Menu style" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.MenuStyle)), "How the menu looks when you open it. 'Radial' shows a wheel of buttons around a center that describes what you point at. 'Pane' shows a search field over a list you move through with the arrow keys, with details of the highlighted item beside it. Both search, browse and pick the same things." },
                { _setting.GetEnumValueLocaleID(Setting.MenuStyleMode.Radial), "Radial" },
                { _setting.GetEnumValueLocaleID(Setting.MenuStyleMode.Pane), "Pane" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.PaneScale)), "Pane size" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.PaneScale)), "Scale the whole pane - search field, list and details - up or down. Changes apply the next time the menu opens." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.HubImage)), "Preview image" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.HubImage)), "The picture shown for something to build: in the middle of the wheel while you hover it, or beside the list in the pane. 'Preview' shows the larger preview image when there is one, as the vanilla asset panel does (for example, signature buildings), and the item's icon otherwise. 'Button icon' always shows the same image as the item's button." },
                { _setting.GetEnumValueLocaleID(Setting.HubImageMode.Preview), "Preview" },
                { _setting.GetEnumValueLocaleID(Setting.HubImageMode.ButtonIcon), "Button icon" },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.OpenAtCursor)), "Open at mouse cursor" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.OpenAtCursor)), "Open the menu at the mouse cursor instead of the middle of the screen: the wheel is centered on the cursor, and the pane opens with its search field under the cursor. The menu stays where it opened while you use it, and is nudged away from the screen edges so it fits." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ShowToolInfoviews)), "Show info views for radial menu selections" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ShowToolInfoviews)), "When on (the game's default), selecting something to build from the radial menu switches on its related info view - for example, power lines show the electricity overlay. Turn off to keep the normal view. Only affects selections made through the radial menu: the vanilla toolbar, hotkeys and everything else keep the game's behaviour, and you can still open info views yourself." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.MenuScale)), "Wheel size" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.MenuScale)), "Scale the whole radial menu - rings, buttons and the center - up or down. Changes apply immediately." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.RingDistance)), "Distance from center" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.RingDistance)), "How much space is left between the center of the menu and the ring of buttons. At 0% the buttons touch the center. This is the closest the ring gets: a ring with many buttons, like the top level, grows outward to fit them all. Changes apply immediately." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ItemSpacing)), "Item spacing" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ItemSpacing)), "How much space is left between neighbouring buttons, and between rings when there are several. At 0% buttons touch. Wider spacing fits fewer search results on each page. Changes apply immediately." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.OpenKeyboardBinding)), "Open menu" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.OpenKeyboardBinding)), "Keyboard key that opens the menu (the wheel or the pane, see 'Menu style'). It closes by itself when you pick something; Escape goes back a level and closes it from the top level, and clicking outside the menu closes it too." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.OpenMouseBinding)), "Open menu (mouse)" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.OpenMouseBinding)), "Mouse button that opens the menu (the wheel or the pane, see 'Menu style'). It closes by itself when you pick something; Escape goes back a level and closes it from the top level, and clicking outside the menu closes it too." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.AcceptSuggestionBinding)), "Accept suggestion / pick result" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.AcceptSuggestionBinding)), "While the menu is open, accepts the search suggestion if one is shown. " +
                    "Otherwise, in the wheel it picks the result when exactly one you can place is left, and in the pane it picks the highlighted item. " +
                    "By design this key can't collide with other shortcuts: it's only read while you're typing in the menu, " +
                    "when the game's own keyboard shortcuts are paused, so it can safely share a key with them (like the arrow-key camera controls). " +
                    "Just avoid keys that type a character." },

                { _setting.GetOptionLabelLocaleID(nameof(Setting.ResetBindings)), "Reset key bindings" },
                { _setting.GetOptionDescLocaleID(nameof(Setting.ResetBindings)), "Reset all key bindings of the mod" },

                { _setting.GetOptionTabLocaleID(Setting.KGuideSection), "Usage Guide" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchQuickStartGroup), "Quick start" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchNamesGroup), "Searching by name" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFiltersGroup), "Filters" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchIsGroup), "is: - what you can build" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchThemeGroup), "theme: - building style" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchPackGroup), "pack: - asset packs" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchZoneGroup), "zone:, size:, width:, depth:, level: - zones and lots" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchDlcGroup), "dlc: - base game or DLC" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchInGroup), "in: - which tab it lives in" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFxGroup), "fx: - what it does for your city" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchCombiningGroup), "Combining searches" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchKeysGroup), "Keys and mouse" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchRadialGroup), "Menu style: Radial" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchPaneGroup), "Menu style: Pane" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFavoritesGroup), "Favorites" },
                { _setting.GetOptionGroupLocaleID(Setting.KSearchFindItGroup), "Find It" },

                // Help text for the Usage Guide tab. Plain ASCII only (the game
                // font lacks some symbols); filters are written "key: value".
                // Rendered by the game's markup renderer: never use < > (makes a
                // link), ** (bold), a leading "- " (list item) or \ (escape) unless
                // intended; blank lines are dropped. See docs/game-internals.md.
                // Anything the player should type is wrapped in 'single quotes'
                // (double quotes are part of the search syntax: exact phrases).
                // Keep in sync with docs/search-schema.md and UI query/filters.ts.
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchQuickStartText)),
                    "You don't need to click anything to search: open the menu and start typing. " +
                    "The menu narrows to matching buildings, roads and props as you type, and Enter picks one, ready to place. " +
                    "Without typing, you can browse the same menus and categories as the vanilla toolbar.\n" +
                    "The menu comes in two styles ('Menu style' on the Main tab): Radial, a wheel of buttons you point at, " +
                    "and Pane, a list you move through with the arrow keys. Both search, browse and pick the same things; " +
                    "their own keys are described below.\n" +
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
                    "'road' also finds streets, so 'road ped' finds the pedestrian streets.\n" +
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
                    "in the middle of the wheel. Press Enter to accept one. " +
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
                    "'is: mod' - things that come from mods (Paradox Mods)\n" +
                    "'is: favorite' - things in this city's favorites\n" +
                    "\n" +
                    "Try 'is: unique -is: placed' to find the unique buildings still waiting for a spot."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchThemeText)),
                    "'theme: european' - buildings in a regional architectural style. Values are single words, " +
                    "so use 'theme: north' for North American.\n" +
                    "\n" +
                    "Every theme can be found while \"Search every theme and asset pack\" is on (Main tab). " +
                    "With it off, only themes enabled in the vanilla asset menu's theme filter can be found."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchPackText)),
                    "'pack:' followed by a word from an asset pack's name - assets from that pack. " +
                    "Type 'pack:' to see suggestions for the packs you can search.\n" +
                    "\n" +
                    "Like themes, every pack can be found while \"Search every theme and asset pack\" is on."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchZoneText)),
                    "'zone: office' - zoned buildings, like signature buildings, and zone types of that kind. " +
                    "Use 'residential', 'commercial', 'industrial' or 'office', or a density: 'low', 'medium' or 'high'. " +
                    "For high density housing, use two filters: 'zone: residential zone: high'\n" +
                    "'size: 2x3' - buildings on a lot 2 cells wide along the road and 3 cells deep. " +
                    "'width: 2' and 'depth: 3' look at just one side, and can be combined: " +
                    "'width: 4 depth: 4' is the same as 'size: 4x4'.\n" +
                    "'width: 2u' or 'width: 16m' - roads, tracks and paths by width, in units (cells, as in a '2u road') or metres. " +
                    "A unit is 8 metres, so 'width: 2', 'width: 2u' and 'width: 16m' all find both 16 metre roads and buildings 2 cells wide. " +
                    "'depth: 3u' works like 'depth: 3'.\n" +
                    "'level: 3' - zoned buildings of that level"
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchDlcText)),
                    "'dlc: none' - base game content only (no DLCs, content packs or mods)\n" +
                    "'-dlc: none' - only content from DLCs, content packs and mods\n" +
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
                    "Results you can't place right now are listed last. Things you haven't unlocked yet are dimmed."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchKeysText)),
                    "In both styles:\n" +
                    "Enter - accept the search suggestion, if one is shown (what Enter does otherwise depends on the style, see below). You can change this key on the Main tab.\n" +
                    "Escape - clear what you typed; press again to go back a level, and from the top level to close the menu\n" +
                    "Right-click an item - more actions, like adding it to your favorites or copying its DLC or mod link\n" +
                    "Clicking outside the menu - close it (picking something closes it too)"
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchRadialText)),
                    "A wheel of buttons around a center. Point at a button to see its picture, name and details in the center.\n" +
                    "Enter - when there is no suggestion, pick the result if it's the only one left you can place\n" +
                    "Mouse wheel, Page Up or Page Down - show the next or previous page of results, when there are more than fit on the wheel\n" +
                    "Clicking the middle - go back a level\n" +
                    "'Wheel size', 'Distance from center' and 'Item spacing' (Main tab, shown while this style is chosen) change its layout."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchPaneText)),
                    "A search field over a list, with details of the highlighted item beside it and where you are at the bottom.\n" +
                    "Up or Down - move the highlight; Page Up or Page Down - move it a page\n" +
                    "Enter - when there is no suggestion, pick the highlighted item, or open it if it's a menu or category\n" +
                    "Tab - accept the suggestion\n" +
                    "Right - open the highlighted menu or category; Left - go back a level (both only while nothing is typed)\n" +
                    "Mouse wheel - scroll the list; moving the mouse over an item highlights it, and clicking picks it\n" +
                    "Click a detail under the picture, like 'theme: European', to add it to your search (right-click to exclude it).\n" +
                    "'Pane size' (Main tab, shown while this style is chosen) scales it."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchFavoritesText)),
                    "Right-click anything you can place, while browsing or in search results, and choose 'Add to favorites'. " +
                    "Your favorites are under the star at the top level (at the end of the top ring in the wheel, at the bottom of the list in the pane).\n" +
                    "Each city keeps its own favorites, saved with the city. Typing while in Favorites searches only your favorites. " +
                    "To remove one, right-click it and choose 'Remove from favorites'."
                },
                {
                    _setting.GetOptionLabelLocaleID(nameof(Setting.SearchFindItText)),
                    "With the Find It mod enabled and 'Use Find It's catalogue' on (Main tab, on by default), the menu " +
                    "can reach everything Find It lists: props, decals, trees, vehicles and more, not just the vanilla toolbar.\n" +
                    "The Find It entry at the top level, next to Favorites, browses Find It's categories. " +
                    "Searching from the top level includes the whole catalogue; between equally good matches, toolbar items come first.\n" +
                    "'cat: decals' - things in a Find It category, e.g. 'cat: props', 'cat: trees' or 'cat: fences'. " +
                    "Combine them to narrow down: 'cat: props cat: residential'.\n" +
                    "Anything from Find It can be added to your favorites too."
                },

                { _setting.GetBindingKeyLocaleID(Mod.KOpenActionName), "Open menu" },
                { _setting.GetBindingKeyLocaleID(Mod.KAcceptSuggestionActionName), "Accept suggestion / pick result" },

                { _setting.GetBindingMapLocaleID(), "Radial Menu" },
            };
        }

        public void Unload()
        {
        }
    }
}
