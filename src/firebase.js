import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Your Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDZr6CaMsYEHFefmOw86e3bkhQtFfRfsRo",
  authDomain: "fish-data-app.firebaseapp.com",
  projectId: "fish-data-app",
  storageBucket: "fish-data-app.firebasestorage.app",
  messagingSenderId: "675744968494",
  appId: "1:675744968494:web:4f1ec413c78edc063e94bf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Enable offline persistence for Firestore
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.error('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  } else if (err.code === 'unimplemented') {
    console.error('The current browser does not support persistence.');
  }
});

export { db, auth };