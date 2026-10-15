import Link from 'next/link';
import { usePrefs, useSound } from './arwes/prefs';

export function TopBar() {
  const { sound, toggleSound } = usePrefs();
  const play = useSound();
  return (
    <header className="ui-bar">
      <Link href="/" className="ui-logo" onMouseEnter={() => play('hover')}>
        Coding<b>Space</b>
      </Link>
      <button
        type="button"
        className="ui-toggle"
        aria-pressed={sound}
        onClick={() => {
          toggleSound();
          // Turning sound on is the user gesture that unlocks audio; confirm with a click.
          if (!sound) play('click', true);
        }}
      >
        Sound {sound ? 'on' : 'off'}
      </button>
    </header>
  );
}
