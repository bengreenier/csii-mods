using System.Linq;
using Colossal.UI.Binding;
using Game;
using Game.Input;
using Game.SceneFlow;
using Game.UI;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace RadialMenu
{
    /// <summary>
    /// Owns the radial menu's open state and settings exposed to the UI module.
    /// Everything else (toolbar groups, selecting a menu) uses the game's own bindings.
    /// </summary>
    public partial class RadialMenuUISystem : UISystemBase
    {
        // Must match mod.json "id" in the UI project.
        public const string kGroup = nameof(RadialMenu);

        private ValueBinding<bool> _isOpen;

        // Declares which modes this system is active in (not the current mode).
        public override GameMode gameMode => GameMode.Game;

        protected override void OnCreate()
        {
            base.OnCreate();
            AddBinding(_isOpen = new ValueBinding<bool>(kGroup, "isOpen", false));
            AddBinding(_isolateInput = new ValueBinding<bool>(kGroup, "isolateInput", false));
            AddBinding(new TriggerBinding(kGroup, "close", () => SetOpen(false)));
            // Polled each update, so toggling the option applies live.
            AddUpdateBinding(new GetterValueBinding<bool>(kGroup, "hideVanillaToolbar",
                () => Mod.Settings?.HideVanillaToolbar ?? false));
        }

        protected override void OnGamePreload(Colossal.Serialization.Entities.Purpose purpose, GameMode mode)
        {
            base.OnGamePreload(purpose, mode);
            SetOpen(false);
        }

        protected override void OnUpdate()
        {
            base.OnUpdate();
            UpdateInputIsolation();

            if (GameManager.instance.gameMode != GameMode.Game)
            {
                SetOpen(false);
                return;
            }

            if (Mod.ToggleAction == null) return;

            // While the menu's search field has focus the game blocks keyboard
            // actions (ours included), so read the bound keys directly to still
            // allow closing. Only while open, so typing in other fields can't open it.
            var typingInMenu = _isOpen.value && InputManager.instance.hasInputFieldFocus;
            if (Mod.ToggleAction.WasPerformedThisFrame() || (typingInMenu && WasBindingPressedThisFrame(Mod.ToggleAction)))
                SetOpen(!_isOpen.value);
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

            Mod.LOG.Info(open ? "Radial menu opened" : "Radial menu closed");
            _isOpen.Update(open);
            if (open) SetIsolateInput(true);
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

        private void SetIsolateInput(bool isolate)
        {
            if (_isolateInput.value != isolate)
                _isolateInput.Update(isolate);
        }
    }
}
