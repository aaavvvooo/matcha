import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import AgeRange from './AgeRange';
import FameRange from './FameRange';
import DistanceRadar from './DistanceRadar';
import SortPicker from './SortPicker';

// Each control holds strings; '' means "no limit" and filters nothing on the server.
let latest;
function Range({ as: Control, initial = { min: '', max: '' } }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return <Control min={value.min} max={value.max} onChange={setValue} />;
}
function Distance({ initial = '' }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return <DistanceRadar value={value} onChange={setValue} />;
}
const slide = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });

describe('AgeRange', () => {
  test('says any age until limited, then shows the range', () => {
    render(<Range as={AgeRange} />);
    expect(screen.getByText('Any age')).toBeInTheDocument();

    slide('Min age', 25);
    slide('Max age', 40);

    expect(latest).toEqual({ min: '25', max: '40' });
    expect(screen.getByText('25 to 40')).toBeInTheDocument();
  });

  test('the ends of the scale mean no limit', () => {
    render(<Range as={AgeRange} initial={{ min: '25', max: '40' }} />);

    slide('Min age', 18);
    slide('Max age', 80);

    expect(latest).toEqual({ min: '', max: '' });
  });

  test('the handles cannot cross', () => {
    render(<Range as={AgeRange} initial={{ min: '25', max: '40' }} />);

    slide('Min age', 60);
    expect(latest).toEqual({ min: '40', max: '40' });
    slide('Max age', 20);
    expect(latest).toEqual({ min: '40', max: '40' });
  });

  test('a decade sets the range, and a second tap clears it', () => {
    render(<Range as={AgeRange} />);
    const thirties = screen.getByRole('button', { name: '30s' });

    fireEvent.click(thirties);
    expect(latest).toEqual({ min: '30', max: '39' });
    expect(thirties).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(thirties);
    expect(latest).toEqual({ min: '', max: '' });
  });

  test('the last decade has no upper limit', () => {
    render(<Range as={AgeRange} />);
    fireEvent.click(screen.getByRole('button', { name: '60+' }));
    expect(latest).toEqual({ min: '60', max: '' });
    expect(screen.getByText('60 and over')).toBeInTheDocument();
  });
});

describe('FameRange', () => {
  test('names the range by its levels', () => {
    render(<Range as={FameRange} />);
    expect(screen.getByText('Any fame')).toBeInTheDocument();

    slide('Min fame', 40);

    expect(latest).toEqual({ min: '40', max: '' });
    expect(screen.getByText('Known to Legend')).toBeInTheDocument();
  });

  test('a cup picks its level, and a second tap clears it', () => {
    render(<Range as={FameRange} />);
    const rising = screen.getByRole('button', { name: 'Rising, fame 20 to 40' });

    fireEvent.click(rising);
    expect(latest).toEqual({ min: '20', max: '40' });
    expect(screen.getByText('Rising')).toBeInTheDocument();

    fireEvent.click(rising);
    expect(latest).toEqual({ min: '', max: '' });
  });

  test('the first and last cups leave their outer end open', () => {
    render(<Range as={FameRange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Hidden gem, fame 0 to 20' }));
    expect(latest).toEqual({ min: '', max: '20' });
    fireEvent.click(screen.getByRole('button', { name: 'Legend, fame 80 to 100' }));
    expect(latest).toEqual({ min: '80', max: '' });
  });
});

describe('DistanceRadar', () => {
  test('moves through kilometre steps and tells screen readers the distance', () => {
    render(<Distance />);
    const slider = screen.getByLabelText('Within km');
    expect(slider).toHaveAttribute('aria-valuetext', 'Anywhere');

    slide('Within km', 2);

    expect(latest).toBe('5');
    expect(slider).toHaveAttribute('aria-valuetext', 'Within 5 km');
  });

  test('the far end means anywhere', () => {
    render(<Distance initial="25" />);
    slide('Within km', screen.getByLabelText('Within km').max);
    expect(latest).toBe('');
  });

  test('a distance between two steps shows the nearest step that still includes it', () => {
    render(<Distance initial="30" />);
    expect(screen.getByLabelText('Within km')).toHaveAttribute('aria-valuetext', 'Within 50 km');
  });
});

describe('SortPicker', () => {
  test('offers every sort under its full name and marks and spells out the current one', () => {
    render(<SortPicker value="tags" onChange={() => {}} />);

    expect(screen.getAllByRole('button').map(b => b.getAttribute('aria-label')))
      .toEqual(['best match', 'distance', 'age', 'fame', 'common tags']);
    expect(screen.getByRole('button', { name: 'common tags' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Common tags')).toBeInTheDocument();
  });

  test('reports the chosen sort', () => {
    const onChange = jest.fn();
    render(<SortPicker value="score" onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'distance' }));

    expect(onChange).toHaveBeenCalledWith('distance');
  });
});
