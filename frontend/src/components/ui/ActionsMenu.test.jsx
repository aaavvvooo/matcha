import { fireEvent, render, screen } from '@testing-library/react';
import ActionsMenu from './ActionsMenu';

const Icon = () => null;
const action = (label, extra = {}) => ({ label, icon: Icon, onSelect: jest.fn(), ...extra });
const renderMenu = actions => {
  render(<ActionsMenu label="More actions" icon={Icon} actions={actions} />);
  return screen.getByRole('button', { name: 'More actions' });
};

test('opens from its button; choosing an action runs it and closes the menu', () => {
  const block = action('Block');
  const more = renderMenu([action('Report'), block]);
  expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();

  fireEvent.click(more);
  fireEvent.click(screen.getByRole('button', { name: 'Block' }));

  expect(block.onSelect).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Block' })).toBeNull();
});

test('Escape and a tap elsewhere close it without running anything', () => {
  const report = action('Report');
  const more = renderMenu([report]);

  fireEvent.click(more);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(more).toHaveFocus();

  fireEvent.click(more);
  fireEvent.pointerDown(document.body);
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(report.onSelect).not.toHaveBeenCalled();
});

test('a disabled action cannot be chosen', () => {
  const call = action('Audio call', { disabled: true });
  fireEvent.click(renderMenu([call]));

  fireEvent.click(screen.getByRole('button', { name: 'Audio call' }));

  expect(call.onSelect).not.toHaveBeenCalled();
});
