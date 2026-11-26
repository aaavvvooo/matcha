import MatchaCup from './MatchaCup';
import './cupMessages.css';

/** The mascot with something to say: an empty page, an error, good news. */
function CupMessage({ mood, size = 72, title, children, role }) {
  return (
    <div className="cup-message" role={role}>
      <MatchaCup size={size} mood={mood} animate={true}/>
      {title && <div className="cup-message-title">{title}</div>}
      {children && <div className="cup-message-text">{children}</div>}
    </div>
  );
}

export default CupMessage;
