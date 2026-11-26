import Btn from './Btn';
import CupMessage from './CupMessage';

/** What a page shows in place of content it could not load. */
function LoadError({ children, onRetry }) {
  return (
    <CupMessage mood="sad" role="alert">
      <p>{children}</p>
      <Btn variant="secondary" onClick={onRetry} style={{ marginTop: 16 }}>Try again</Btn>
    </CupMessage>
  );
}

export default LoadError;
