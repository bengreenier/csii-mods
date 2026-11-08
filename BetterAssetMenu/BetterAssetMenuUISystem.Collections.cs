using System.Collections.Generic;
using System.Linq;
using Colossal.UI.Binding;
using Unity.Entities;

namespace BetterAssetMenu
{
    /// <summary>
    /// Collections for the UI: every collection (city ones, then global ones)
    /// with its assets in the favorites' shape, and the triggers that change
    /// them. Storage is <see cref="CollectionsSystem"/>.
    /// </summary>
    public partial class BetterAssetMenuUISystem
    {
        private CollectionsSystem _collectionsSystem;
        private RawValueBinding _collections;
        private int _sentCollectionsRevision = -1;

        private void CreateCollectionsBindings()
        {
            _collectionsSystem = World.GetOrCreateSystemManaged<CollectionsSystem>();
            AddBinding(_collections = new RawValueBinding(kGroup, "collections", WriteCollections));
            // `firstAsset` is Entity.Null for an empty collection; otherwise
            // it goes in at once, as the UI never learns the new id.
            AddBinding(new TriggerBinding<string, bool, Entity>(kGroup, "createCollection",
                (name, global, firstAsset) => _collectionsSystem.Create(name, global, firstAsset)));
            AddBinding(new TriggerBinding<string, string>(kGroup, "renameCollection",
                (id, name) => _collectionsSystem.Rename(id, name)));
            AddBinding(new TriggerBinding<string>(kGroup, "deleteCollection", id => _collectionsSystem.Delete(id)));
            AddBinding(new TriggerBinding<string, Entity>(kGroup, "addToCollection",
                (id, entity) => _collectionsSystem.Add(id, entity)));
            AddBinding(new TriggerBinding<string, Entity>(kGroup, "removeFromCollection",
                (id, entity) => _collectionsSystem.Remove(id, entity)));
        }

        // Called every update: sends the collections when they changed.
        private void UpdateCollections()
        {
            if (_collectionsSystem.Revision == _sentCollectionsRevision) return;
            RefreshCollections();
        }

        // Also on menu open, with the favorites (locked/placed states).
        private void RefreshCollections()
        {
            _sentCollectionsRevision = _collectionsSystem.Revision;
            _collections.Update();
        }

        private void WriteCollections(IJsonWriter writer)
        {
            var all = _collectionsSystem.All.ToList();
            writer.ArrayBegin(all.Count);
            foreach (var collection in all)
            {
                writer.TypeBegin("betterAssetMenu.Collection");
                writer.PropertyName("id");
                writer.Write(collection.Id);
                writer.PropertyName("name");
                writer.Write(collection.Name);
                writer.PropertyName("global");
                writer.Write(collection.IsGlobal);
                writer.PropertyName("assets");
                WriteAssetEntries(writer, _collectionsSystem.GetResolvedAssets(collection));
                writer.TypeEnd();
            }
            writer.ArrayEnd();
        }
    }
}
