using Colossal.Entities;
using Colossal.UI.Binding;
using Game.Prefabs;
using Unity.Entities;

namespace RadialMenu
{
    /// <summary>
    /// Favorites for the UI: the list (with each asset's toolbar menu and
    /// category, so picking one can select the chain like a search result)
    /// and add/remove triggers. Storage is <see cref="FavoritesSystem"/>.
    /// </summary>
    public partial class RadialMenuUISystem
    {
        private FavoritesSystem _favoritesSystem;
        private RawValueBinding _favorites;
        private int _sentFavoritesRevision = -1;

        private void CreateFavoritesBindings()
        {
            _favoritesSystem = World.GetOrCreateSystemManaged<FavoritesSystem>();
            AddBinding(_favorites = new RawValueBinding(kGroup, "favorites", WriteFavorites));
            AddBinding(new TriggerBinding<Entity>(kGroup, "addFavorite", entity => _favoritesSystem.Add(entity)));
            AddBinding(new TriggerBinding<Entity>(kGroup, "removeFavorite", entity => _favoritesSystem.Remove(entity)));
        }

        // Called every update: sends the list when it changed (added, removed,
        // or a save loaded).
        private void UpdateFavorites()
        {
            if (_favoritesSystem.Revision == _sentFavoritesRevision) return;
            RefreshFavorites();
        }

        // Also on menu open, so locked/placed states are current.
        private void RefreshFavorites()
        {
            _sentFavoritesRevision = _favoritesSystem.Revision;
            _favorites.Update();
        }

        private void WriteFavorites(IJsonWriter writer)
        {
            var entries = new System.Collections.Generic.List<(Entity asset, Entity menu, Entity category)>();
            foreach (var asset in _favoritesSystem.GetResolvedFavorites())
            {
                // Toolbar assets come with their menu and category (picking one
                // selects that chain). Others, e.g. props favorited from Find
                // It's catalogue, get Entity.Null for both: the UI places them
                // directly (activatePrefab), with or without Find It.
                if (EntityManager.TryGetComponent(asset, out UIObjectData uiObject) &&
                    EntityManager.TryGetComponent(uiObject.m_Group, out UIAssetCategoryData category))
                    entries.Add((asset, category.m_Menu, uiObject.m_Group));
                else
                    entries.Add((asset, Entity.Null, Entity.Null));
            }

            writer.ArrayBegin(entries.Count);
            foreach (var (asset, menu, category) in entries)
            {
                writer.TypeBegin("radialMenu.Favorite");
                writer.PropertyName("asset");
                _toolbarUISystem.BindAsset(writer, asset,
                    _uniqueAssetTrackingSystem.IsUniqueAsset(asset),
                    _uniqueAssetTrackingSystem.IsPlacedUniqueAsset(asset));
                writer.PropertyName("menu");
                if (menu != Entity.Null) writer.Write(menu);
                else writer.WriteNull();
                writer.PropertyName("category");
                if (category != Entity.Null) writer.Write(category);
                else writer.WriteNull();
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }
    }
}
