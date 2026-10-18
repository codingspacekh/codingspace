import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useSubjects } from '@/lib/subjects';
import { usePrefs, useSound } from './arwes/prefs';

function Logo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 2 25 8.5v11L14 26 3 19.5v-11L14 2Z" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 11l-3 3 3 3M18 11l3 3-3 3M15.5 9.5l-3 9"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Study ▾ disclosure: a button that shows a list of links (not an ARIA menu; plain Tab order works). */
function StudyMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const { subjects } = useSubjects();
  const menuId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent | MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div className={`dd${open ? ' open' : ''}`} ref={root}>
      <button
        ref={button}
        type="button"
        className={`nl${active ? ' on' : ''}`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        Study
        <svg className="caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      <ul className="menu" id={menuId} hidden={!open}>
        {subjects.map((s) => (
          <li key={s.id}>
            <Link href={`/study/${s.id}`} className={`mi c-${s.color}`} onClick={() => setOpen(false)}>
              <span className="g" aria-hidden="true">
                {s.glyph}
              </span>
              <span>
                <strong>{s.name}</strong>
                <span>{s.blurb}</span>
              </span>
            </Link>
          </li>
        ))}
        <li>
          <Link href="/series" className="mi c-pink" onClick={() => setOpen(false)}>
            <span className="g" aria-hidden="true">
              ⇢
            </span>
            <span>
              <strong>Series</strong>
              <span>Lessons from across subjects, in the order to take them.</span>
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}

export type NavItem = 'home' | 'study' | 'projects' | 'author' | 'search' | 'saved';

export function TopBar({ active }: { active?: NavItem }) {
  const { sound, motion, toggleSound, toggleMotion } = usePrefs();
  const play = useSound();
  const [navOpen, setNavOpen] = useState(false);
  const navId = useId();
  const current = (item: NavItem) => (active === item ? 'page' : undefined);

  return (
    <header className="ui-bar">
      <div className="bar-inner">
        <Link href="/" className="ui-logo" aria-label="CodingSpaceKH home">
          <Logo />
          <span>
            Coding<b>Space</b>KH
          </span>
        </Link>
        <button
          type="button"
          className="burger"
          aria-expanded={navOpen}
          aria-controls={navId}
          onClick={() => setNavOpen((o) => !o)}
        >
          Menu
        </button>
        <nav id={navId} className={`main-nav${navOpen ? ' show' : ''}`} aria-label="Main">
          <Link className="nl" href="/" aria-current={current('home')}>
            Home
          </Link>
          <StudyMenu active={active === 'study'} />
          <Link className="nl" href="/projects" aria-current={current('projects')}>
            Projects
          </Link>
          <Link className="nl" href="/author" aria-current={current('author')}>
            Author
          </Link>
          <Link className="nl" href="/search" aria-current={current('search')}>
            Search
          </Link>
          <Link className="nl" href="/saved" aria-current={current('saved')}>
            Saved
          </Link>
          <div className="tools">
            <button
              type="button"
              className="ui-toggle"
              aria-pressed={sound}
              onClick={() => {
                toggleSound();
                // Turning sound on is the user gesture that unlocks audio; confirm with the start chime.
                if (!sound) play('start', true);
              }}
            >
              Sound {sound ? 'on' : 'off'}
            </button>
            <button type="button" className="ui-toggle" aria-pressed={motion} onClick={toggleMotion}>
              Motion {motion ? 'on' : 'off'}
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
