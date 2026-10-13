import { routeFromNotificationData } from '../deepLink';

describe('routeFromNotificationData (push deep links)', () => {
  it.each([
    [{ ticketId: 'tkt_rs' }, '/tickets/tkt_rs'],
    [{ url: 'opsdesk://tickets/tkt_42' }, '/tickets/tkt_42'],
    [{ url: 'https://opsdesk.example.com/tickets/tkt_42' }, '/tickets/tkt_42'],
    [{ url: '/tickets/abc-1/' }, '/tickets/abc-1'],
  ])('%p -> %s', (data, route) => {
    expect(routeFromNotificationData(data)).toBe(route);
  });

  it.each([
    [null],
    ['tkt_rs'],
    [{}],
    [{ ticketId: '../settings' }],
    [{ ticketId: 42 }],
    [{ url: 'https://evil.example.com/redirect?to=/tickets/x' }],
    [{ url: 'opsdesk://settings' }],
  ])('ignores %p', (data) => {
    expect(routeFromNotificationData(data)).toBeNull();
  });
});
