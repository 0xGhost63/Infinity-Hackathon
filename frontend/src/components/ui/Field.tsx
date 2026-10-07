import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { CircleAlert } from 'lucide-react';
import { cx } from '@/lib/cx';

interface FieldProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, error, hint, optional = false, className, children }: FieldProps) {
  return (
    <div className={cx('field', className)}>
      <label className="field__label" htmlFor={id}>
        <span>{label}</span>
        {optional && <span className="field__optional">Optional</span>}
      </label>
      {children}
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          <CircleAlert aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Returns the id that Field renders for the error or hint, for aria-describedby. */
export function describedBy(id: string, error?: string | null, hint?: ReactNode): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface InvalidProp {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & InvalidProp>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} className={cx('control', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & InvalidProp>(function Select(
  { className, invalid, ...rest },
  ref,
) {
  return <select ref={ref} className={cx('control', 'control--select', className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp>(
  function Textarea({ className, invalid, ...rest }, ref) {
    return <textarea ref={ref} className={cx('control', 'control--textarea', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);
