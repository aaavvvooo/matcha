import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo } from 'react';
import Header from './Header';
import { HeaderProvider, usePageHeader } from '../../context/HeaderContext';

jest.mock('react-router-dom', () => {
  const A = ({ to, className, children, ...props }) => (
    <a href={to} className={typeof className === 'function' ? className({ isActive: false }) : className} {...props}>{children}</a>
  );
  return { Link: A, NavLink: A };
}, { virtual: true });
let mockUser = { id: 1, username: 'ann' };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../context/NotificationContext', () => ({ useNotifications: () => ({ unreadCount: 3 }) }));
jest.mock('../../hooks/useLogout', () => ({ useLogout: () => jest.fn() }));

function Page({ onBack, ...config }) {
  usePageHeader(useMemo(() => ({ ...config, onBack }), [])); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
const renderHeader = page => render(<HeaderProvider><Header inApp />{page}</HeaderProvider>);

beforeEach(() => { mockUser = { id: 1, username: 'ann' }; });

test('actions are settings, notifications, log out, in that order, without messages', () => {
  const { container } = renderHeader();
  const labels = [...container.querySelectorAll('.site-header-actions button, .site-header-actions a')]
    .map(el => el.getAttribute('aria-label'));

  expect(labels).toEqual(['Settings', 'Notifications, 3 unread', 'Log out']);
});

test('signed out, it offers sign in and registration only', () => {
  mockUser = null;
  renderHeader();

  expect(screen.getByText('Sign in')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log out' })).toBeNull();
});

test("shows the page's title and back button, and drops them when the page leaves", () => {
  const onBack = jest.fn();
  const { rerender, container } = renderHeader(<Page title="Blocked users" onBack={onBack} />);

  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('heading', { name: 'Blocked users' })).toBeInTheDocument();
  expect(container.querySelector('.site-header')).toHaveClass('site-header--titled');

  rerender(<HeaderProvider><Header inApp /></HeaderProvider>);
  expect(screen.queryByRole('heading')).toBeNull();
});

test('over a photo it is clear and untitled until it turns solid', () => {
  const { container } = renderHeader(<Page title="Ann, 24" overlay solid={false} onBack={() => {}} />);

  expect(container.querySelector('.site-header')).toHaveClass('site-header--clear');
  expect(container.querySelector('.site-header')).not.toHaveClass('site-header--titled');
});
