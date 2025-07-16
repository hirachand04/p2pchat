// Import required Firebase SDKs (modular style)
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

// Your Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyAcwMiHYLyvTwBFKEvisT2Ei64LXbJ4650",
    authDomain: "p2pchat-df24c.firebaseapp.com",
    databaseURL: "https://p2pchat-df24c-default-rtdb.firebaseio.com",
    projectId: "p2pchat-df24c",
    storageBucket: "p2pchat-df24c.appspot.com",
    messagingSenderId: "377406310647",
    appId: "1:377406310647:web:18fbf912b487cbf7912bf2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Export the database reference
export { database };