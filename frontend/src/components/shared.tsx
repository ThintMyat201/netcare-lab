import React, { ReactNode, useEffect, useState } from 'react';
import { LoaderCircle, AlertCircle, Inbox, Radio, ChevronDown } from 'lucide-react';
import type { DialogContentProps, DialogDescriptionProps, DialogTitleProps } from '@radix-ui/react-dialog';
import { Button as BaseButton } from './ui/button';
import {
  Dialog,
  DialogContent as BaseContent,
  DialogTitle as BaseTitle,
  DialogDescription as BaseDescription,
} from './ui/dialog';
import { api, errorText } from '../lib/api';

// ui/dialog.jsx is plain JavaScript, so give its parts the Radix prop types plus the test id we pass.
type TestId = { 'data-testid'?: string };
const DialogContent = BaseContent as React.ComponentType<DialogContentProps & TestId>;
const DialogTitle = BaseTitle as React.ComponentType<DialogTitleProps & TestId>;
const DialogDescription = BaseDescription as React.ComponentType<DialogDescriptionProps & TestId>;
// ui/button.jsx is plain JavaScript too; these are the props its cva variants accept.
const ShadButton = BaseButton as React.ComponentType<
  React.ButtonHTMLAttributes<HTMLButtonElement> & TestId & { variant?: string; size?: string; asChild?: boolean }
>;

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Rendered as data-testid, not as the element id. */
  id?: string;
  variant?: 'primary' | 'secondary' | string;
  size?: 'default' | 'sm' | 'lg' | 'icon' | string;
};
export const Button = ({ children, id, variant = 'secondary', className = '', ...props }: ButtonProps) => (
  <ShadButton
    data-testid={id}
    variant={variant === 'primary' ? 'default' : 'outline'}
    className={`btn ${variant} ${className}`}
    {...props}
  >
    {children}
  </ShadButton>
);
const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  congested: 'Congested',
  offline: 'Offline',
  stale: 'Feed Interrupted',
  open: 'Open',
  in_progress: 'In Progress',
  on_duty: 'On Duty / In Progress',
  completed: 'Shift Completed',
  pending_ack: 'Pending Acknowledgement',
  resolved: 'Resolved',
  active: 'Active',
  inactive: 'Deactivated',
  archived: 'Archived',
  acknowledged: 'On Duty / In Progress',
  missed: 'Pending Acknowledgement',
  pending: 'Pending Acknowledgement',
  upcoming: 'Upcoming',
  high: 'High Priority',
  medium: 'Medium Priority',
  low: 'Low Priority',
};
export const Status = ({ value, id }: { value: string; id?: string }) => (
  <span data-testid={id} className={`status ${value}`}>
    <i />
    {STATUS_LABELS[value] || value}
  </span>
);
export const Logo = () => (
  <div className="brand" data-testid="atlas-brand">
    <span className="brand-icon">
      <Radio size={23} />
    </span>
    <span>
      atlas<span className="brand-suffix">netcare</span>
    </span>
  </div>
);
type PageTitleProps = { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; children?: ReactNode };
export const PageTitle = ({ eyebrow, title, subtitle, children }: PageTitleProps) => (
  <header className="page-title">
    <div>
      {eyebrow && (
        <span className="eyebrow" data-testid="page-eyebrow">
          {eyebrow}
        </span>
      )}
      <h1 data-testid="page-title">{title}</h1>
      {subtitle && <p data-testid="page-subtitle">{subtitle}</p>}
    </div>
    <div className="page-actions">{children}</div>
  </header>
);
type ModalProps = {
  open: boolean;
  onClose: (open: boolean) => void;
  title: ReactNode;
  description?: string;
  children?: ReactNode;
  id: string;
};
export const Modal = ({ open, onClose, title, description, children, id }: ModalProps) => (
  <Dialog open={open} onOpenChange={onClose}>
    <DialogContent data-testid={id} className="atlas-modal">
      <DialogTitle data-testid={`${id}-title`}>{title}</DialogTitle>
      <DialogDescription data-testid={`${id}-description`} className="sr-only">
        {description || 'Atlas NetCare · Campus Network Portal'}
      </DialogDescription>
      {children}
    </DialogContent>
  </Dialog>
);
export const Field = ({ label, id, children }: { label: ReactNode; id: string; children?: ReactNode }) => (
  <label className="field" htmlFor={id}>
    <span data-testid={`${id}-label`}>{label}</span>
    {children}
  </label>
);
export const Select = ({ id, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { id: string }) => (
  <div className="select-wrap">
    <select id={id} data-testid={id} {...props}>
      {children}
    </select>
    <ChevronDown size={14} />
  </div>
);
export const Empty = ({ text = 'No records found.', id = 'empty-state' }: { text?: ReactNode; id?: string }) => (
  <div className="empty" data-testid={id}>
    <Inbox size={27} />
    <span>{text}</span>
  </div>
);
export const ErrorBox = ({ error, retry }: { error?: string; retry?: () => void }) =>
  error ? (
    <div className="error-box" data-testid="error-message" role="alert">
      <AlertCircle size={17} />
      <span>{error}</span>
      {retry && (
        <Button id="retry-load" onClick={retry}>
          Retry Connection
        </Button>
      )}
    </div>
  ) : null;
export const Loading = () => (
  <div className="loading" data-testid="loading-state">
    <LoaderCircle className="spin" size={23} /> Loading operational data…
  </div>
);
/** Fetch `path` from the API when it changes. `data` is null until the first response arrives. */
export function useData<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true);
  const load = async () => {
    setBusy(true);
    try {
      setData((await api.get<T>(path)).data);
      setError('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    setData(null);
    load();
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, busy, load };
}
export const SectionHead = ({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) => (
  <div className="section-head">
    <div>
      <h2 data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}>{title}</h2>
      {sub && <p>{sub}</p>}
    </div>
    {children}
  </div>
);
