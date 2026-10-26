import { FormEvent, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Network, ClipboardCheck, Lock, KeyRound, type LucideIcon } from 'lucide-react';
import { useAuth } from '../context';
import { Logo, Button, Field, ErrorBox } from '../components/shared';
import { api, errorText } from '../lib/api';
import campusBg from '../assets/A-CONNECTED-CAMPUS-2.jpg';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recover, setRecover] = useState(false);
  const [notice, setNotice] = useState('');

  if (user) return <Navigate to="/" replace />;

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

  const demo = async (role: string) => {
    setBusy(true);
    setError('');
    try {
      await login({ role }, true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page relative min-h-screen flex flex-col justify-between overflow-hidden">
      {/* Background Image Layer */}
      <div
        className="login-photo absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${campusBg})` }}
      />
      {/* Rich Dark Gradient Overlay */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/85 via-slate-950/80 to-slate-950/90 backdrop-blur-[2px]" />

      <div className="login-top relative z-10">
        <Logo />
      </div>
      <main className="login-main relative z-10 flex flex-col items-center">
        <span className="eyebrow">CAMPUS NETWORK OPERATIONS</span>
        <h1>
          Every connection.
          <br />
          Under your care.
        </h1>
        <div className="login-form max-w-md w-full bg-slate-900/85 border border-slate-800/80 backdrop-blur-md rounded-2xl p-8 shadow-2xl">
          <div className="mb-4">
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 shadow-sm">
              {recover ? <KeyRound size={20} /> : <Lock size={20} />}
            </span>
          </div>
          <h2>{recover ? 'Account Recovery' : 'Sign In to Atlas NetCare'}</h2>
          <p>
            {recover
              ? 'Enter your campus email to receive recovery instructions.'
              : 'Enter your campus credentials to access the operational portal.'}
          </p>

          <form onSubmit={submit}>
            <Field label="Campus Email Address" id="login-email">
              <input
                id="login-email"
                data-testid="login-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@apu.edu.my"
              />
            </Field>

            {!recover && (
              <Field label="Account Password" id="login-password">
                <input
                  id="login-password"
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Enter your account password"
                />
              </Field>
            )}

            <ErrorBox error={error} />

            {notice && (
              <div className="notice" data-testid="recovery-notice">
                {notice}
              </div>
            )}

            <Button id="login-submit" variant="primary" disabled={busy} type="submit">
              {busy ? 'Authenticating…' : recover ? 'Send Recovery Instructions' : 'Sign In'}
              <ArrowRight size={16} />
            </Button>
          </form>

          <button
            data-testid="toggle-recovery"
            className="text-button"
            onClick={() => {
              setRecover(!recover);
              setNotice('');
              setError('');
            }}
          >
            {recover ? '← Return to Sign In' : 'Forgot your password?'}
          </button>

          <div className="demo-divider flex items-center justify-center my-6 gap-3 text-[11px] font-semibold text-slate-400 tracking-wider">
            <span className="h-px bg-slate-700/60 flex-1" />
            <span className="px-1 text-slate-400 uppercase">OR QUICK ACCESS BY ROLE</span>
            <span className="h-px bg-slate-700/60 flex-1" />
          </div>

          <div className="demo-roles grid grid-cols-3 gap-2.5">
            {[
              ['admin', 'Administrator', ShieldCheck],
              ['engineer', 'Network Engineer', Network],
              ['assistant', 'IT Assistant', ClipboardCheck],
            ].map(([role, label, Icon]: [string, string, LucideIcon]) => (
              <button
                type="button"
                disabled={busy}
                key={role}
                data-testid={`demo-login-${role}`}
                onClick={() => demo(role)}
                className="flex flex-col items-center justify-center gap-2 border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800/80 hover:border-blue-500/50 transition-all rounded-lg p-3 text-xs text-slate-200 cursor-pointer disabled:opacity-50"
              >
                <Icon size={18} className="text-blue-400 shrink-0" />
                <span className="font-semibold text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>

      <div className="login-bottom relative z-10">
        ATLAS NETCARE <span>Campus Network Operations · Asia/Kuala Lumpur (MYT)</span>
      </div>
    </div>
  );
}
