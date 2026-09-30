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
        private EventBinding _acceptSuggestion;
        private GameScreenUISystem _gameScreenUISystem;

        // Declares which modes this system is active in (not the current mode).
        public override GameMode gameMode => GameMode.Game;

        protected override void OnCreate()
        {
            base.OnCreate();
            _gameScreenUISystem = World.GetOrCreateSystemManaged<GameScreenUISystem>();
            AddBinding(_isOpen = new ValueBinding<bool>(kGroup, "isOpen", false));
            AddBinding(_isolateInput = new ValueBinding<bool>(kGroup, "isolateInput", false));
            AddBinding(new TriggerBinding(kGroup, "close", () => SetOpen(false)));
            AddBinding(_acceptSuggestion = new EventBinding(kGroup, "acceptSuggestion"));
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
            CreateRefreshBindings();
        }

        protected override void OnGamePreload(Colossal.Serialization.Entities.Purpose purpose, GameMode mode)
        {
            base.OnGamePreload(purpose, mode);
            SetOpen(false);
            // Loading resets vanilla's theme filter anyway (ToolbarUISystem.OnGameLoaded).
            _themeResetRequested = false;
            ResetFindIt();
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
            if (GameManager.instance.gameMode != GameMode.Game
                || _gameScreenUISystem.activeScreen != GameScreenUISystem.GameScreen.Main)
            {
                SetOpen(false);
                return;
            }

            if (Mod.OpenAction == null) return;

            // The accept-suggestion key is only ever read directly (see
            // Mod.AcceptSuggestionAction): while the menu's search field has
            // focus the game blocks keyboard actions, ours included.
            if (_isOpen.value && Mod.AcceptSuggestionAction != null && WasBindingPressedThisFrame(Mod.AcceptSuggestionAction))
                _acceptSuggestion.Trigger();

            // "Open menu" only opens. The menu closes by picking
            // something, Escape (from the top ring) or a click outside the
            // wheel; all handled in the UI.
            if (!_isOpen.value && Mod.OpenAction.WasPerformedThisFrame())
                SetOpen(true);
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

        private void SetOpen(bool open)
        {
            if (_isOpen.value == open) return;

            _isOpen.Update(open);
            if (open)
            {
                SetIsolateInput(true);
                RefreshAllAssets();
                RefreshFavorites();
            }
            _focusClearFrames = 0;
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
        private ValueBinding<bool> _isolateInput;
        private int _focusClearFrames;

        private void UpdateInputIsolation()
        {
            if (_isOpen.value || !_isolateInput.value) return;

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
