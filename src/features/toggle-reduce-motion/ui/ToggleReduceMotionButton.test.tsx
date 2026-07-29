import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppStoreProvider } from '@/app';
import { ToggleReduceMotionButton } from './ToggleReduceMotionButton';

function renderToggle() {
  return render(
    <AppStoreProvider initialState={{ preferences: { reduceMotion: false } }}>
      <ToggleReduceMotionButton />
    </AppStoreProvider>,
  );
}

describe('ToggleReduceMotionButton', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reflects and flips the reduceMotion preference through the store', async () => {
    const user = userEvent.setup();
    renderToggle();
    const off = screen.getByRole('button', { name: /reduce motion: off/i });
    expect(off).toHaveAttribute('aria-pressed', 'false');
    await user.click(off);
    const on = screen.getByRole('button', { name: /reduce motion: on/i });
    expect(on).toHaveAttribute('aria-pressed', 'true');
  });

  it('stamps data-reduce-motion on the document element when toggled on', async () => {
    const user = userEvent.setup();
    renderToggle();
    expect(document.documentElement.dataset.reduceMotion).toBe('false');
    await user.click(screen.getByRole('button', { name: /reduce motion: off/i }));
    expect(document.documentElement.dataset.reduceMotion).toBe('true');
  });
});
