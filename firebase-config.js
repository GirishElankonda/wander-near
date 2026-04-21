// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase config from environment (injected at build via config.generated.js)
// Run: npm run build:config (reads .env and generates config.generated.js)
const firebaseConfig = (typeof window !== 'undefined' && window.__APP_CONFIG__ && window.__APP_CONFIG__.firebase)
  ? window.__APP_CONFIG__.firebase
  : (function () {
      console.warn('WanderNear: No __APP_CONFIG__.firebase. Copy .env.example to .env, fill in Firebase keys, then run: npm run build:config');
      return {
        apiKey: '',
        authDomain: '',
        projectId: '',
        storageBucket: '',
        messagingSenderId: '',
        appId: '',
        measurementId: ''
      };
    })();

if (!firebaseConfig.apiKey) {
  console.error('WanderNear: Firebase apiKey is missing. Set VITE_FIREBASE_* in .env and run npm run build:config.');
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, googleProvider };
