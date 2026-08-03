import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guard } from './guard';
import { checkAuth } from './check-auth';
import { isGuardEnabled } from './is-enabled';
import { serverEnv } from '@/shared/config';

vi.mock('./check-auth');
vi.mock('./is-enabled');
vi.mock('@/shared/config', () => ({ serverEnv: { AUTH_LOGIN_URL: '/login' } }));

const mockEnabled = vi.mocked(isGuardEnabled);
const mockCheckAuth = vi.mocked(checkAuth);

beforeEach(() => {
  vi.clearAllMocks();
  serverEnv.AUTH_LOGIN_URL = '/login';
});

describe('guard', () => {
  it('passes through when disabled, without checking auth', () => {
    mockEnabled.mockReturnValue(false);

    expect(guard()).toEqual({ type: 'pass' });
    expect(mockCheckAuth).not.toHaveBeenCalled();
  });

  it('passes through when enabled and authenticated', () => {
    mockEnabled.mockReturnValue(true);
    mockCheckAuth.mockReturnValue({ authenticated: true });

    expect(guard()).toEqual({ type: 'pass' });
  });

  it('redirects to the login URL when enabled and unauthenticated', () => {
    mockEnabled.mockReturnValue(true);
    mockCheckAuth.mockReturnValue({ authenticated: false });

    expect(guard()).toEqual({ type: 'redirect', location: '/login' });
  });

  it('fails open with a warning when enabled, unauthenticated, and no login URL', () => {
    mockEnabled.mockReturnValue(true);
    mockCheckAuth.mockReturnValue({ authenticated: false });
    serverEnv.AUTH_LOGIN_URL = undefined;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(guard()).toEqual({ type: 'pass' });
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });
});
