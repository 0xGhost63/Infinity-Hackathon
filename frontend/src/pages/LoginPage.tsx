import { useRef, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { toApiError } from '@/api/errors';
import type { Role, User } from '@/api/types';
import { useAuth } from '@/auth/AuthContext';
import { Brand } from '@/components/layout/Brand';
import { Alert } from '@/components/ui/Alert';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { config } from '@/config';
import { cssVars } from '@/lib/cssVars';
import { cx } from '@/lib/cx';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/demo-accounts';
import type { Accent } from '@/lib/palette';
import { ROLE_GROUP_TITLE } from '@/lib/roles';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

const EXTRACTED: { label: string; accent: Accent; tilt: number }[] = [
  { label: 'Projects', accent: 'yellow', tilt: -2 },
  { label: 'Tasks', accent: 'pink', tilt: 1.5 },
  { label: 'Owners', accent: 'sky', tilt: -1 },
  { label: 'Deadlines', accent: 'green', tilt: 2 },
  { label: 'Estimated hours', accent: 'orange', tilt: -1.5 },
];

const ACCOUNT_GROUPS: Role[] = ['ADMIN', 'MANAGER', 'AGENT'];

export function LoginPage() {
  useDocumentTitle('Sign in');
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      // The public route guard redirects once the session exists.
    } catch (caught) {
      setError(toApiError(caught).message);
      setSubmitting(false);
    }
  }

  function pickAccount(account: User) {
    setEmail(account.email);
    setPassword(DEMO_PASSWORD);
    setError(null);
    submitRef.current?.focus();
  }

  return (
    <div className="login">
      <section className="login__intro">
        <Brand linked={false} />
        <div className="login__pitch">
          <h1 className="login__headline">Turn meetings into assigned work.</h1>
          <p className="login__lede">
            Paste a client meeting transcript. NovaWorks PM drafts the projects, tasks, owners, deadlines, and
            estimated hours, then gives every manager and developer a view of their own work.
          </p>
          <ul className="login__notes" aria-label="What gets extracted from a meeting">
            {EXTRACTED.map((item) => (
              <li key={item.label} className={cx('login__note', `accent-${item.accent}`)} style={cssVars({ '--tilt': `${item.tilt}deg` })}>
                {item.label}
              </li>
            ))}
          </ul>
        </div>
        <p className="login__footnote">{config.companyName}, Lahore. Demo environment with fictional accounts.</p>
      </section>

      <section className="login__aside" aria-labelledby="sign-in-title">
        <div className="login__card">
          <h2 className="login__title" id="sign-in-title">
            Sign in
          </h2>
          <p className="login__subtitle">Use your NovaWorks account.</p>
          <form className="login__form" onSubmit={handleSubmit} noValidate>
            {error && (
              <Alert tone="error" title="Sign in failed">
                {error}
              </Alert>
            )}
            <Field id="email" label="Email">
              <Input
                id="email"
                type="email"
                autoComplete="off"
                placeholder="name@novaworks.example"
                value={email}
                invalid={Boolean(error)}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field id="password" label="Password">
              <div className="control-affix">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="off"
                  value={password}
                  invalid={Boolean(error)}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  className="control-affix__button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((shown) => !shown)}
                >
                  {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
                </button>
              </div>
            </Field>
            <Button ref={submitRef} type="submit" variant="primary" size="lg" block loading={submitting}>
              Sign in
            </Button>
          </form>
        </div>

        {config.showDemoAccounts && (
          <section className="demo" aria-labelledby="demo-title">
            <h2 className="demo__title" id="demo-title">
              Demo accounts
            </h2>
            <p className="demo__hint">
              Choose an account to fill in the form. Every account uses the password <code>{DEMO_PASSWORD}</code>
            </p>
            {ACCOUNT_GROUPS.map((role) => (
              <div className="demo__group" key={role}>
                <h3 className="demo__group-title">{ROLE_GROUP_TITLE[role]}</h3>
                <div className="demo__grid">
                  {DEMO_ACCOUNTS.filter((account) => account.role === role).map((account) => (
                    <button
                      key={account.id}
                      type="button"
                      className="account-option"
                      aria-pressed={email === account.email}
                      onClick={() => pickAccount(account)}
                    >
                      <Avatar name={account.name} id={account.id} size="sm" />
                      <span className="account-option__text">
                        <span className="account-option__name">{account.name}</span>
                        <span className="account-option__meta">{account.specialization}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}
      </section>
    </div>
  );
}
