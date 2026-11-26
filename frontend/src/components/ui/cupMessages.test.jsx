import { fireEvent, render, screen } from '@testing-library/react';
import CupLoading from './CupLoading';
import CupMessage from './CupMessage';
import LoadError from './LoadError';

const mood = container => container.querySelector('svg').getAttribute('data-mood');

test('an empty state shows its mood, title and text', () => {
  const { container } = render(<CupMessage mood="shy" title="No conversations yet">Like someone first</CupMessage>);
  expect(mood(container)).toBe('shy');
  expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  expect(screen.getByText('Like someone first')).toBeInTheDocument();
});

test('a load error is sad, announced and can be retried', () => {
  const onRetry = jest.fn();
  const { container } = render(<LoadError onRetry={onRetry}>Couldn't load this.</LoadError>);
  expect(mood(container)).toBe('sad');
  expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load this.");
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('loading says what it is doing', () => {
  render(<CupLoading>Finding people nearby…</CupLoading>);
  expect(screen.getByRole('status')).toHaveTextContent('Finding people nearby…');
});
