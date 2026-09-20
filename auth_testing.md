# Atlas custom authentication verification
- Use external REACT_APP_BACKEND_URL for all API calls. Cookies are httpOnly, Secure, SameSite=None; include Origin on browser mutations.
- POST /api/auth/login sets access_token (15 min) and refresh_token (7 days). GET /api/auth/me must return the same active user. POST /api/auth/logout revokes the server session; replay fails.
- POST /api/auth/refresh renews access only for an active user and valid persisted session.
- Passwords are bcrypt hashes; users.email is unique. Login counters are persistent and expire after 15 minutes; the 11th attempt in a bucket returns 429.
- There is no public registration. POST /api/users requires administrator permission. Owner email comes from ADMIN_EMAIL.
- Demo login is gated by DEMO_MODE and uses a separate database suffix. Recovery is explicitly SIMULATED and never sends email or changes a password. Admin password resets revoke sessions.
- Denial matrix: anonymous protected read 401, assistant user administration/simulation/ticket resolution 403, another assistant's shift acknowledgement/checklist/ticket detail 404, deactivated user's existing token 401.
- Check unique indexes for assets.tag, tickets.active_key (partial), checklists.created_by+request_id, reminders.shift_id, telemetry.asset_id+timestamp. TTL indexes exist for session/reset-token/login-attempt expiry.