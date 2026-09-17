import type { ReactNode } from 'react';
import './toggle.css';

export function Toggle({ checked, disabled = false, onChange, children, className = '' }: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return <label className={`obr-toggle ${className}`}>
    <input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} />
    <span className="obr-toggle-track" aria-hidden="true" />
    <span>{children}</span>
  </label>;
}
