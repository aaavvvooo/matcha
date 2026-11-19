import { act, render, waitFor } from '@testing-library/react';
import { ChatProvider, useChat } from './ChatContext';
import { getConversations } from '../api/chatApi';

jest.mock('../api/chatApi', () => ({
  getConversations: jest.fn(),
  getMessages: jest.fn(() => Promise.resolve([])),
  markThreadRead: jest.fn(() => Promise.resolve()),
}));
jest.mock('./AuthContext', () => ({
  useAuth: () => ({ accessToken: 'token', user: { id: 1 } }),
}));

// The socket frames ChatProvider subscribes to, delivered by hand.
let socketListener = null;
jest.mock('./NotificationContext', () => ({
  useNotifications: () => ({
    subscribe: (listener) => {
      socketListener = listener;
      return () => { socketListener = null; };
    },
    send: jest.fn(() => true),
    connected: false,
  }),
}));

const PARTNER = 2;
const partnerRow = { user_id: PARTNER, username: 'bob', unread_count: 0 };

function renderChat() {
  const chat = {};
  function Probe() {
    Object.assign(chat, useChat());
    return null;
  }
  render(<ChatProvider><Probe /></ChatProvider>);
  return chat;
}

test('reconnecting after "not connected" clears the stale error so the thread unlocks', async () => {
  // Arrange: not connected yet, and a send was rejected with not_connected.
  getConversations.mockResolvedValue([]);
  const chat = renderChat();
  await waitFor(() => expect(chat.conversationsState).toBe('ready'));
  act(() => socketListener({ type: 'error', code: 'not_connected', detail: 'x', to: PARTNER }));
  expect(chat.chatError).toMatchObject({ code: 'not_connected', to: PARTNER });

  // Act: they match; the server's notification makes the list reload with the partner in it.
  getConversations.mockResolvedValue([partnerRow]);
  act(() => socketListener({ type: 'notification', event: 'match', from_user: PARTNER }));

  // Assert: connected again, and the error that disabled chat, dates and calls is gone.
  await waitFor(() => expect(chat.conversations).toEqual([partnerRow]));
  expect(chat.chatError).toBeNull();
});

test('a not_connected error for someone still not in the list is kept', async () => {
  getConversations.mockResolvedValue([]);
  const chat = renderChat();
  await waitFor(() => expect(chat.conversationsState).toBe('ready'));
  act(() => socketListener({ type: 'error', code: 'not_connected', detail: 'x', to: PARTNER }));

  getConversations.mockResolvedValue([{ ...partnerRow, user_id: 3 }]);
  act(() => socketListener({ type: 'notification', event: 'match', from_user: 3 }));

  await waitFor(() => expect(chat.conversations[0]?.user_id).toBe(3));
  expect(chat.chatError).toMatchObject({ code: 'not_connected', to: PARTNER });
});
