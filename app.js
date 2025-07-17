import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

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
const auth = getAuth(app);

// Anonymous sign-in
signInAnonymously(auth)
    .then(() => {
        console.log("Signed in anonymously");
    })
    .catch((error) => {
        console.error("Firebase auth error:", error);
    });

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// Global variables
let currentRoom = null;
let currentUser = null;
let encryptionEnabled = false;
let encryptionKey = null;
let userCount = 0;
let messageListeners = [];

// DOM elements
const welcomeScreen = document.getElementById('welcome-screen');
const chatScreen = document.getElementById('chat-screen');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const roomInputSection = document.getElementById('room-input-section');
const roomCodeInput = document.getElementById('room-code-input');
const enterRoomBtn = document.getElementById('enter-room-btn');
const encryptionSection = document.getElementById('encryption-section');
const enableEncryptionCheckbox = document.getElementById('enable-encryption');
const encryptionKeyInput = document.getElementById('encryption-key');
const currentRoomCode = document.getElementById('current-room-code');
const userCountElement = document.getElementById('user-count');
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// Utility functions
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Encryption functions using Web Crypto API
async function generateEncryptionKey(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return await crypto.subtle.importKey(
        'raw',
        hash, { name: 'AES-GCM' },
        false, ['encrypt', 'decrypt']
    );
}

async function encryptMessage(message, key) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv },
        key,
        data
    );

    const encryptedArray = new Uint8Array(encrypted);
    const result = new Uint8Array(iv.length + encryptedArray.length);
    result.set(iv);
    result.set(encryptedArray, iv.length);

    return btoa(String.fromCharCode(...result));
}

async function decryptMessage(encryptedMessage, key) {
    try {
        const data = new Uint8Array(atob(encryptedMessage).split('').map(c => c.charCodeAt(0)));
        const iv = data.slice(0, 12);
        const encrypted = data.slice(12);

        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );

        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    } catch (error) {
        console.error('Decryption failed:', error);
        return '[Encrypted message - unable to decrypt]';
    }
}

// Firebase authentication
async function signInAnonymously() {
    try {
        const result = await auth.signInAnonymously();
        currentUser = {
            id: generateUserId(),
            firebaseUid: result.user.uid
        };
        return currentUser;
    } catch (error) {
        console.error('Authentication failed:', error);
        throw error;
    }
}

// Room management
async function createRoom() {
    const roomCode = generateRoomCode();
    const roomRef = database.ref(`rooms/${roomCode}`);

    // Check if room already exists
    const snapshot = await roomRef.once('value');
    if (snapshot.exists()) {
        return createRoom(); // Generate new code if exists
    }

    // Create room
    await roomRef.set({
        created: firebase.database.ServerValue.TIMESTAMP,
        users: {},
        messages: {},
        maxUsers: 64
    });

    return roomCode;
}

async function joinRoom(roomCode) {
    const roomRef = database.ref(`rooms/${roomCode}`);
    const snapshot = await roomRef.once('value');

    if (!snapshot.exists()) {
        throw new Error('Room not found');
    }

    const roomData = snapshot.val();
    const userCount = roomData.users ? Object.keys(roomData.users).length : 0;

    if (userCount >= 64) {
        throw new Error('Room is full (64 users maximum)');
    }

    // Add user to room
    await roomRef.child(`users/${currentUser.id}`).set({
        joined: firebase.database.ServerValue.TIMESTAMP,
        active: true
    });

    currentRoom = roomCode;
    return roomCode;
}

async function leaveRoom() {
    if (!currentRoom || !currentUser) return;

    const roomRef = database.ref(`rooms/${currentRoom}`);

    // Remove user from room
    await roomRef.child(`users/${currentUser.id}`).remove();

    // Send leave message
    await sendSystemMessage(`User left the chat`);

    // Clean up listeners
    messageListeners.forEach(listener => listener.off());
    messageListeners = [];

    // Check if room is empty and clean up
    const snapshot = await roomRef.child('users').once('value');
    if (!snapshot.exists()) {
        await roomRef.remove(); // Delete empty room
    }

    currentRoom = null;
}

// Message handling
async function sendMessage(text) {
    if (!currentRoom || !currentUser || !text.trim()) return;

    let messageText = text.trim();

    // Encrypt message if encryption is enabled
    if (encryptionEnabled && encryptionKey) {
        messageText = await encryptMessage(messageText, encryptionKey);
    }

    const messageRef = database.ref(`rooms/${currentRoom}/messages`).push();
    await messageRef.set({
        text: messageText,
        sender: currentUser.id,
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        encrypted: encryptionEnabled
    });
}

async function sendSystemMessage(text) {
    if (!currentRoom) return;

    const messageRef = database.ref(`rooms/${currentRoom}/messages`).push();
    await messageRef.set({
        text: text,
        sender: 'system',
        timestamp: firebase.database.ServerValue.TIMESTAMP,
        encrypted: false
    });
}

// UI functions
function showScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    screen.classList.add('active');
}

function addMessageToUI(message, isOwn = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isOwn ? 'own' : ''} ${message.sender === 'system' ? 'system-message' : ''}`;

    if (message.sender === 'system') {
        messageDiv.innerHTML = `<span>${message.text}</span>`;
    } else {
        const senderName = isOwn ? 'You' : `User ${message.sender.slice(-4)}`;
        messageDiv.innerHTML = `
            <div class="message-bubble">
                <div class="message-sender">${senderName}</div>
                <div class="message-text">${message.text}</div>
                <div class="message-time">${formatTime(message.timestamp)}</div>
            </div>
        `;
    }

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function updateUserCount(count) {
    userCount = count;
    userCountElement.textContent = `${count} user${count !== 1 ? 's' : ''} online`;
}

// Event listeners setup
function setupEventListeners() {
    createRoomBtn.addEventListener('click', async() => {
        try {
            await signInAnonymously();
            const roomCode = await createRoom();
            roomCodeInput.value = roomCode;
            roomInputSection.classList.remove('hidden');
            encryptionSection.classList.remove('hidden');
            createRoomBtn.textContent = 'Room Created!';
            createRoomBtn.disabled = true;
            joinRoomBtn.style.display = 'none';
        } catch (error) {
            alert('Failed to create room: ' + error.message);
        }
    });

    joinRoomBtn.addEventListener('click', () => {
        roomInputSection.classList.remove('hidden');
        encryptionSection.classList.remove('hidden');
        createRoomBtn.style.display = 'none';
    });

    enableEncryptionCheckbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            encryptionKeyInput.classList.remove('hidden');
        } else {
            encryptionKeyInput.classList.add('hidden');
            encryptionKeyInput.value = '';
        }
    });

    enterRoomBtn.addEventListener('click', async() => {
        const roomCode = roomCodeInput.value.trim().toUpperCase();
        if (!roomCode) {
            alert('Please enter a room code');
            return;
        }

        try {
            if (!currentUser) {
                await signInAnonymously();
            }

            // Setup encryption if enabled
            if (enableEncryptionCheckbox.checked) {
                encryptionEnabled = true;
                const keyPassword = encryptionKeyInput.value || roomCode;
                encryptionKey = await generateEncryptionKey(keyPassword);
            }

            await joinRoom(roomCode);
            currentRoomCode.textContent = roomCode;

            // Send join message
            await sendSystemMessage('User joined the chat');

            // Setup real-time listeners
            setupRoomListeners();

            showScreen(chatScreen);
        } catch (error) {
            alert('Failed to join room: ' + error.message);
        }
    });

    sendBtn.addEventListener('click', () => {
        const text = messageInput.value;
        if (text.trim()) {
            sendMessage(text);
            messageInput.value = '';
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendBtn.click();
        }
    });

    leaveRoomBtn.addEventListener('click', async() => {
        await leaveRoom();
        showScreen(welcomeScreen);

        // Reset UI
        createRoomBtn.textContent = 'Create Room';
        createRoomBtn.disabled = false;
        createRoomBtn.style.display = 'inline-block';
        joinRoomBtn.style.display = 'inline-block';
        roomInputSection.classList.add('hidden');
        encryptionSection.classList.add('hidden');
        messagesContainer.innerHTML = '';
        roomCodeInput.value = '';
        enableEncryptionCheckbox.checked = false;
        encryptionKeyInput.classList.add('hidden');
        encryptionKeyInput.value = '';
        encryptionEnabled = false;
        encryptionKey = null;
    });
}

// Real-time listeners
function setupRoomListeners() {
    if (!currentRoom) return;

    const roomRef = database.ref(`rooms/${currentRoom}`);

    // Listen for new messages
    const messagesRef = roomRef.child('messages');
    const messageListener = messagesRef.on('child_added', async(snapshot) => {
        const message = snapshot.val();
        if (message) {
            // Decrypt message if encrypted
            if (message.encrypted && encryptionEnabled && encryptionKey) {
                message.text = await decryptMessage(message.text, encryptionKey);
            }

            const isOwn = message.sender === currentUser.id;
            addMessageToUI(message, isOwn);
        }
    });
    messageListeners.push({ ref: messagesRef, listener: messageListener, off: () => messagesRef.off('child_added', messageListener) });

    // Listen for user count changes
    const usersRef = roomRef.child('users');
    const usersListener = usersRef.on('value', (snapshot) => {
        const users = snapshot.val();
        const count = users ? Object.keys(users).length : 0;
        updateUserCount(count);
    });
    messageListeners.push({ ref: usersRef, listener: usersListener, off: () => usersRef.off('value', usersListener) });
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (currentRoom && currentUser) {
        leaveRoom();
    }
});

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
});

// Auto-cleanup empty rooms (runs every 5 minutes)
setInterval(async() => {
    try {
        const roomsRef = database.ref('rooms');
        const snapshot = await roomsRef.once('value');
        const rooms = snapshot.val();

        if (rooms) {
            for (const roomCode in rooms) {
                const room = rooms[roomCode];
                const users = room.users;

                // Delete rooms with no users or older than 24 hours
                const roomAge = Date.now() - (room.created || 0);
                const isEmpty = !users || Object.keys(users).length === 0;
                const isOld = roomAge > 24 * 60 * 60 * 1000; // 24 hours

                if (isEmpty || isOld) {
                    await database.ref(`rooms/${roomCode}`).remove();
                }
            }
        }
    } catch (error) {
        console.error('Cleanup error:', error);
    }
}, 5 * 60 * 1000); // 5 minutes