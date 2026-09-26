using Colossal.UI.Binding;
using Game;
using Game.SceneFlow;
using Game.UI;

namespace RadialMenu
{
    /// <summary>
    /// Owns the radial menu's open state and exposes it to the UI module.
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

            if (Mod.ToggleAction != null && Mod.ToggleAction.WasPerformedThisFrame())
                SetOpen(!_isOpen.value);
        }

        private void SetOpen(bool open)
        {
            if (_isOpen.value == open) return;

            Mod.LOG.Info(open ? "Radial menu opened" : "Radial menu closed");
            _isOpen.Update(open);
        }
    }
}
