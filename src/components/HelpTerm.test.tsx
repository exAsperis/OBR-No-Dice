import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HelpTerm } from './HelpTerm';
import { STATISTICS_HELP } from '../statisticsHelp';

describe('HelpTerm', () => {
  it('renders the visible term and exposes the glossary text via accessible tooling when opened', () => {
    render(<HelpTerm help="percentile">Average percentile</HelpTerm>);
    const term = screen.getByText('Average percentile');
    expect(term.getAttribute('tabindex')).toBe('0');
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseOver(term);
    expect(term.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByRole('tooltip').textContent).toContain(STATISTICS_HELP.percentile);
  });

  it('reveals and hides the tooltip on hover and focus', () => {
    render(<HelpTerm help="distribution">Distribution</HelpTerm>);
    const term = screen.getByText('Distribution');
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseOver(term);
    expect(screen.getByRole('tooltip')?.textContent).toContain(STATISTICS_HELP.distribution);
    fireEvent.mouseLeave(term);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(term);
    expect(screen.getByRole('tooltip')?.textContent).toContain(STATISTICS_HELP.distribution);
    fireEvent.blur(term);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps separate ids for multiple terms', () => {
    render(
      <>
        <HelpTerm help="mean">Mean</HelpTerm>
        <HelpTerm help="median">Median</HelpTerm>
      </>,
    );
    const terms = screen.getAllByText(/Mean|Median/);
    fireEvent.mouseOver(terms[0]);
    fireEvent.mouseOver(terms[1]);
    const ids = terms.map((term) => term.getAttribute('aria-describedby'));
    expect(ids[0]).not.toBe(ids[1]);
  });
});
