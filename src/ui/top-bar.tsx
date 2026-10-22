import Link from 'next/link';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
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

/** 18px line icons for the bar, drawn like the logo. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const SearchIcon = () => (
  <Icon>
    <circle cx="7.5" cy="7.5" r="5" />
    <path d="M11.5 11.5 16 16" />
  </Icon>
);

const SoundIcon = ({ on }: { on: boolean }) => (
  <Icon>
    <path d="M2.5 6.5h3l4-3.5v12l-4-3.5h-3z" />
    {on ? <path d="M12.5 6.5a3.5 3.5 0 0 1 0 5M14.5 4a7 7 0 0 1 0 10" /> : <path d="m12.5 7 4 4m0-4-4 4" />}
  </Icon>
);

/** A ball with speed lines; crossed out when motion is off. */
const MotionIcon = ({ on }: { on: boolean }) => (
  <Icon>
    <circle cx="12.5" cy="9" r="3" />
    <path d="M2 6h5M1.5 9h5M2 12h5" />
    {!on && <path d="m2 2 14 14" />}
  </Icon>
);

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
        <li>
          <Link href="/syllabus" className="mi c-sky" onClick={() => setOpen(false)}>
            <span className="g" aria-hidden="true">
              §
            </span>
            <span>
              <strong>Syllabus</strong>
              <span>Every point of your exam syllabus, with its lessons.</span>
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
          {/* An icon in the bar; the open Menu on small screens shows the word too. */}
          <Link className="nl nl-icon" href="/search" aria-current={current('search')} title="Search">
            <SearchIcon />
            <span className="nl-label">Search</span>
          </Link>
          <Link className="nl" href="/saved" aria-current={current('saved')}>
            Saved
          </Link>
          <div className="tools">
            {/* Icon toggles: the name stays put and aria-pressed says on or off; the tooltip says it in words. */}
            <button
              type="button"
              className="ui-toggle ui-icon"
              aria-label="Sound"
              aria-pressed={sound}
              title={sound ? 'Sound on' : 'Sound off'}
              onClick={() => {
                toggleSound();
                // Turning sound on is the user gesture that unlocks audio; confirm with the start chime.
                if (!sound) play('start', true);
              }}
            >
              <SoundIcon on={sound} />
            </button>
            <button
              type="button"
              className="ui-toggle ui-icon"
              aria-label="Motion"
              aria-pressed={motion}
              title={motion ? 'Motion on' : 'Motion off'}
              onClick={toggleMotion}
            >
              <MotionIcon on={motion} />
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
