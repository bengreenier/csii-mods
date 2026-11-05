using Colossal.Serialization.Entities;
using Game;
using Game.SceneFlow;
using Game.UI.Editor;
using Game.UI.InGame;
using Game.UI.Menu;

namespace BetterAssetMenu
{
    /// <summary>
    /// Re-checks whether Find It is enabled (FindItBridge.Settle) at the moments
    /// it matters: each load completing, and the Options screen opening, where
    /// the Find It options are greyed out without it. The Paradox Mods playset
    /// can load after the main menu, so a single check at startup can miss it,
    /// and there's no event for that. A GameSystemBase runs in every mode,
    /// unlike the menu's own system (Game only), so the main menu's Options
    /// are covered too.
    /// </summary>
    public partial class FindItDetectSystem : GameSystemBase
    {
        private MenuUISystem _menuUISystem;
        private GameScreenUISystem _gameScreenUISystem;
        private EditorScreenUISystem _editorScreenUISystem;
        private bool _optionsWereOpen;

        protected override void OnGameLoadingComplete(Purpose purpose, GameMode mode)
        {
            base.OnGameLoadingComplete(purpose, mode);
            FindItBridge.Settle();
        }

        protected override void OnUpdate()
        {
            var open = OptionsOpen();
            if (open && !_optionsWereOpen) FindItBridge.Settle();
            _optionsWereOpen = open;
        }

        // As OptionsUISystem decides whether it's on screen, looking the
        // screen systems up lazily as it does (they're the game's to create).
        private bool OptionsOpen()
        {
            switch (GameManager.instance.gameMode)
            {
                case GameMode.MainMenu:
                    _menuUISystem ??= World.GetExistingSystemManaged<MenuUISystem>();
                    return _menuUISystem?.activeScreen == MenuUISystem.MenuScreen.Options;
                case GameMode.Game:
                    _gameScreenUISystem ??= World.GetExistingSystemManaged<GameScreenUISystem>();
                    return _gameScreenUISystem?.activeScreen == GameScreenUISystem.GameScreen.Options;
                case GameMode.Editor:
                    _editorScreenUISystem ??= World.GetExistingSystemManaged<EditorScreenUISystem>();
                    return _editorScreenUISystem?.activeScreen == EditorScreenUISystem.EditorScreen.Options;
                default:
                    return false;
            }
        }
    }
}
