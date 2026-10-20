import { act, fireEvent, renderHook } from '@testing-library/react';
import { audioAllowed, useAudioAllowed } from '@/ui/audio-gate';

// jsdom has no navigator.userActivation, like browsers before it (Safari < 16.4, Firefox < 120):
// then the first click, tap or key press on the page stands in for it.
describe('audio gate without navigator.userActivation', () => {
  it('is closed until the first press; Escape and pointing at things do not count', () => {
    expect('userActivation' in navigator).toBe(false);
    const { result } = renderHook(() => useAudioAllowed());
    expect(result.current).toBe(false);
    act(() => {
      fireEvent.pointerOver(document.body);
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    expect(result.current).toBe(false);
    expect(audioAllowed()).toBe(false);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Enter' });
    });
    expect(result.current).toBe(true);
    expect(audioAllowed()).toBe(true);
  });
});
