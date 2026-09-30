using Colossal.IO.AssetDatabase;
using Colossal.Logging;
using Game;
using Game.Input;
using Game.Modding;
using Game.SceneFlow;

namespace BetterAssetMenu
{
    // ReSharper disable once ClassNeverInstantiated.Global
    public class Mod : IMod
    {
        public static readonly ILog LOG = LogManager.GetLogger($"{nameof(BetterAssetMenu)}.{nameof(Mod)}").SetShowsErrorsInUI(false);

        public const string KOpenActionName = "OpenBetterAssetMenu";
        public const string KAcceptSuggestionActionName = "AcceptSearchSuggestion";

        public static ProxyAction OpenAction { get; private set; }

        // Only its binding is used: BetterAssetMenuUISystem reads the bound key directly
        // while the menu's search field has focus (which blocks game actions), so
        // the action itself stays disabled.
        public static ProxyAction AcceptSuggestionAction { get; private set; }

        public static Setting Settings { get; private set; }

        private Setting _setting;

        public void OnLoad(UpdateSystem updateSystem)
        {
            LOG.Info(nameof(OnLoad));

            if (GameManager.instance.modManager.TryGetExecutableAsset(this, out var asset))
                LOG.Info($"Current mod asset at {asset.path}");

            _setting = new Setting(this);
            _setting.RegisterInOptionsUI();
            GameManager.instance.localizationManager.AddSource("en-US", new LocaleEn(_setting));

            _setting.RegisterKeyBindings();
            OpenAction = _setting.GetAction(KOpenActionName);
            OpenAction.shouldBeEnabled = true;
            AcceptSuggestionAction = _setting.GetAction(KAcceptSuggestionActionName);

            AssetDatabase.global.LoadSettings(nameof(BetterAssetMenu), _setting, new Setting(this));
            Settings = _setting;

            // Holds per-save data only (no updates); created here so it's in
            // the world before any save is loaded or written.
            updateSystem.World.GetOrCreateSystemManaged<FavoritesSystem>();
            updateSystem.UpdateAt<BetterAssetMenuUISystem>(SystemUpdatePhase.UIUpdate);
            // Both run inside ToolSystem.OnUpdate: the first after the game's tools
            // (ToolUpdate phase, before vanilla applies the tool's info view), the
            // fallback right after it's applied. See ToolInfoviewSystem.cs.
            updateSystem.UpdateAt<ToolInfoviewSystem>(SystemUpdatePhase.ToolUpdate);
            updateSystem.UpdateAt<ToolInfoviewFallbackSystem>(SystemUpdatePhase.PostTool);
        }

        public void OnDispose()
        {
            LOG.Info(nameof(OnDispose));
            if (_setting == null) return;

            _setting.UnregisterInOptionsUI();
            _setting = null;
            Settings = null;
        }
    }
}
