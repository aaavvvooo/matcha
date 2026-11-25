import { fireEvent, render, screen } from '@testing-library/react';
import FormInput from './FormInput';
import PasswordInput from './PasswordInput';

const noop = () => {};

describe('PasswordInput', () => {
  test('hides the password until the eye is clicked, and hides it again on a second click', () => {
    render(<PasswordInput aria-label="Password" value="s3cret" onChange={noop} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(input).toHaveAttribute('type', 'password');
  });

  test('does not submit the surrounding form when the eye is clicked', () => {
    const onSubmit = jest.fn(e => e.preventDefault());
    render(<form onSubmit={onSubmit}><PasswordInput value="s3cret" onChange={noop} /></form>);

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('keeps the revealed password away from spellcheckers', () => {
    render(<PasswordInput aria-label="Password" value="s3cret" onChange={noop} />);

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(screen.getByLabelText('Password')).toHaveAttribute('spellcheck', 'false');
  });
});

describe('FormInput', () => {
  test('gives password fields the eye and keeps the label and error tied to the input', () => {
    render(<FormInput label="Password" type="password" value="x" onChange={noop} error="Too short" />);
    const input = screen.getByLabelText('Password');

    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));

    expect(input).toHaveAttribute('type', 'text');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(input.getAttribute('aria-describedby'))).toHaveTextContent('Too short');
  });

  test('toggles each password field on its own', () => {
    render(<>
      <FormInput label="First" type="password" value="a" onChange={noop} />
      <FormInput label="Second" type="password" value="b" onChange={noop} />
    </>);

    fireEvent.click(screen.getAllByRole('button', { name: 'Show password' })[0]);

    expect(screen.getByLabelText('First')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Second')).toHaveAttribute('type', 'password');
  });

  test('shows no eye on other fields', () => {
    render(<FormInput label="Email" type="email" value="" onChange={noop} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
