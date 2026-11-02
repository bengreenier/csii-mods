using System.Linq;
using Colossal.UI.Binding;
using Game;
using Game.Input;
using Game.SceneFlow;
using Game.Tools;
using Game.UI;
using Game.UI.InGame;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace BetterAssetMenu
{
    /// <summary>
    /// Owns the menu's open state and settings exposed to the UI module.
    /// Everything else (toolbar groups, selecting a menu) uses the game's own bindings.
    /// </summary>
    public partial class BetterAssetMenuUISystem : UISystemBase
    {
        // Must match mod.json "id" in the UI project.
        public const string kGroup = nameof(BetterAssetMenu);

        private ValueBinding<bool> _isOpen;
        // Whether the menu takes the keyboard when it opens: false only for
        // the sidebar coming back by itself (see _restoreSidebar).
        private ValueBinding<bool> _openFocused;
        private EventBinding _acceptSuggestion;
        private EventBinding _focusSearch;
        private GameScreenUISystem _gameScreenUISystem;

        // Declares which modes this system is active in (not the current mode).
        public override GameMode gameMode => GameMode.Game;

        protected override void OnCreate()
        {
            base.OnCreate();
            _gameScreenUISystem = World.GetOrCreateSystemManaged<GameScreenUISystem>();
            AddBinding(_isOpen = new ValueBinding<bool>(kGroup, "isOpen", false));
            AddBinding(_openFocused = new ValueBinding<bool>(kGroup, "openFocused", true));
            AddBinding(_isolateInput = new ValueBinding<bool>(kGroup, "isolateInput", false));
            AddBinding(new TriggerBinding(kGroup, "close", () =>
            {
                _restoreSidebar = false;
                SetOpen(false);
            }));
            AddBinding(_acceptSuggestion = new EventBinding(kGroup, "acceptSuggestion"));
            AddBinding(_focusSearch = new EventBinding(kGroup, "focusSearch"));
            // The sidebar's search field reports its focus: it stays open
            // unfocused, and then the game keeps its keyboard (see UpdateInputIsolation).
            AddBinding(new TriggerBinding<bool>(kGroup, "setSearchFocused", focused => _searchFocused = focused));
            AddBinding(new TriggerBinding(kGroup, "refresh", RefreshWhileOpen));
            // Sent by the UI right after each selection it makes (see RadialSelection).
            var toolSystem = World.GetOrCreateSystemManaged<ToolSystem>();
            AddBinding(new TriggerBinding(kGroup, "radialSelect", () => RadialSelection.Mark(toolSystem)));
            // Polled each update, so toggling the option applies live.
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "hideVanillaToolbar",
                () => Mod.Settings?.HideVanillaToolbar ?? false));
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "bulldozerInRadial",
                () => Mod.Settings?.BulldozerInRadial ?? true));
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "searchAllThemes",
                () => Mod.Settings?.SearchAllThemes ?? true));
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "browseAllThemes",
                () => Mod.Settings?.BrowseAllThemes ?? false));
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "lockPlacedUnique",
                () => Mod.Settings?.LockPlacedUnique ?? false));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "menuScale", GetMenuScale));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "ringDistance",
                () => InRangeOrDefault(Mod.Settings?.RingDistance, 0f, 4f)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "itemSpacing",
                () => InRangeOrDefault(Mod.Settings?.ItemSpacing, 0f, 4f)));
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "openAtCursor", () => Mod.Settings?.OpenAtCursor ?? false));
            AddUpdateBinding(new GetterValueBinding<int>(kGroup, "menuStyle",
                () => (int)(Mod.Settings?.MenuStyle ?? Setting.MenuStyleMode.Radial)));
            AddUpdateBinding(new GetterValueBinding<float>(kGroup, "paneScale",
                () => InRangeOrDefault(Mod.Settings?.PaneScale, 0.5f, 2f)));
            CreateSidebarBindings();
            AddUpdateBinding(new GetterValueBinding<int>(kGroup, "hubImage",
                () => (int)(Mod.Settings?.HubImage ?? Setting.HubImageMode.Preview)));
            CreateAssetMetaBinding();
            CreateAllAssetsBinding();
            // After CreateAllAssetsBinding: shares its ToolbarUISystem and
            // UniqueAssetTrackingSystem references.
            CreateFavoritesBindings();
            CreateStoreLinkBindings();
            // After CreateAllAssetsBinding (shares its systems).
            CreateFindItBindings();
            CreatePlatterBindings();
            CreateRefreshBindings();
        }

        protected override void OnGamePreload(Colossal.Serialization.Entities.Purpose purpose, GameMode mode)
        {
            base.OnGamePreload(purpose, mode);
            _restoreSidebar = false;
            SetOpen(false);
            // Loading resets vanilla's theme filter anyway (ToolbarUISystem.OnGameLoaded).
            _themeResetRequested = false;
            ResetFindIt();
            ResetPlatter();
        }

        protected override void OnUpdate()
        {
            base.OnUpdate();
            UpdateInputIsolation();
            HandleThemeResetRequest();
            UpdateFavorites();
            HandleDataRefresh();
            UpdateFindIt();

            // Only on the city's main screen. With the UI hidden (free camera,
            // or photo mode's "Hide UI") the menu can't be seen, but its focused
            // search field would still swallow the keyboard (WASD etc.); over
            // the pause menu or options it has no business either. So close it,
            // and don't open it, anywhere else (docs/game-internals.md, Hidden UI).
            // The sidebar, which stays open while you build, comes back when
            // you return, without taking the keyboard.
            if (GameManager.instance.gameMode != GameMode.Game
                || _gameScreenUISystem.activeScreen != GameScreenUISystem.GameScreen.Main)
            {
                if (_isOpen.value && _persistentOpen) _restoreSidebar = true;
                SetOpen(false);
                return;
            }
            if (_restoreSidebar)
            {
                _restoreSidebar = false;
                if (Mod.Settings?.MenuStyle == Setting.MenuStyleMode.Sidebar) SetOpen(true, focused: false);
            }

            if (Mod.OpenAction == null) return;

            // The accept-suggestion key is only ever read directly (see
            // Mod.AcceptSuggestionAction): while the menu's search field has
            // focus the game blocks keyboard actions, ours included. The
            // sidebar stays open unfocused, while the key is the game's again.
            if (IsTyping && Mod.AcceptSuggestionAction != null && WasBindingPressedThisFrame(Mod.AcceptSuggestionAction))
                _acceptSuggestion.Trigger();

            // "Open menu" opens. The menu closes by picking something,
            // Escape (from the top ring) or a click outside the wheel; all
            // handled in the UI. The open sidebar only closes from its title
            // bar; the key puts the keyboard back in its search field (it's
            // only read while unfocused: a focused field blocks it).
            if (Mod.OpenAction.WasPerformedThisFrame())
            {
                if (!_isOpen.value) SetOpen(true);
                else if (_persistentOpen) _focusSearch.Trigger();
            }
        }

        private static bool WasBindingPressedThisFrame(ProxyAction action)
        {
            foreach (var binding in action.bindings)
            {
                if (!binding.isSet || !(InputSystem.FindControl(binding.path) is ButtonControl key) || !key.wasPressedThisFrame)
                    continue;

                if (binding.modifiers.All(m => InputSystem.FindControl(m.m_Path) is ButtonControl modifier && modifier.isPressed))
                    return true;
            }
            return false;
        }

        // The sidebar was closed by leaving the city's main screen (pause
        // menu, options, hidden UI); reopen it on the way back. Not after a
        // load, nor once closed from its title bar.
        private bool _restoreSidebar;

        private void SetOpen(bool open, bool focused = true)
        {
            if (_isOpen.value == open) return;

            // Before isOpen: the UI reads it when the open menu mounts.
            if (open) _openFocused.Update(focused);
            _isOpen.Update(open);
            if (!open) ClearOpenPlace();
            _searchFocused = false;
            if (open)
            {
                // Fixed while open, as the UI fixes its view (useViewOnOpen).
                _persistentOpen = Mod.Settings?.MenuStyle == Setting.MenuStyleMode.Sidebar;
                // The sidebar isolates once its field reports focus.
                if (!_persistentOpen) SetIsolateInput(true);
                RefreshAllAssets();
                RefreshFavorites();
                _lastRefreshTime = UnityEngine.Time.realtimeSinceStartup;
            }
            _focusClearFrames = 0;
        }

        // While the sidebar stays open, unlocks and unique placements change
        // under it (refreshing on open covers that for the other views). The UI
        // asks whenever the mouse comes back to it, or its field is focused.
        private const float kMinRefreshInterval = 1f;
        private float _lastRefreshTime;

        private void RefreshWhileOpen()
        {
            if (!_isOpen.value) return;
            var now = UnityEngine.Time.realtimeSinceStartup;
            if (now - _lastRefreshTime < kMinRefreshInterval) return;
            _lastRefreshTime = now;
            RefreshAllAssets();
            RefreshFavorites();
        }

        // UI input isolation (see docs/game-internals.md, "Escape, Back and the
        // pause menu"). While true, the UI strips the game's UI action stack down
        // to the menu's own "Back". It must outlive the menu briefly: the game
        // only re-resolves UI actions when their priorities change, against the
        // global input mask *at that moment* - which excludes the keyboard while
        // the search field is focused. Releasing isolation only once the field
        // focus has been clear for a few frames (InputManager.Update refreshes the
        // mask every frame) makes that re-resolve see the keyboard again, so
        // keyboard-only actions like "Pause Menu" are re-enabled.
        private const int kFocusClearFramesBeforeRelease = 2;
        //
        // The sidebar (a persistent view) stays open without its field focused,
        // and then must leave the game its input: it isolates only while its
        // field has focus, and releases the same late way after each blur.
        private ValueBinding<bool> _isolateInput;
        private int _focusClearFrames;
        // The open menu is the sidebar (fixed while open).
        private bool _persistentOpen;
        // The sidebar's search field has focus (setSearchFocused).
        private bool _searchFocused;

        // The open menu's field has focus, so keys are being typed into it.
        // Always, in the modal views (the field keeps focus while open).
        private bool IsTyping => _isOpen.value && (!_persistentOpen || _searchFocused);

        private void UpdateInputIsolation()
        {
            if (IsTyping)
            {
                SetIsolateInput(true);
                _focusClearFrames = 0;
                return;
            }
            if (!_isolateInput.value) return;

            _focusClearFrames = InputManager.instance.hasInputFieldFocus ? 0 : _focusClearFrames + 1;
            if (_focusClearFrames >= kFocusClearFramesBeforeRelease)
                SetIsolateInput(false);
        }

        // Clamped to the slider's range, in case a settings file holds something odd.
        private static float GetMenuScale() => InRangeOrDefault(Mod.Settings?.MenuScale, 0.5f, 2f);

        // Percentage settings: out-of-range values fall back to 100%.
        private static float InRangeOrDefault(float? value, float min, float max) =>
            value is float v && v >= min && v <= max ? v : 1f;

        private void SetIsolateInput(bool isolate)
        {
            if (_isolateInput.value != isolate)
                _isolateInput.Update(isolate);
        }
    }
}
