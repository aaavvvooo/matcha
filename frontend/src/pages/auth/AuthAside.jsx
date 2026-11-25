import MatchaCup from '../../components/ui/MatchaCup';

/** Desktop only: the brand half of the sign-in and registration pages. */
function AuthAside() {
  return (
    <aside className="auth-shell-aside desktop-only">
      <MatchaCup size={150} mood="happy" animate={true}/>
      <p className="auth-shell-claim">Find people worth your <span>time.</span></p>
      <p className="auth-shell-lead">Matched on distance, shared interests and real compatibility. Chat opens when you both like each other.</p>
    </aside>
  );
}

export default AuthAside;
