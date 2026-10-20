import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Network, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../context';
import { Logo, Button, Field, ErrorBox } from '../components/shared';
import { api, errorText } from '../lib/api';

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recover, setRecover] = useState(false);
  const [notice, setNotice] = useState('');

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: any) => {
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
    <div className="login-page">
      <div className="login-photo" />
      <div className="login-top">
        <Logo />
      </div>
      <main className="login-main">
        <span className="eyebrow">CAMPUS NETWORK OPERATIONS</span>
        <h1>
          Every connection.<br />Under your care.
        </h1>
        <div className="login-form">
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
                placeholder="name@campus.edu.ph"
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

          <div className="demo-divider">
            <span>OR QUICK ACCESS BY ROLE</span>
          </div>

          <div className="demo-roles">
            {[
              ['admin', 'Administrator', ShieldCheck],
              ['engineer', 'Network Engineer', Network],
              ['assistant', 'IT Assistant', ClipboardCheck]
            ].map(([role, label, Icon]: any) => (
              <button disabled={busy} key={role} data-testid={`demo-login-${role}`} onClick={() => demo(role)}>
                <Icon size={20} />
                <span>{label}</span>
                <ArrowRight size={13} />
              </button>
            ))}
          </div>

          <p className="login-foot">Campus IT Network Operations & Lab Management Portal.</p>
        </div>
      </main>

      <div className="login-bottom">
        ATLAS NETCARE <span>Campus Network Operations · Asia/Kuala Lumpur (MYT)</span>
      </div>
    </div>
  );
}