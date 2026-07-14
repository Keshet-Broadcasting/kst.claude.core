import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hero } from './Hero';

describe('Hero', () => {
  it('renders the starter title and pitch', () => {
    render(<Hero />);

    expect(screen.getByRole('heading', { level: 1, name: 'Starter' })).toBeInTheDocument();
    expect(screen.getByText(/team starter stack/i)).toBeInTheDocument();
  });
});
