import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResultDisplay } from './ResultDisplay';
import type { RollResult } from './protocol';

const result: RollResult = {
  version: 1, requestId: 'roll-1', expression: 'd6 # Initiative', dialect: 'nodice', visibility: 'everyone',
  playerId: 'player', playerName: 'Player', value: 5, trace: [], time: 1,
  verification: { state: 'verified', rollId: 'roll-1', protocol: 'NODICE_VERIFIABLE_ROLL_V2', canonicalExpression: 'd6', rollerConnectionId: 'a', peerConnectionId: 'b' },
};

describe('shared result presentation', () => {
  it('keeps the name outside the result pill and opens verification in-frame', () => {
    const { container } = render(<ResultDisplay result={result} />);
    expect(screen.getByText('Initiative:')).not.toBe(screen.getByText('5'));
    expect(container.querySelector('.roll-result-pill')?.textContent).toBe('5');
    expect(container.querySelector('.roll-result.verified')).not.toBeNull();
    expect(screen.queryByText('Verified')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show verification details' }));
    expect(screen.getByRole('region', { name: 'Verification details' }).textContent).toContain('roll-1');
  });
  it('keeps ordinary and failed rolls out of the gold result scheme', () => {
    const { container, rerender } = render(<ResultDisplay result={{ ...result, verification: undefined }} />);
    expect(container.querySelector('.roll-result.verified')).toBeNull();
    rerender(<ResultDisplay result={{ ...result, verification: { ...result.verification!, state: 'failed' } }} />);
    expect(container.querySelector('.roll-result.verified')).toBeNull();
  });
});
