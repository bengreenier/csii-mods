using System.Collections.Generic;
using Colossal.UI.Binding;
using Game.Prefabs;
using Game.UI;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// Platter (Paradox Mods 125278): its parcel sizes as menu items. Platter
    /// adds one toolbar item, a "Parcel" selector in Zones > "Platter - Parcels",
    /// whose size is set in Platter's own panel. Its sized prefabs ("Parcel WxD")
    /// aren't in the toolbar, so BAM lists them in that category itself, where
    /// search, favorites and size: can reach them. See docs/game-internals.md#platter.
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        // Platter's names (P_PrefabsCreateSystem, ParcelUtils.GetPrefabID).
        private static readonly PrefabID kPlatterCategory = new PrefabID("UIAssetCategoryPrefab", "PlatterCat");
        private static readonly PrefabID kPlatterSelector = new PrefabID("ParcelSelectorPrefab", "Parcel");
        private static PrefabID PlatterParcel(int w, int d) => new PrefabID("ParcelPrefab", $"Parcel {w}x{d}");
        private static PrefabID PlatterPlaceholder(int w, int d) => new PrefabID("ParcelPlaceholderPrefab", $"ParcelPlaceholder {w}x{d}");
        // Platter 1.6 makes widths 1-8 and depths 2-6 (AvailableParcelLotSizes);
        // probing further picks up any sizes it adds later.
        private const int kPlatterMaxLot = 16;

        private struct PlatterParcelInfo
        {
            public Entity Parcel;
            public Entity Placeholder;
            public int Width;
            public int Depth;
        }

        private RawValueBinding _platterParcels;
        // Found once per load, when the menu opens (and on loading complete).
        // Platter creates its prefabs once per session, on its first preload
        // or loading complete; until its category exists, every menu open
        // looks again (two prefab lookups).
        private bool _platterLookedUp;
        private Entity _platterCategory;
        private string _platterIcon;
        private List<PlatterParcelInfo> _platter = new List<PlatterParcelInfo>();
        private Dictionary<Entity, Entity> _platterPlaceholderOf = new Dictionary<Entity, Entity>();

        private void CreatePlatterBindings()
        {
            AddBinding(_platterParcels = new RawValueBinding(kGroup, "platterParcels", WritePlatterParcels));
        }

        private void ResetPlatter()
        {
            _platterLookedUp = false;
            _platterCategory = Entity.Null;
            _platterIcon = null;
            _platter = new List<PlatterParcelInfo>();
            _platterPlaceholderOf = new Dictionary<Entity, Entity>();
            _platterParcels.Update();
        }

        // From loading complete (before assetMeta is built) and RefreshAllAssets
        // (menu open, Refresh). True when it found the sizes just now: assetMeta
        // then needs rebuilding for their size: data.
        private bool LookUpPlatter()
        {
            if (_platterLookedUp) return false;
            if (!_prefabSystem.TryGetPrefab(kPlatterCategory, out PrefabBase category) ||
                !_prefabSystem.TryGetPrefab(kPlatterSelector, out PrefabBase selector))
                return false;
            _platterLookedUp = true;

            var parcels = new List<PlatterParcelInfo>();
            for (var w = 1; w <= kPlatterMaxLot; w++)
            for (var d = 1; d <= kPlatterMaxLot; d++)
            {
                if (!_prefabSystem.TryGetPrefab(PlatterParcel(w, d), out PrefabBase parcel) ||
                    !_prefabSystem.TryGetPrefab(PlatterPlaceholder(w, d), out PrefabBase placeholder))
                    continue;
                parcels.Add(new PlatterParcelInfo
                {
                    Parcel = _prefabSystem.GetEntity(parcel),
                    Placeholder = _prefabSystem.GetEntity(placeholder),
                    Width = w,
                    Depth = d,
                });
            }
            if (parcels.Count == 0)
            {
                Mod.LOG.Warn("Platter's category is loaded but none of its parcel sizes are; its sizes aren't listed");
                return false;
            }
            // Width first, then depth: "Parcel (1x2)", "Parcel (1x3)", ...
            parcels.Sort((a, b) => a.Width != b.Width ? a.Width.CompareTo(b.Width) : a.Depth.CompareTo(b.Depth));

            _platterCategory = _prefabSystem.GetEntity(category);
            // The sized prefabs have no UIObject, so no icon of their own.
            _platterIcon = ImageSystem.GetIcon(selector);
            _platter = parcels;
            foreach (var p in parcels) _platterPlaceholderOf[p.Parcel] = p.Placeholder;
            Mod.LOG.Info($"Platter: listing {parcels.Count} parcel sizes");
            _platterParcels.Update();
            return true;
        }

        // What activatePrefab places for a listed size: its placeholder, as
        // Platter's own panel does (P_UISystem.UpdateSelectedPrefab). Platter
        // then takes the size from it. Unlike Platter's panel, the (hidden)
        // vanilla toolbar isn't pointed at the "Parcel" selector.
        private Entity PlatterPlaceholderOf(Entity entity) =>
            _platterPlaceholderOf.TryGetValue(entity, out var placeholder) ? placeholder : entity;

        // A listed size's lot, for assetMeta (size:, w:, d:); null otherwise.
        private (int width, int depth)? PlatterParcelSize(Entity entity)
        {
            // Called for every asset in assetMeta: the map check keeps it cheap.
            if (!_platterPlaceholderOf.ContainsKey(entity)) return null;
            foreach (var p in _platter)
                if (p.Parcel == entity) return (p.Width, p.Depth);
            return null;
        }

        // Writes an asset as vanilla's toolbar does, with Platter's parcel icon
        // for its sizes.
        private void WriteAsset(IJsonWriter writer, Entity entity)
        {
            if (_platterIcon != null && _platterPlaceholderOf.ContainsKey(entity))
                writer = new IconOverrideWriter(writer, _platterIcon);
            _toolbarUISystem.BindAsset(writer, entity,
                _uniqueAssetTrackingSystem.IsUniqueAsset(entity),
                _uniqueAssetTrackingSystem.IsPlacedUniqueAsset(entity));
        }

        // null without Platter, else { category, assets } (assets in
        // toolbar.Asset's shape).
        private void WritePlatterParcels(IJsonWriter writer)
        {
            if (_platter.Count == 0)
            {
                writer.WriteNull();
                return;
            }
            writer.TypeBegin("betterAssetMenu.PlatterParcels");
            writer.PropertyName("category");
            writer.Write(_platterCategory);
            writer.PropertyName("assets");
            writer.ArrayBegin(_platter.Count);
            foreach (var p in _platter) WriteAsset(writer, p.Parcel);
            writer.ArrayEnd();
            writer.TypeEnd();
        }

        /// <summary>
        /// Passes everything through, except the asset's own top-level "icon"
        /// value (ToolbarUISystem.BindAsset writes one toolbar.Asset object).
        /// </summary>
        private sealed class IconOverrideWriter : IJsonWriter
        {
            private readonly IJsonWriter _inner;
            private readonly string _icon;
            private int _depth;
            private bool _replaceNext;

            public IconOverrideWriter(IJsonWriter inner, string icon)
            {
                _inner = inner;
                _icon = icon;
            }

            public string debugName => _inner.debugName;

            public void TypeBegin(string name) { _depth++; _replaceNext = false; _inner.TypeBegin(name); }
            public void TypeEnd() { _depth--; _inner.TypeEnd(); }
            public void MapBegin(uint size) { _depth++; _replaceNext = false; _inner.MapBegin(size); }
            public void MapEnd() { _depth--; _inner.MapEnd(); }
            public void ArrayBegin(uint size) { _depth++; _replaceNext = false; _inner.ArrayBegin(size); }
            public void ArrayEnd() { _depth--; _inner.ArrayEnd(); }

            public void PropertyName(string name)
            {
                _replaceNext = _depth == 1 && name == "icon";
                _inner.PropertyName(name);
            }

            public void Write(string value) => _inner.Write(Take() ? _icon : value);
            public void WriteNull() { if (Take()) _inner.Write(_icon); else _inner.WriteNull(); }
            public void Write(bool value) { Take(); _inner.Write(value); }
            public void Write(int value) { Take(); _inner.Write(value); }
            public void Write(uint value) { Take(); _inner.Write(value); }
            public void Write(long value) { Take(); _inner.Write(value); }
            public void Write(ulong value) { Take(); _inner.Write(value); }
            public void Write(float value) { Take(); _inner.Write(value); }
            public void Write(double value) { Take(); _inner.Write(value); }

            private bool Take()
            {
                var replace = _replaceNext;
                _replaceNext = false;
                return replace;
            }
        }
    }
}
