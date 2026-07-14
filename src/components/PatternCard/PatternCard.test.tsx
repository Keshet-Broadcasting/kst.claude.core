import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PatternCard } from './PatternCard';

describe('PatternCard', () => {
  it('renders its title, description and file path', () => {
    render(
      <PatternCard
        title="No theme flash"
        description="Stamps data-theme early."
        file="src/lib/theme.ts"
      />,
    );

    expect(screen.getByRole('heading', { name: 'No theme flash' })).toBeInTheDocument();
    expect(screen.getByText('Stamps data-theme early.')).toBeInTheDocument();
    expect(screen.getByText('src/lib/theme.ts')).toBeInTheDocument();
  });
});
