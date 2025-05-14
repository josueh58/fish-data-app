import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';

function SignUp({ onSignUp }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState(null);

  const handleSignUp = async (e) => {
    e.preventDefault();
    const auth = getAuth();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName });
      onSignUp();
    } catch (error) {
      setError(error.message);
    }
  };

  return (
    <div className="sign-up">
      <h2>Sign Up</h2>
      <form onSubmit={handleSignUp}>
        <div className="form-group">
          <label>Display Name</label>
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}

export default SignUp; 