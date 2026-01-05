# 🌐 Exposing P2P Chat to the Internet with ngrok

This guide helps you test real-time chat between two devices (e.g., your computer and phone).

## Prerequisites

1. Both dev servers must be running:
   - Backend: `http://localhost:3001`
   - Frontend: `http://localhost:5173`

2. ngrok installed and authenticated

---

## Step 1: Install ngrok

### Windows (via winget)
```powershell
winget install ngrok.ngrok
```

### Windows (via Chocolatey)
```powershell
choco install ngrok
```

### Manual Download
1. Go to https://ngrok.com/download
2. Download the Windows ZIP
3. Extract and add to PATH

---

## Step 2: Create ngrok Account & Authenticate

1. Sign up at https://ngrok.com (free tier works fine)
2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Run:
```powershell
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

---

## Step 3: Expose Both Servers

### Option A: Two Separate Terminals (Recommended for Free Tier)

**Terminal 1 - Expose Backend:**
```powershell
ngrok http 3001
```
Copy the `https://xxxx-xx-xx-xx-xx.ngrok-free.app` URL (this is your BACKEND_URL)

**Terminal 2 - Expose Frontend:**
```powershell
ngrok http 5173
```
Copy the `https://yyyy-yy-yy-yy-yy.ngrok-free.app` URL (this is your FRONTEND_URL)

### Option B: Using ngrok Config (Requires Paid Plan)

```powershell
ngrok start --config ngrok.yml --all
```

---

## Step 4: Update Environment Variables

After getting your ngrok URLs, update the config:

### Update Server (.env)
Edit `server/.env`:
```env
PORT=3001
NODE_ENV=development
CLIENT_URL=https://yyyy-yy-yy-yy-yy.ngrok-free.app
```

### Update Client (.env)
Edit `client/.env`:
```env
VITE_SOCKET_URL=https://xxxx-xx-xx-xx-xx.ngrok-free.app
```

---

## Step 5: Restart Both Servers

```powershell
# Kill existing servers (Ctrl+C in their terminals)

# Restart server
cd server
npm run dev

# Restart client (in another terminal)
cd client
npm run dev
```

---

## Step 6: Test on Your Phone

1. Open the **frontend ngrok URL** on your phone's browser
   - Example: `https://yyyy-yy-yy-yy-yy.ngrok-free.app`
   
2. ngrok will show a warning page - click "Visit Site"

3. Create a chat on your computer, copy the code

4. Join with that code on your phone

5. Send messages - they should appear in real-time! 🎉

---

## Troubleshooting

### "WebSocket connection failed"
- Make sure the backend ngrok URL is correctly set in `client/.env`
- Restart the client dev server after changing `.env`
- Check that backend server is still running

### "CORS error"
- Update `server/.env` with the correct frontend ngrok URL
- Restart the server after changing `.env`

### ngrok tunnel expired
- Free tier tunnels expire after 2 hours
- Just restart ngrok and update the URLs in `.env` files

### "Invalid Host header" on frontend
Start Vite with the `--host` flag:
```powershell
cd client
npx vite --host
```

### Connection keeps dropping
- Check your internet connection
- Free ngrok has rate limits - wait a few seconds

### Can't run multiple tunnels
- Free ngrok only allows 1 tunnel at a time
- Either upgrade to paid, or use this workaround:
  1. Build the frontend: `cd client && npm run build`
  2. Serve it from the backend (see "Production Mode" below)

---

## Quick Test Commands (Copy-Paste Ready)

```powershell
# Terminal 1: Start backend
cd d:\Projects\p2pchat\server
npm run dev

# Terminal 2: Start frontend with host exposed
cd d:\Projects\p2pchat\client
npx vite --host

# Terminal 3: Expose backend to internet
ngrok http 3001

# Terminal 4: Expose frontend to internet
ngrok http 5173
```

---

## Production Mode (Single Port)

For easier testing, you can serve everything from one port:

1. Build the frontend:
```powershell
cd client
npm run build
```

2. The backend can serve the static files (requires code modification)

3. Then only expose port 3001:
```powershell
ngrok http 3001
```

---

## ngrok Web Interface

While ngrok is running, visit http://localhost:4040 to see:
- All requests/responses
- WebSocket connections
- Debugging info

---

**Happy Testing! 🚀**
