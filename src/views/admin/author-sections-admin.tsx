import type { Dispatch, SetStateAction } from 'react';
import {
  cleanItem,
  KINDS,
  splitTags,
  type AuthorItem,
  type AuthorSection,
  type ItemField,
  type SectionKind,
} from '@/lib/author';
import { moveItem } from '@/lib/post-rules';
import { landingUrlProblem } from '@/lib/site-rules';

/**
 * The Author page's sections in the admin (03 ADM-14): the owner orders them, renames them, hides
 * them or single items, and adds custom ones. Part of the Author form: saved with Save.
 */

export type ItemState = Omit<AuthorItem, 'url' | 'tags'> & { key: number; url: string; tags: string };
export type SectionState = Omit<AuthorSection, 'items'> & { key: number; items: ItemState[] };

const MAX_SECTIONS = 40;
const MAX_ITEMS = 50;

let nextKey = 0;
const blank: AuthorItem = { title: '', subtitle: '', period: '', note: '', url: null, tags: [], visible: true };
const itemState = (i: AuthorItem): ItemState => ({ ...i, key: ++nextKey, url: i.url ?? '', tags: i.tags.join(', ') });

export const sectionState = (s: AuthorSection): SectionState => ({
  ...s,
  key: ++nextKey,
  items: s.items.map(itemState),
});

/** What the API takes: each item with only the fields its kind uses. */
export const sectionsBody = (sections: SectionState[]): AuthorSection[] =>
  sections.map(({ kind, title, visible, items }) => ({
    kind,
    title,
    visible,
    items: items.map((i) => cleanItem(kind, { ...i, url: i.url.trim() || null, tags: splitTags(i.tags) })),
  }));

/** The name in the admin: a built-in section's kind, or "Custom section 2" (they can be renamed). */
function labelOf(s: SectionState, all: SectionState[]) {
  if (s.kind !== 'custom') return KINDS[s.kind].title;
  return `Custom section ${all.filter((x) => x.kind === 'custom').indexOf(s) + 1}`;
}

/** What stops saving, if anything: the server checks the same. */
export function sectionsProblem(sections: SectionState[]): string | null {
  for (const s of sections) {
    const label = labelOf(s, sections);
    if (!s.title.trim()) return `${label}: add a heading.`;
    for (const [j, it] of s.items.entries()) {
      const where = `${label}, item ${j + 1}`;
      if (!it.title.trim()) return `${where}: fill in “${KINDS[s.kind].fields.title}”, or remove the item.`;
      const url = it.url.trim() && landingUrlProblem(it.url);
      if (url) return `${where}: ${url}`;
      const tags = splitTags(it.tags);
      if (tags.length > 30 || tags.some((t) => t.length > 40))
        return `${where}: at most 30 skills, each up to 40 characters.`;
    }
  }
  return null;
}

const LONG: ItemField[] = ['note'];

export function SectionsEditor({
  sections,
  onChange,
}: {
  sections: SectionState[];
  onChange: Dispatch<SetStateAction<SectionState[]>>;
}) {
  const setSection = (key: number, patch: Partial<SectionState>) =>
    onChange((list) => list.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const setItems = (key: number, update: (items: ItemState[]) => ItemState[]) =>
    onChange((list) => list.map((s) => (s.key === key ? { ...s, items: update(s.items) } : s)));

  return (
    <fieldset className="adm-author-sections">
      <legend>Sections (shown on the page in this order)</legend>
      <p className="adm-hint">
        Empty sections don’t show on the page. Notes and details can use Markdown, like the bio.
      </p>
      {sections.map((s, i) => (
        <fieldset key={s.key} className="adm-timeline adm-author-section">
          <legend>{labelOf(s, sections)}</legend>
          <div className="adm-row">
            <label className="adm-grow">
              Heading
              <input value={s.title} maxLength={80} onChange={(e) => setSection(s.key, { title: e.target.value })} />
            </label>
            <label className="adm-inline">
              <input
                type="checkbox"
                checked={s.visible}
                onChange={(e) => setSection(s.key, { visible: e.target.checked })}
              />
              Show this section
            </label>
            <span className="adm-quick">
              <button
                type="button"
                className="btn"
                disabled={i === 0}
                aria-label="Move section up"
                onClick={() => onChange((list) => moveItem(list, i, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                disabled={i === sections.length - 1}
                aria-label="Move section down"
                onClick={() => onChange((list) => moveItem(list, i, 1))}
              >
                ↓
              </button>
              {s.kind === 'custom' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onChange((list) => list.filter((x) => x.key !== s.key))}
                >
                  Remove section
                </button>
              )}
            </span>
          </div>
          {s.kind === 'life_posts' ? (
            <p className="adm-hint">Your published life posts show here, newest first.</p>
          ) : (
            <Items kind={s.kind} items={s.items} onChange={(update) => setItems(s.key, update)} />
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="btn"
        disabled={sections.length >= MAX_SECTIONS}
        onClick={() =>
          onChange((list) => [...list, sectionState({ kind: 'custom', title: '', visible: true, items: [] })])
        }
      >
        Add a custom section
      </button>
    </fieldset>
  );
}

function Items({
  kind,
  items,
  onChange,
}: {
  kind: SectionKind;
  items: ItemState[];
  onChange: (update: (items: ItemState[]) => ItemState[]) => void;
}) {
  const fields = Object.entries(KINDS[kind].fields) as [ItemField, string][];
  const setItem = (key: number, patch: Partial<ItemState>) =>
    onChange((list) => list.map((t) => (t.key === key ? { ...t, ...patch } : t)));

  return (
    <>
      {items.length === 0 && <p className="meta">Nothing here yet.</p>}
      <ol>
        {items.map((t, j) => (
          <li key={t.key}>
            {fields.map(([field, label]) =>
              LONG.includes(field) ? (
                <label key={field} className="adm-full">
                  {label}
                  <textarea
                    rows={2}
                    maxLength={2000}
                    value={t[field]}
                    onChange={(e) => setItem(t.key, { [field]: e.target.value })}
                  />
                </label>
              ) : (
                <label key={field} className={field === 'period' ? 'adm-period' : 'adm-grow'}>
                  {label}
                  <input
                    value={t[field]}
                    maxLength={{ title: 300, subtitle: 200, period: 40, url: 500, tags: 1500 }[field as string]}
                    onChange={(e) => setItem(t.key, { [field]: e.target.value })}
                  />
                </label>
              ),
            )}
            <span className="adm-quick">
              <label className="adm-inline">
                <input
                  type="checkbox"
                  checked={t.visible}
                  onChange={(e) => setItem(t.key, { visible: e.target.checked })}
                />
                Show <span className="sr-only">item {j + 1}</span>
              </label>
              <button
                type="button"
                className="btn"
                disabled={j === 0}
                aria-label={`Move item ${j + 1} up`}
                onClick={() => onChange((list) => moveItem(list, j, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                disabled={j === items.length - 1}
                aria-label={`Move item ${j + 1} down`}
                onClick={() => onChange((list) => moveItem(list, j, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn"
                aria-label={`Remove item ${j + 1}`}
                onClick={() => onChange((list) => list.filter((x) => x.key !== t.key))}
              >
                Remove
              </button>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="btn"
        disabled={items.length >= MAX_ITEMS}
        onClick={() =>
          onChange((list) => [
            ...list,
            itemState(kind === 'timeline' ? { ...blank, period: String(new Date().getFullYear()) } : blank),
          ])
        }
      >
        {KINDS[kind].add}
      </button>
    </>
  );
}
