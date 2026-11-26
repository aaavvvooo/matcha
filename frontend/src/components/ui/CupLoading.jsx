import MatchaCup from './MatchaCup';
import './cupMessages.css';

function CupLoading({ mood = 'happy', size = 52, children = 'Loading…' }) {
  return (
    <div className="cup-message" role="status">
      <MatchaCup size={size} mood={mood} animate={true} className="cup-float"/>
      <div className="cup-message-text">{children}</div>
    </div>
  );
}

export default CupLoading;
