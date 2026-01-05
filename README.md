# P2P Chat

End-to-end encrypted, ephemeral chat platform with no login required.

---

## Features

### Security
- End-to-end encryption using AES-256-GCM
- Zero knowledge - server only relays encrypted data
- Ephemeral design - no data storage

### Chat
- One-on-one and group chat (up to 64 users)
- 8-character session codes
- Real-time messaging via WebSockets
- Typing indicators
- Auto-generated nicknames

### Admin Controls
- Kick and ban users
- IP-based ban system
- Unban users
- Transfer admin privileges

### UI
- Responsive design
- Dark/Light mode
- Sound notifications
- Export chat

---

## Tech Stack

**Frontend:** React 18, Vite, TailwindCSS, Framer Motion, Zustand, Socket.io Client

**Backend:** Node.js, Express, Socket.io, Web Crypto API

---

## Project Structure

```
p2pchat/
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── services/
│   │   ├── store/
│   │   └── App.jsx
│   └── package.json
├── server/
│   ├── src/
│   │   ├── index.js
│   │   ├── sessionManager.js
│   │   └── socketHandlers.js
│   └── package.json
└── package.json
```

---

## Security

Messages are encrypted in the browser before transmission. The server only sees encrypted ciphertext, session codes, and socket connections. It never sees plain text, encryption keys, or user identities.

---

## License

MIT

---

Hirachand Barik - 2026
