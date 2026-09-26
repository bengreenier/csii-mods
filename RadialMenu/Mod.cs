using Colossal.IO.AssetDatabase;
using Colossal.Logging;
using Game;
using Game.Input;
using Game.Modding;
using Game.SceneFlow;

namespace RadialMenu
{
    // ReSharper disable once ClassNeverInstantiated.Global
    public class Mod : IMod
    {
        public static readonly ILog LOG = LogManager.GetLogger($"{nameof(RadialMenu)}.{nameof(Mod)}").SetShowsErrorsInUI(false);

        public const string KToggleActionName = "ToggleRadialMenu";

        public static ProxyAction ToggleAction { get; private set; }

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
            ToggleAction = _setting.GetAction(KToggleActionName);
            ToggleAction.shouldBeEnabled = true;

            AssetDatabase.global.LoadSettings(nameof(RadialMenu), _setting, new Setting(this));

            updateSystem.UpdateAt<RadialMenuUISystem>(SystemUpdatePhase.UIUpdate);
        }

        public void OnDispose()
        {
            LOG.Info(nameof(OnDispose));
            if (_setting == null) return;

            _setting.UnregisterInOptionsUI();
            _setting = null;
        }
    }
}
