import { Animator, Dots, GridLines } from '@arwes/react';

// Loaded lazily by <Backdrop> so canvas setup never competes with hydration.
export default function BackdropCanvas() {
  return (
    <Animator active>
      <GridLines lineColor="rgba(24, 228, 236, 0.07)" distance={48} />
      <Dots color="rgba(24, 228, 236, 0.12)" distance={48} />
    </Animator>
  );
}
