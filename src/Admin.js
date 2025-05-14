import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { collection, getDocs, setDoc, doc, getDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

function Admin({ user, setUser, role, setRole, setView, setPermissions }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersCollection = collection(db, 'roles');
        const userSnapshot = await getDocs(usersCollection);
        const userList = userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setUsers(userList);
      } catch (err) {
        setError('Failed to fetch users');
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const updateRole = async (userId, newRole) => {
    try {
      await setDoc(doc(db, 'roles', userId), { role: newRole }, { merge: true });
      setUsers(users.map(user => user.id === userId ? { ...user, role: newRole } : user));
    } catch (err) {
      setError('Failed to update role');
    }
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setUser(user);
        let roleDoc;
        try {
          roleDoc = await getDoc(doc(db, 'roles', user.email));
          if (roleDoc.exists() && roleDoc.data().role) {
            setRole(roleDoc.data().role);
            console.log('Role fetched from Firestore:', roleDoc.data().role);
          } else {
            console.log('No role found for user, defaulting to viewer');
            setRole('viewer');
          }
        } catch (error) {
          console.error('Error fetching role:', error);
          setRole('viewer'); // Default role in case of error
        }
        setView('home');
        // Set permissions based on user role
        if (role === 'admin' || role === 'editor') {
          setPermissions({ canEdit: true, canDelete: true });
        } else {
          setPermissions({ canEdit: false, canDelete: false });
        }
      } else {
        setUser(null);
        setRole(null);
        setView('signIn');
      }
    });
    return () => unsubscribe();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>{error}</p>;

  return (
    <div className="admin">
      <h2>Admin Panel</h2>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Role</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>
                <select value={user.role} onChange={(e) => updateRole(user.id, e.target.value)}>
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default Admin; 