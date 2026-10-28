import React, { useState, useEffect } from 'react';
import { Eye, EyeOff, LoaderCircle, AlertCircle, LogOut } from 'lucide-react';
import { Modal } from './shared';
import { useAuth } from '../context';
import { api, errorText } from '../lib/api';
import { toast } from 'sonner';

interface UserProfileModalProps {
  open: boolean;
  onClose: () => void;
}

const roleLabel = (role?: string) => {
  if (role === 'admin') return 'Administrator';
  if (role === 'engineer') return 'Network Engineer';
  if (role === 'assistant') return 'IT Assistant';
  return role || 'Staff';
};

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ open, onClose }) => {
  const { user, setUser, updateUser, logout } = useAuth();

  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  // Reset / populate form when modal opens or user changes
  useEffect(() => {
    if (open && user) {
      setFormName(user.name || '');
      setFormEmail(user.email || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setError('');
    }
  }, [open, user]);

  if (!user) return null;

  // Derive dynamic initials from live typed name
  const initials =
    (formName || user.name || 'User')
      .trim()
      .split(/\s+/)
      .map((s: string) => s[0]?.toUpperCase())
      .filter(Boolean)
      .slice(0, 2)
      .join('') || 'U';

  const handleSignOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      await logout();
      onClose();
    } catch (err) {
      setError(errorText(err) || 'Failed to sign out.');
      setSigningOut(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = formName.trim();
    const trimmedEmail = formEmail.trim();

    // 1. Validation
    if (!trimmedName) {
      setError('Full Name is required.');
      return;
    }

    if (!trimmedEmail) {
      setError('Email Address is required.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    const isChangingPassword = Boolean(newPassword || confirmPassword);
    if (isChangingPassword) {
      if (!currentPassword) {
        setError('Current Password is required to change your password.');
        return;
      }
      if (newPassword.length < 6) {
        setError('New Password must be at least 6 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('New Password and Confirm New Password do not match.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload: { name: string; email: string; current_password?: string; new_password?: string } = {
        name: trimmedName,
        email: trimmedEmail,
      };

      if (isChangingPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      // Call profile patch API
      let updatedUser = { ...user, name: trimmedName, email: trimmedEmail };
      try {
        const res = await api.patch('/auth/profile', payload);
        if (res.data) {
          updatedUser = { ...user, ...res.data };
        }
      } catch (err) {
        // Fallback: If direct /auth/profile is not available in mock/demo, also try /users/{id}
        if (user.role === 'admin' && user.id) {
          try {
            const adminPatch: { name: string; email: string; password?: string } = {
              name: trimmedName,
              email: trimmedEmail,
            };
            if (isChangingPassword) adminPatch.password = newPassword;
            const res = await api.patch(`/users/${user.id}`, adminPatch);
            if (res.data) updatedUser = { ...user, ...res.data };
          } catch {
            throw err;
          }
        } else {
          throw err;
        }
      }

      // 2. Immediately update active user in global state & localStorage
      if (setUser) setUser(updatedUser);
      else if (updateUser) updateUser(updatedUser);
      try {
        localStorage.setItem('atlas_current_user', JSON.stringify(updatedUser));
      } catch {
        // ignore storage quota
      }

      // 3. Broadcast events to sync Team & Access (/users) and Activity Log (/audit)
      window.dispatchEvent(
        new CustomEvent('atlas-user-profile-updated', {
          detail: updatedUser,
        }),
      );
      window.dispatchEvent(new CustomEvent('atlas-workflow-updated'));

      // 4. Show success toast notification
      const successMsg = isChangingPassword
        ? 'Account details and password updated successfully.'
        : 'Profile details updated successfully.';
      toast.success(successMsg);

      // Close modal
      onClose();
    } catch (err) {
      setError(errorText(err) || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="My Profile" id="user-profile-dialog">
      <div className="flex flex-col text-slate-900 dark:text-slate-100">
        {/* Compact Theme-Aware Identity Card */}
        <div className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-sm shadow-sm ring-2 ring-white dark:ring-slate-800 shrink-0"
              data-testid="profile-initials-badge"
            >
              {initials}
            </span>
            <div className="flex flex-col min-w-0">
              <span
                className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate"
                data-testid="profile-display-name"
              >
                {formName || user.name}
              </span>
              <div className="mt-0.5">
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                  {roleLabel(user.role)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end text-right shrink-0">
            <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400">
              {user.scope || 'Main Campus'}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
        </div>

        {/* Error message alert */}
        {error && (
          <div
            className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 text-xs"
            role="alert"
            data-testid="profile-error-alert"
          >
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Editable Profile & Password Form */}
        <form onSubmit={handleSaveProfile} className="flex flex-col" noValidate>
          {/* Section A — Personal Information */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-full-name" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="profile-full-name"
                data-testid="profile-full-name-input"
                type="text"
                required
                value={formName}
                onChange={e => setFormName(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="e.g. Alex Morgan"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="profile-email" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address <span className="text-rose-500">*</span>
              </label>
              <input
                id="profile-email"
                data-testid="profile-email-input"
                type="email"
                required
                value={formEmail}
                onChange={e => setFormEmail(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                placeholder="e.g. alex@apu.edu.my"
              />
            </div>
          </div>

          {/* Section B — Change Password */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Change Password
              </span>
              <span className="text-[11px] text-slate-400">Leave blank to keep current password</span>
            </div>

            {/* Row 1: Current Password */}
            <div className="flex flex-col gap-1.5 mb-3">
              <label
                htmlFor="profile-current-password"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Current Password
              </label>
              <div className="relative">
                <input
                  id="profile-current-password"
                  data-testid="profile-current-password-input"
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="password-eye-btn absolute right-2.5 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                >
                  {showCurrent ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Row 2: New Password & Confirm New Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="profile-new-password"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="profile-new-password"
                    data-testid="profile-new-password-input"
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder="Min 6 characters"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showNew ? 'Hide new password' : 'Show new password'}
                    onClick={() => setShowNew(!showNew)}
                    className="password-eye-btn absolute right-2.5 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                  >
                    {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="profile-confirm-password"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    id="profile-confirm-password"
                    data-testid="profile-confirm-password-input"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 pr-9 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="password-eye-btn absolute right-2.5 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                  >
                    {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Integrated Footer: Left = Sign Out, Right = Cancel & Save Changes */}
          <div className="flex items-center justify-between pt-4 mt-5 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              id="logout-button"
              data-testid="logout-button"
              onClick={handleSignOut}
              disabled={saving || signingOut}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium border border-rose-200 dark:border-transparent bg-rose-100/85 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 shadow-sm dark:shadow-none hover:bg-rose-200/80 dark:hover:bg-rose-500/25 transition-colors disabled:opacity-50"
            >
              {signingOut ? (
                <>
                  <LoaderCircle size={15} className="animate-spin" />
                  <span>Signing out...</span>
                </>
              ) : (
                <>
                  <LogOut size={16} />
                  <span>Sign Out</span>
                </>
              )}
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                data-testid="profile-cancel-button"
                onClick={onClose}
                disabled={saving || signingOut}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-200/85 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300/80 dark:border-transparent shadow-sm dark:shadow-none hover:bg-slate-300/75 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="profile-submit-button"
                disabled={saving || signingOut}
                className="px-4 py-2 text-sm font-semibold rounded-lg border-0 bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <LoaderCircle size={15} className="animate-spin" />
                    <span>Saving Changes...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </Modal>
  );
};
