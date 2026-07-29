import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  it('renders the welcome heading', () => {
    render(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Come with me');
  });

  it('renders the terminal command', () => {
    render(<HomePage />);
    expect(screen.getByText('pnpm dev')).toBeInTheDocument();
  });
});
