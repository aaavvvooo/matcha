import { act, fireEvent, render, screen } from '@testing-library/react';
import ProfileViewPage from './ProfileViewPage';
import { blockUser, getUser } from '../../api/usersApi';

let mockId = '1';
jest.mock('react-router-dom', () => ({
  useParams: () => ({ id: mockId }), useNavigate: () => jest.fn(),
}), { virtual: true });
jest.mock('../../api/usersApi', () => ({
  getUser: jest.fn(), likeUser: jest.fn(), unlikeUser: jest.fn(), blockUser: jest.fn(), unblockUser: jest.fn(), reportUser: jest.fn(),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 99 } }) }));

const person = (id, name) => ({ user_id: id, first_name: name, last_name: '', username: name, tags: [], photos: [] });
const failure = status => Object.assign(new Error('failed'), status ? { response: { status } } : {});
const deferred = () => { const d = {}; d.promise = new Promise((resolve, reject) => Object.assign(d, { resolve, reject })); return d; };

beforeEach(() => {
  mockId = '1';
  getUser.mockReset();
  blockUser.mockReset();
  global.IntersectionObserver = class { observe() {} disconnect() {} };
});

test('a failed load says so and can be retried', async () => {
  getUser.mockRejectedValueOnce(failure()).mockResolvedValueOnce(person(1, 'Ann'));
  render(<ProfileViewPage />);

  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

  expect(await screen.findByText('Ann')).toBeInTheDocument();
});

test('a hidden or missing profile is still "not available", not an error', async () => {
  getUser.mockRejectedValue(failure(404));
  render(<ProfileViewPage />);

  expect(await screen.findByText("This profile isn't available")).toBeInTheDocument();
});

test('never shows one person while acting on another', async () => {
  getUser.mockResolvedValueOnce(person(1, 'Ann')).mockRejectedValueOnce(failure(500));
  const { rerender } = render(<ProfileViewPage />);
  await screen.findByText('Ann');

  mockId = '2';
  rerender(<ProfileViewPage />);

  expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  expect(screen.queryByText('Ann')).toBeNull();
});

test('a slow answer for the previous profile is ignored', async () => {
  const slow = deferred();
  getUser.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(person(2, 'Bob'));
  const { rerender } = render(<ProfileViewPage />);
  mockId = '2';
  rerender(<ProfileViewPage />);
  await screen.findByText('Bob');

  await act(async () => slow.resolve(person(1, 'Ann')));

  expect(screen.getByText('Bob')).toBeInTheDocument();
  expect(screen.queryByText('Ann')).toBeNull();
});

test('a failed block tells the user and logs nothing to the console', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  getUser.mockResolvedValue(person(1, 'Ann'));
  blockUser.mockRejectedValue(failure(500));
  render(<ProfileViewPage />);
  await screen.findByText('Ann');

  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Block' }));
  const confirm = screen.getAllByRole('button', { name: 'Block' }).pop();
  await act(async () => { fireEvent.click(confirm); });

  expect(screen.getByText('Could not block this user')).toBeInTheDocument();
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
