/**
 * Grid-and-dots background. Pure CSS (.ui-backdrop in globals.css), as in the approved prototype:
 * the animated Arwes canvas cost ~1.5 s of phone main-thread time and failed the M2 Lighthouse gate.
 */
export function Backdrop() {
  return <div className="ui-backdrop" data-testid="backdrop" aria-hidden="true" />;
}
