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
        }
    }
}
