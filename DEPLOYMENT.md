# 🚀 Production Deployment Guide: adshatke.site (Vite + React SPA)

This guide provides exact step-by-step instructions for deploying:
- **Frontend App**: `https://telegram.adshatke.site` (Hostinger Shared Web Hosting / Vercel / Netlify)
- **Backend VPS API**: `https://tg.adshatke.site` (Hostinger Ubuntu Linux VPS + Docker)

---

## 🌐 PART 1: Deploy React Frontend (`https://telegram.adshatke.site`)

### Option A: Local Build & Hostinger Web Hosting Upload
1. Open your terminal in the `frontend` folder and run the production build:
   ```bash
   cd frontend
   npm run build
   ```
2. This creates a production-ready **`dist/`** folder.
3. Log into **Hostinger hPanel** &rarr; **Websites** &rarr; **`telegram.adshatke.site`** &rarr; **File Manager**.
4. Open **`public_html`** and upload all files inside **`frontend/dist/`**:
   - `index.html`
   - `assets/` (CSS & JavaScript bundles)
   - `.htaccess` (for clean SPA routing)

### Option B: Vercel / Netlify (Automated 1-Click Deployment ⚡)
1. Import your GitHub repository `Unreala9/Content-change-bot`.
2. Root Directory: `frontend`
3. Build Command: `npm run build`
4. Output Directory: `dist`
5. Click **Deploy**!

---

## 🖥️ PART 2: Deploy Backend VPS (`https://tg.adshatke.site`)

### Step 1: Point DNS A-Record to Hostinger VPS IP (`72.60.202.148`)
In your Hostinger DNS Zone for `adshatke.site`:
- Add an **A Record**:
  - **Type**: `A`
  - **Name**: `tg`
  - **Points to**: `72.60.202.148`
  - **TTL**: `300`

---

### Step 2: SSH into Hostinger VPS
```bash
ssh root@72.60.202.148
```

---

### Step 3: Install Docker on Hostinger VPS
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh
```

---

### Step 4: Clone Repository & Setup Environment Variables
```bash
git clone https://github.com/Unreala9/Content-change-bot.git
cd Content-change-bot/backend

cp .env.example .env
nano .env
```

Paste your actual credentials into `.env`:

```env
TELEGRAM_API_ID=20504953
TELEGRAM_API_HASH=d28ccc2a28a88a172294b723a305f6f8
SESSION_NAME=telegram_session
PORT=8000

WEBHOOK_URL=https://n8n.getaipilot.in/webhook/telegram_sync
DESTINATION_CHANNEL=your_channel_username

SUPABASE_URL=https://ycylbhegnesaqxyfxbpk.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeWxiaGVnbmVzYXF4eWZ4YnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTg4MTIsImV4cCI6MjEwMTU3NDgxMn0.vG_4Xr9Ig7SgjXwWmdCviJD85qFpsZUTUWXPUH2HjHw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeWxiaGVnbmVzYXF4eWZ4YnBrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk5ODgxMiwiZXhwIjoyMTAxNTc0ODEyfQ.X8p4oPqf1BstPgJg0cCNpJMFXE7b4FezjOcNyqlOuLA
SUPABASE_JWT_SECRET=I/JU1FNL7By6Ok3ecCxwORXpkDK5ApD92uE3AWAcALwAskfXRT8diqCW1Zz2kWriB8ZhPtQ5He6QEaax5Ql0eQ==

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
SUPABASE_EDGE_FUNCTION_URL=https://ycylbhegnesaqxyfxbpk.supabase.co/functions/v1
```

---

### Step 5: Build & Run Docker Backend Container
```bash
docker build -t telegram-sync-backend .
docker run -d -p 8000:8000 --name sync-backend --restart always --env-file .env telegram-sync-backend
```

---

## 🔒 PART 3: Setup Nginx Reverse Proxy & Free SSL

```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
nano /etc/nginx/sites-available/tg_backend
```

Paste:
```nginx
server {
    server_name tg.adshatke.site;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/tg_backend /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d tg.adshatke.site
```
