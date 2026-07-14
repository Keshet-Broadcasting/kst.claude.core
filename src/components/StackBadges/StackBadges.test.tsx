import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StackBadges } from './StackBadges';

describe('StackBadges', () => {
  it('renders every stack badge', () => {
    render(<StackBadges />);

    for (const label of ['Next 16', 'React 19', 'Zustand', 'CSS Modules', 'TypeScript']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
