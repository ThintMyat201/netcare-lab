import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, ShieldCheck, Network, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../context';
import { Logo, Button, Field, ErrorBox } from '../components/shared';
import { api, errorText } from '../lib/api';

const DEMO_ACCOUNTS = [
  {
    id: 'owner',
    label: 'Administrator',
    email: 'owner@apu.edu.my',
    password: 'OwnerSecure2026!',
    icon: ShieldCheck,
  },
  {
    id: 'engineer',
    label: 'Engineer',
    email: 'engineer@apu.edu.my',
    password: 'AtlasDemo2026',
    icon: Network,
  },
  {
    id: 'assistant',
    label: 'Assistant',
    email: 'assistant@apu.edu.my',
    password: 'AtlasDemo2026',
    icon: ClipboardCheck,
  },
] as const;

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recover, setRecover] = useState(false);
  const [notice, setNotice] = useState('');

  if (user) return <Navigate to="/" replace />;

  const fillDemoCredentials = (demoEmail: string, demoPassword: string) => {
    setRecover(false);
    setEmail(demoEmail);
    setPassword(demoPassword);
    setError('');
    setNotice('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (recover) {
        setNotice((await api.post('/auth/forgot-password', { email })).data.message);
      } else {
        await login({ email, password });
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="login-photo" />

      <main className="relative z-10 w-full max-w-[380px]">
        <div className="login-form bg-slate-900/90 border border-slate-800/90 backdrop-blur-md rounded-2xl p-7 shadow-2xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <Logo />
            <h1 className="mt-4 text-lg font-semibold text-slate-100">{recover ? 'Reset password' : 'Sign in'}</h1>
          </div>

          <form onSubmit={submit} className="mt-0 flex flex-col gap-4">
            <Field label="Email" id="login-email">
              <input
                id="login-email"
                name="email"
                data-testid="login-email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@apu.edu.my"
              />
            </Field>

            {!recover && (
              <div className="field">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="current-password"
                    data-testid="login-password-label"
                    className="text-[11px] font-semibold text-[#9ba8bc]"
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    data-testid="toggle-recovery"
                    className="text-[11px] font-semibold text-blue-400 hover:text-blue-300 transition-colors"
                    onClick={() => {
                      setRecover(true);
                      setNotice('');
                      setError('');
                    }}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <input
                    id="current-password"
                    name="password"
                    data-testid="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}

            <ErrorBox error={error} />

            {notice && (
              <div className="notice" data-testid="recovery-notice">
                {notice}
              </div>
            )}

            <Button id="login-submit" variant="primary" disabled={busy} type="submit" className="w-full mt-1">
              {busy ? 'Signing in…' : recover ? 'Send reset link' : 'Sign in'}
              <ArrowRight size={15} />
            </Button>
          </form>

          {!recover ? (
            <div>
              <div className="demo-divider">QUICK DEMO ACCESS</div>
              <div className="demo-roles" role="group" aria-label="Quick Demo Access">
                {DEMO_ACCOUNTS.map(({ id, label, email: demoEmail, password: demoPassword, icon: Icon }) => {
                  const selected = email.toLowerCase() === demoEmail;
                  return (
                    <button
                      key={id}
                      type="button"
                      data-testid={`demo-${id}`}
                      onClick={() => fillDemoCredentials(demoEmail, demoPassword)}
                      className={selected ? '!border-blue-500/70 !bg-blue-500/15 !text-white shadow-sm' : undefined}
                    >
                      <Icon size={16} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <button
              type="button"
              data-testid="toggle-recovery"
              className="text-button mt-4 mx-auto"
              onClick={() => {
                setRecover(false);
                setNotice('');
                setError('');
              }}
            >
              ← Back to sign in
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
