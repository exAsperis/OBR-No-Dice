import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Owlbear-style toggle', () => {
  it('retains native checkbox semantics and responds through its label', () => {
    const onChange = vi.fn();
    const { rerender, container } = render(<Toggle checked={false} onChange={onChange}>Auto-dismiss</Toggle>);
    const input = screen.getByRole('checkbox', { name: 'Auto-dismiss' }) as HTMLInputElement;
    expect(input.checked).toBe(false);
    expect(container.querySelector('.obr-toggle-track')).not.toBeNull();
    fireEvent.click(screen.getByText('Auto-dismiss'));
    expect(onChange).toHaveBeenCalledWith(true);
    rerender(<Toggle checked disabled onChange={onChange}>Auto-dismiss</Toggle>);
    expect(input.checked).toBe(true);
    expect(input.disabled).toBe(true);
  });
});
