# Trupt Chai Masala — website + payments

1. Install Node.js 18+, then in this folder run: `npm install`
2. Copy `.env.example` to `.env` and fill it in:
   - Razorpay keys: dashboard.razorpay.com → Settings → API Keys (start with Test Mode)
   - Gmail App Password for owner email: Google Account → Security → 2-Step Verification → App passwords
   - Optional Telegram alerts: create a bot with @BotFather, send it a message, get your chat id from @userinfobot
3. `npm start` → open http://localhost:3000
4. Test pay with Razorpay's test card 4111 1111 1111 1111 (any future expiry, any CVV).
5. Edit product names/prices in `server.js` (PRODUCTS). Deploy to Render, Railway or a VPS, then switch to Live keys.
