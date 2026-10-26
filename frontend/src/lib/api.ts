import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ApiErrorBody } from './types';

export type { User } from './types';

export const api = axios.create({
  baseURL: `${process.env.REACT_APP_BACKEND_URL}/api`,
  withCredentials: true,
  timeout: 12000,
  headers: { 'X-Atlas-Request': '1' },
});
let refresh: Promise<AxiosResponse> | null = null;
api.interceptors.response.use(
  r => r,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    if (error.response?.status === 401 && !config?._retry && !config?.url?.startsWith('/auth/')) {
      config._retry = true;
      try {
        refresh = refresh || api.post('/auth/refresh');
        await refresh;
        refresh = null;
        return api(config);
      } catch {
        refresh = null;
        window.dispatchEvent(new Event('session-expired'));
      }
    }
    return Promise.reject(error);
  },
);

/** The HTTP status of a failed request, or undefined when the server never answered. */
export const errorStatus = (e: unknown): number | undefined => (axios.isAxiosError(e) ? e.response?.status : undefined);

export function errorText(e: unknown): string {
  const d = axios.isAxiosError<ApiErrorBody>(e) ? e.response?.data?.detail : undefined;
  return typeof d === 'string'
    ? d
    : Array.isArray(d)
      ? d.map(x => x.msg).join('. ')
      : 'The server is unavailable. Your unsent work is still here. Please try again.';
}
export const CAMPUS_TIMEZONE = 'Asia/Kuala_Lumpur';
export const normalizeTimestamp = (value: string) =>
  /Z|[+-]\d{2}:?\d{2}$/.test(value.trim()) ? value.trim() : `${value.trim()}Z`;
export const time = (value?: string, full = false, withSeconds = false) =>
  value
    ? new Intl.DateTimeFormat('en-MY', {
        timeZone: CAMPUS_TIMEZONE,
        ...(full ? { month: 'short', day: 'numeric' } : {}),
        hour: '2-digit',
        minute: '2-digit',
        ...(withSeconds ? { second: '2-digit' } : {}),
        hour12: false,
      }).format(new Date(normalizeTimestamp(value)))
    : '—';
export const roleLabel = (r: string) =>
  ({ admin: 'Administrator', engineer: 'Network Engineer', assistant: 'IT Assistant' })[r] || r;
