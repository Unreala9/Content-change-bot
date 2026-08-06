# 🚀 Production Deployment Guide: adshatke.site

This guide provides exact step-by-step instructions for deploying:
- **Frontend App**: `https://telegram.adshatke.site` (Hostinger Shared Web Hosting)
- **Backend VPS API**: `https://tg.adshatke.site` (Hostinger Ubuntu Linux VPS + Docker)

---

## 🌐 PART 1: Deploy Frontend (`https://telegram.adshatke.site`)

### Step 1: Upload Files via Hostinger hPanel File Manager
1. Log into your **Hostinger hPanel Dashboard**.
2. Go to **Websites** &rarr; Select **`telegram.adshatke.site`** &rarr; Click **File Manager**.
3. Open the **`public_html`** directory.
4. Upload all files from your local **`frontend/`** folder:
   - `index.html`
   - `login.html`
   - `config.js`
   - `app.js`
   - `style.css`
   - `.htaccess`

### Step 2: Verify VPS Backend URL in `config.js`
Ensure **`frontend/config.js`** contains your exact backend domain `https://tg.adshatke.site`:

```javascript
window.ENV = {
    API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8000'
        : 'https://tg.adshatke.site'
};
```

---

## 🖥️ PART 2: Deploy Backend VPS (`https://tg.adshatke.site`)

### Step 1: Point DNS A-Record to Hostinger VPS IP
In your Hostinger DNS Zone for `adshatke.site`:
- Add an **A Record**:
  - **Type**: `A`
  - **Name**: `tg`
  - **Points to**: `YOUR_HOSTINGER_VPS_IP`
  - **TTL**: `300` (or Default)

---

### Step 2: SSH into Hostinger VPS
Open your computer's terminal (or PuTTY) and connect to your VPS:

```bash
ssh root@YOUR_HOSTINGER_VPS_IP
```

---

### Step 3: Install Docker on Hostinger VPS
Run the automated official Docker installer:

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
```

---

### Step 4: Clone Repository & Setup Environment Variables
```bash
# 1. Clone repository from GitHub
git clone https://github.com/Unreala9/Content-change-bot.git
cd Content-change-bot/backend

# 2. Create production .env file
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

# Supabase Database & Auth (from Supabase Project Settings -> API)
SUPABASE_URL=https://ycylbhegnesaqxyfxbpk.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeWxiaGVnbmVzYXF4eWZ4YnBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5OTg4MTIsImV4cCI6MjEwMTU3NDgxMn0.vG_4Xr9Ig7SgjXwWmdCviJD85qFpsZUTUWXPUH2HjHw
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljeWxiaGVnbmVzYXF4eWZ4YnBrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTk5ODgxMiwiZXhwIjoyMTAxNTc0ODEyfQ.X8p4oPqf1BstPgJg0cCNpJMFXE7b4FezjOcNyqlOuLA
SUPABASE_JWT_SECRET=I/JU1FNL7By6Ok3ecCxwORXpkDK5ApD92uE3AWAcALwAskfXRT8diqCW1Zz2kWriB8ZhPtQ5He6QEaax5Ql0eQ==

# Razorpay Subscriptions (from Razorpay Dashboard)
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
SUPABASE_EDGE_FUNCTION_URL=https://ycylbhegnesaqxyfxbpk.supabase.co/functions/v1
```

*(Press `Ctrl + O`, `Enter` to save, then `Ctrl + X` to exit nano)*.

---

### Step 5: Build & Run Docker Backend Container
```bash
# Build Docker image
docker build -t telegram-sync-backend .

# Launch container in background with auto-restart
docker run -d -p 8000:8000 --name sync-backend --restart always --env-file .env telegram-sync-backend
```

Verify container status:
```bash
docker ps
```

---

## 🔒 PART 3: Setup Nginx Reverse Proxy & Free SSL Certificate

To enable secure HTTPS for `https://tg.adshatke.site`:

### Step 1: Install Nginx & Certbot
```bash
apt update && apt install -y nginx certbot python3-certbot-nginx
```

### Step 2: Create Nginx Site Configuration
```bash
nano /etc/nginx/sites-available/tg_backend
```

Paste the following Nginx configuration:

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

Enable site and test Nginx:
```bash
ln -s /etc/nginx/sites-available/tg_backend /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

### Step 3: Install Free SSL Certificate (HTTPS)
```bash
certbot --nginx -d tg.adshatke.site
```
*(Select `Redirect HTTP to HTTPS` when prompted)*.

---

## 🎉 Verification Checklist

1. **Test VPS Backend API**: Open `https://tg.adshatke.site` in browser &rarr; Should return:
   ```json
   {
       "status": "online",
       "service": "Telegram Sync Hub VPS Backend API",
       "docs": "/docs"
   }
   ```

2. **Test Frontend App**: Open `https://telegram.adshatke.site` in browser &rarr; Login & enjoy live channel sync! 🚀
