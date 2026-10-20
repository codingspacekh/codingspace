import { useId, useRef, useState } from 'react';
import { IMAGE_ACCEPT, type MediaKind } from '@/lib/media-rules';
import type { UploadedMedia } from '@/lib/media-upload';
import { thumbnailUrl } from '@/lib/media-urls';
import { moveItem } from '@/lib/post-rules';
import { PROJECT_LIMITS, PROJECT_TEXT, SHOWCASE_COLORS } from '@/lib/project-page';
import { MediaPicker } from './media-library';
import type { AdminShowcaseRow } from './project-page-fields';

type Upload = (file: File, kind: MediaKind) => Promise<UploadedMedia>;

const blankRow = (m: { id: string; widths: number[] }): AdminShowcaseRow => ({
  media_id: m.id,
  widths: m.widths,
  label: '',
  title: '',
  text: '',
  points: '',
  color: '',
});

/**
 * The showcase (2026-10-20): big rows of screenshot and text, alternating sides on the page. A row
 * starts from its image (uploaded or from the media library); the image can be changed later.
 */
export function ShowcaseEditor({
  rows,
  upload,
  onChange,
}: {
  rows: AdminShowcaseRow[];
  upload: Upload;
  /** Takes an update: uploads finish after the click. */
  onChange: (update: (prev: AdminShowcaseRow[]) => AdminShowcaseRow[]) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  /** Which row the next image is for: a row's index, or 'new'. */
  const [target, setTarget] = useState<number | 'new'>('new');
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState('');
  const full = rows.length >= PROJECT_LIMITS.showcase;

  const set = (i: number, change: Partial<AdminShowcaseRow>) =>
    onChange((prev) => prev.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const place = (m: { id: string; widths: number[] }, at: number | 'new') =>
    onChange((prev) =>
      at === 'new'
        ? prev.length >= PROJECT_LIMITS.showcase
          ? prev
          : [...prev, blankRow(m)]
        : prev.map((r, j) => (j === at ? { ...r, media_id: m.id, widths: m.widths } : r)),
    );

  async function chosen(file: File | undefined) {
    if (!file) return;
    const at = target;
    setNote(`Uploading “${file.name}”…`);
    try {
      const m = await upload(file, 'image');
      place(m, at);
      setNote(at === 'new' ? `Row added with “${file.name}”: give it a title.` : `Image changed to “${file.name}”.`);
    } catch (e) {
      setNote(`Couldn’t upload “${file.name}”: ${e instanceof Error ? e.message : 'try again'}`);
    }
  }
  const pickImage = (at: number | 'new', from: 'upload' | 'library') => {
    setTarget(at);
    if (from === 'upload') input.current?.click();
    else setPicking(true);
  };

  return (
    <fieldset className="adm-fieldset">
      <legend>Showcase rows</legend>
      <p className="adm-hint">
        Up to {PROJECT_LIMITS.showcase} rows. Points: one per line; a short code before a colon (V4: Captions) shows as
        a tag.
      </p>
      {rows.length > 0 && (
        <ol className="adm-pj-list adm-show-list" aria-label="Showcase rows">
          {rows.map((r, i) => (
            <li key={`${r.media_id}-${i}`}>
              <div className="adm-show-image">
                {thumbnailUrl(r.media_id, r.widths) && (
                  <img src={thumbnailUrl(r.media_id, r.widths)!} alt={`Row ${i + 1}`} width={160} />
                )}
                <span className="adm-quick">
                  <button type="button" className="btn" onClick={() => pickImage(i, 'upload')}>
                    Upload another image <span className="sr-only">for row {i + 1}</span>
                  </button>
                  <button type="button" className="btn" onClick={() => pickImage(i, 'library')}>
                    From the library <span className="sr-only">for row {i + 1}</span>
                  </button>
                </span>
              </div>
              <label>
                Label (optional, e.g. Video mode · 11.1)
                <input
                  id={`${id}-${i}-label`}
                  maxLength={PROJECT_TEXT.showcaseLabel}
                  value={r.label}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
              </label>
              <label>
                Title
                <input
                  id={`${id}-${i}-title`}
                  maxLength={PROJECT_TEXT.showcaseTitle}
                  value={r.title}
                  onChange={(e) => set(i, { title: e.target.value })}
                />
              </label>
              <label>
                Text
                <textarea
                  id={`${id}-${i}-text`}
                  rows={2}
                  maxLength={PROJECT_TEXT.showcaseText}
                  value={r.text}
                  onChange={(e) => set(i, { text: e.target.value })}
                />
              </label>
              <label>
                Points (one per line)
                <textarea
                  id={`${id}-${i}-points`}
                  rows={3}
                  value={r.points}
                  onChange={(e) => set(i, { points: e.target.value })}
                />
              </label>
              <label>
                Colour
                <select
                  id={`${id}-${i}-color`}
                  value={r.color}
                  onChange={(e) => set(i, { color: e.target.value as AdminShowcaseRow['color'] })}
                >
                  <option value="">The subject’s</option>
                  {SHOWCASE_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {c[0]!.toUpperCase() + c.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="adm-quick">
                <button
                  type="button"
                  className="btn"
                  disabled={i === 0}
                  aria-label={`Move row ${i + 1} up`}
                  onClick={() => onChange((prev) => moveItem(prev, i, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={i === rows.length - 1}
                  aria-label={`Move row ${i + 1} down`}
                  onClick={() => onChange((prev) => moveItem(prev, i, 1))}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label={`Remove row ${i + 1}`}
                  onClick={() => onChange((prev) => prev.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className="adm-quick">
        <button type="button" className="btn" disabled={full} onClick={() => pickImage('new', 'upload')}>
          Add a row: upload its image
        </button>
        <button type="button" className="btn" disabled={full} onClick={() => pickImage('new', 'library')}>
          Add a row: image from the library
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        aria-label="Upload a showcase image"
        onChange={(e) => {
          void chosen(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <p className="adm-live" role="status">
        {note}
      </p>
      {picking && (
        <MediaPicker
          onClose={() => setPicking(false)}
          onPick={(m) => {
            setPicking(false);
            if (m.kind !== 'image') return setNote('Choose an image, not a file.');
            place(m, target);
            setNote(target === 'new' ? `Row added with “${m.original_name}”: give it a title.` : 'Image changed.');
          }}
        />
      )}
    </fieldset>
  );
}
