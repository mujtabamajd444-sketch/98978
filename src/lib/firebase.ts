import { getApp, getApps, initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Firebase Web configuration identifies the project; it is safe to ship in a web app.
// Firestore security rules, not this configuration, protect the data.
const firebaseConfig = {
  apiKey: 'AIzaSyAE1ykLUyEuNK6m-hpHh1aszIo0BrtQ2mw',
  authDomain: 'gggg111-c6858.firebaseapp.com',
  projectId: 'gggg111-c6858',
  storageBucket: 'gggg111-c6858.firebasestorage.app',
  messagingSenderId: '942739055973',
  appId: '1:942739055973:web:71f7682a5899617e7eed8c',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
