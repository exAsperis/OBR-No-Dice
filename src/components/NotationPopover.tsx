import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Notation {
  short: string;
  longReadable: string;
  longExpanded: string;
}

export function NotationPopover({ expression, notation }: { expression: string; notation: Notation }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, maxHeight: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !popover.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const width = Math.min(390, window.innerWidth - 16);
      const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
      const below = window.innerHeight - anchor.bottom - 14;
      const above = anchor.top - 14;
      const useAbove = above >= Math.min(160, popover.current.scrollHeight + 6) || (below < 160 && above > below);
      const maxHeight = Math.min(160, Math.max(40, useAbove ? above : below));
      const height = Math.min(popover.current.scrollHeight, maxHeight);
      setPosition({ top: useAbove ? Math.max(8, anchor.top - height - 6) : anchor.bottom + 6, left, maxHeight });
    };
    const dismiss = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popover.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, expression, notation]);

  return <>
    <button ref={trigger} type="button" className="notation-trigger" aria-expanded={open} aria-controls={open ? 'notation-popover' : undefined} onClick={() => setOpen(value => !value)}>▸ Notation</button>
    {open && createPortal(<div id="notation-popover" ref={popover} className="notation-popover" role="region" aria-label="Notation" style={position}>
      <dl><dt>Original</dt><dd>{expression}</dd><dt>Short</dt><dd>{notation.short}</dd><dt>Readable long</dt><dd>{notation.longReadable}</dd><dt>Expanded</dt><dd>{notation.longExpanded}</dd></dl>
    </div>, document.body)}
  </>;
}
