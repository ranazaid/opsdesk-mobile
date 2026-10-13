import { initMonitoring, isMonitoringEnabled, setMonitoringUser, trackError, trackView, viewName } from '../monitoring';

describe('monitoring wrapper', () => {
  it('stays disabled (and every call is a safe no-op) without Datadog credentials', async () => {
    await expect(initMonitoring()).resolves.toBe(false);
    expect(isMonitoringEnabled()).toBe(false);
    expect(() => {
      trackView('/tickets/tkt_1');
      trackError(new Error('boom'));
      setMonitoringUser(null);
    }).not.toThrow();
  });

  it('groups dynamic ticket routes into one RUM view name', () => {
    expect(viewName('/tickets/tkt_123')).toBe('/tickets/[id]');
    expect(viewName('/tickets/new')).toBe('/tickets/new');
    expect(viewName('/settings')).toBe('/settings');
    expect(viewName('')).toBe('/');
  });
});
