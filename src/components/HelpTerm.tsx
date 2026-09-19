import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { STATISTICS_HELP, type StatisticsHelpKey } from '../statisticsHelp';

type HelpTermProps = {
  help: StatisticsHelpKey;
  children: ReactNode;
  as?: 'span' | 'abbr';
  className?: string;
};

export function HelpTerm({ help, children, as = 'span', className = '' }: HelpTermProps) {
  const id = useId().replace(/:/g, '');
  const triggerRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties>({});
  const tooltipId = `${id}-tooltip`;
  const text = STATISTICS_HELP[help];

  useEffect(() => {
    if (!open) return;
    const update = () => {
      const element = triggerRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const padding = 8;
      const width = Math.min(320, window.innerWidth - padding * 2);
      const height = 120;
      const left = Math.min(Math.max(padding, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - padding);
      const above = rect.top > window.innerHeight / 2;
      const top = above ? Math.max(padding, rect.top - height - 8) : Math.min(window.innerHeight - height - padding, rect.bottom + 8);
      setStyle({ left: `${left}px`, top: `${top}px`, width: `${width}px` });
    };
    update();
    const listener = () => update();
    window.addEventListener('scroll', listener, true);
    window.addEventListener('resize', listener);
    return () => {
      window.removeEventListener('scroll', listener, true);
      window.removeEventListener('resize', listener);
    };
  }, [open]);

  const Tag = as === 'abbr' ? 'abbr' : 'span';
  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const toggle = () => setOpen((current) => !current);

  return (
    <>
      <Tag
        ref={(node) => {
          triggerRef.current = node;
        }}
        className={`help-term ${className}`.trim()}
        tabIndex={0}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => toggle()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
      >
        {children}
      </Tag>
      {open && createPortal(
        <div id={tooltipId} role="tooltip" className="help-tooltip" style={style}>
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
