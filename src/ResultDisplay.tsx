import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RollResult } from './protocol';
import { displayValue } from './rollService';
import { resultHeading } from './expressionName';
import './resultDisplay.css';

export function ResultDisplay({ result, announce = false }: { result: RollResult; announce?: boolean }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(false); }, [result.requestId]);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(340, window.innerWidth - 16);
      const height = Math.min(popover.current?.scrollHeight ?? 240, window.innerHeight * .55, 300);
      const top = window.innerHeight - box.bottom - 8 >= height ? box.bottom + 6 : Math.max(8, box.top - height - 6);
      setPosition({ top, left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)) });
    };
    const dismiss = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key); };
  }, [open]);
  const verification = result.verification;
  return <div className={`roll-result${verification?.state === 'verified' ? ' verified' : ''}`} role={announce ? 'status' : undefined}>
    <span className="roll-result-heading">{result.error ? 'ERROR' : resultHeading(result.expression)}:</span>
    {verification && <button ref={trigger} type="button" className={`verification-check ${verification.state}`} aria-label={verification.state === 'verified' ? 'Show verification details' : 'Show verification failure details'} aria-expanded={open} onClick={() => setOpen(value => !value)}>{verification.state === 'verified' ? '✓' : '!'}</button>}
    <strong className="roll-result-pill">{result.error ?? displayValue(result.value)}</strong>
    {result.interpretation && <span className="roll-result-interpretation">{result.interpretation}</span>}
    {open && verification && createPortal(<div ref={popover} className="verification-popover" role="region" aria-label="Verification details" style={position}>
      <div className="verification-popover-title">{verification.state === 'verified' ? 'Verified roll' : 'Verification failed'}</div>
      <pre>{JSON.stringify(verification, null, 2)}</pre>
    </div>, document.body)}
  </div>;
}
