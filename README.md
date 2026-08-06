# Telegram Sync Hub & Multi-User Side-by-Side Studio

A multi-tenant platform for extracting, modifying, auto-posting, and forwarding Telegram channel messages powered by **FastAPI**, **Telethon**, **Supabase Auth & Database**, and **n8n**.

---

## 🌟 Key Features

- **Multi-User Authentication**: Register and Sign In using Supabase Auth. Each user manages their own configuration and logs.
- **Multi-Tenant Telegram Session Connection**: Connect individual Telegram accounts via Telethon `StringSession` strings stored securely in Supabase.
- **Side-by-Side Live Modifier Studio**: Extract messages from source channels, apply text rules (prefix/suffix, word replacements, link modification, keyword filters), and auto-post to destination channels.
- **n8n Webhook Forwarding**: Seamlessly forward transformed messages to n8n workflows per user.
- **Live Sync Activity Feed**: Real-time message logs isolated per user account.

---

## 🚀 Quick Setup Guide

### 1. Database Setup (Supabase)

1. Create a free project at [supabase.com](https://supabase.com).
2. Go to your project's **SQL Editor**.
3. Open `supabase_schema.sql` from this repository, paste its contents into the SQL Editor, and click **Run**.
   - This creates `public.profiles`, `public.user_settings`, and `public.sync_logs` tables along with Row Level Security (RLS) policies and automatic user triggers.

### 2. Environment Configuration (`.env`)

Copy `.env.example` to `.env` or update `.env` with your API credentials:

```env
# Telegram API Credentials (from https://my.telegram.org)
TELEGRAM_API_ID=20504953
TELEGRAM_API_HASH=d28ccc2a28a88a172294b723a305f6f8

# Supabase Credentials (from Supabase Project Settings -> API)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_JWT_SECRET=your-supabase-jwt-secret
```

### 3. Install Dependencies & Run

Install required Python packages:

```bash
pip install -r requirements.txt
```

Launch the application server:

```bash
python main.py
```

Or on Windows:

```cmd
run.bat
```

Access the Web Studio at: `http://localhost:8000`

---

## 📂 Project Architecture

- **`supabase_schema.sql`**: Full PostgreSQL DDL script for Supabase tables, indexes, and RLS policies.
- **`supabase_client.py`**: Supabase Python client initializer, JWT token verification middleware, and database helpers.
- **`telegram_manager.py`**: Multi-tenant Telethon StringSession manager running concurrent background listeners.
- **`main.py`**: FastAPI backend server exposing REST endpoints protected by Supabase JWT bearer tokens.
- **`config.py`**: Environment variables loader and configuration defaults.
- **`static/`**: Binance-themed responsive web application (HTML, CSS, JavaScript).

---

## 🔒 Security & Privacy

- All user data, settings, and logs are isolated using Supabase Row Level Security (RLS).
- Telethon sessions are stored as encrypted string sessions (`StringSession`) tied to individual user profiles.
