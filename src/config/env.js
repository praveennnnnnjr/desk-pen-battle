// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAjtyKRfxFzMgWvXCrKREHX7YbaANncxXM",
  authDomain: "desk-battle.firebaseapp.com",
  projectId: "desk-battle",
  storageBucket: "desk-battle.firebasestorage.app",
  messagingSenderId: "435045832087",
  appId: "1:435045832087:web:8d00981549c5281f4ca0d2",
  measurementId: "G-TSVJ8KZZ33"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);