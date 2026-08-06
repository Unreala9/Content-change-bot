/**
 * Telegram Sync Hub - Frontend Runtime Configuration
 * 
 * If you deploy the backend on a VPS (e.g., https://api.yourdomain.com or http://123.45.67.89:8000),
 * update `API_BASE_URL` below with your VPS URL.
 * 
 * If left empty "", it will automatically default to window.location.origin.
 */
window.ENV = {
    // Replace with your backend VPS URL when deploying frontend on Vercel/Netlify/Hostinger
    // Example: API_BASE_URL: "https://api.yourdomain.com"
    API_BASE_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://localhost:8000'
        : 'https://tg.adshatke.site'
};
