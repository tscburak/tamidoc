import { useCallback, useEffect, useState } from 'react';
import { IconPlus, IconPencil, IconTrash, IconCheck, IconX } from '@tabler/icons-react';
import { Button, Spinner, TextInput, ColorPicker, ConfirmDialog } from '../ui';
import { useToast } from '../../context/toast';
import { tagsService } from '../../services/tags.service';
import type { Tag } from '../../types/access';

export function TagsSection({ organizationId }: { organizationId: string }) {
  const { show } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline create
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#2563EB');
  const [creating, setCreating] = useState(false);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('#2563EB');

  const [deleting, setDeleting] = useState<Tag | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await tagsService.findAll(organizationId));
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await tagsService.create(organizationId, { name: newName.trim(), color: newColor });
      setNewName('');
      show({ title: 'Tag created', color: 'teal' });
      load();
    } catch {
      // handled
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag._id);
    setEditName(tag.name);
    setEditColor(tag.color || '#2563EB');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      await tagsService.update(organizationId, editingId, { name: editName.trim(), color: editColor });
      setEditingId(null);
      show({ title: 'Tag updated', color: 'teal' });
      load();
    } catch {
      // handled
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await tagsService.remove(organizationId, deleting._id);
      show({ title: 'Tag deleted', color: 'teal' });
      setDeleting(null);
      load();
    } catch {
      // handled
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold text-stone-800 dark:text-stone-100">Tags</h3>
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Curate the tags authors can attach to templates.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 p-4 dark:border-stone-700">
        <div className="grow" style={{ minWidth: 200 }}>
          <TextInput label="New tag" placeholder="e.g. HR" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <ColorPicker label="Color" value={newColor} onChange={setNewColor} />
        <Button onClick={handleCreate} loading={creating} leftSection={<IconPlus size={16} />}>
          Add
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) =>
            editingId === tag._id ? (
              <div key={tag._id} className="flex items-center gap-2 rounded-full border border-stone-300 p-1 pl-3 dark:border-stone-600">
                <ColorPicker value={editColor} onChange={setEditColor} />
                <input
                  className="w-24 bg-transparent text-sm outline-none"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
                <button onClick={saveEdit} className="rounded-full p-1 text-teal-600 hover:bg-teal-50">
                  <IconCheck size={14} />
                </button>
                <button onClick={() => setEditingId(null)} className="rounded-full p-1 text-stone-400 hover:bg-stone-100">
                  <IconX size={14} />
                </button>
              </div>
            ) : (
              <span
                key={tag._id}
                className="group flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-white"
                style={{ backgroundColor: tag.color || '#6B7280' }}
              >
                {tag.name}
                <button onClick={() => startEdit(tag)} className="opacity-0 transition-opacity group-hover:opacity-100">
                  <IconPencil size={12} />
                </button>
                <button onClick={() => setDeleting(tag)} className="opacity-0 transition-opacity group-hover:opacity-100">
                  <IconTrash size={12} />
                </button>
              </span>
            ),
          )}
          {!loading && tags.length === 0 && (
            <p className="text-sm text-stone-500">No tags yet. Add your first tag above.</p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        variant="danger"
        title={`Delete tag "${deleting?.name}"?`}
        message="Existing templates will keep the tag text, but it will no longer be curated."
        confirmLabel="Delete tag"
      />
    </div>
  );
}
