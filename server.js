 require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Prices live on the server so customers can't change them in the browser.
const PRODUCTS = {
  p100: { name: 'Trupt Chai Masala 100 g', price: 120 },
  p250: { name: 'Trupt Chai Masala 250 g', price: 280 },
  p500: { name: 'Trupt Chai Masala 500 g', price: 520 },
};

// OLD: const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
const DEMO = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;
const rzp = DEMO ? null : new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
if (DEMO) console.log('DEMO MODE: no Razorpay keys found, payments are simulated.');

const pending = new Map(); // orderId -> order details (use a database in production)

// OLD: app.get('/api/config', (_, res) => res.json({ key: process.env.RAZORPAY_KEY_ID, products: PRODUCTS }));
app.get('/api/config', (_, res) => res.json({ key: process.env.RAZORPAY_KEY_ID, products: PRODUCTS, demo: DEMO }));

app.post('/api/create-order', async (req, res) => {
  try {
    const { items = [], customer = {} } = req.body;
    let total = 0; const lines = [];
    for (const i of items) {
      const p = PRODUCTS[i.id]; const qty = Math.min(parseInt(i.qty) || 0, 20);
      if (p && qty > 0) { total += p.price * qty; lines.push({ name: p.name, qty, price: p.price }); }
    }
    if (!lines.length || !customer.name || !/^\d{10}$/.test(customer.phone) || !customer.address)
      return res.status(400).json({ error: 'Please fill in all details correctly.' });

    // OLD: const o = await rzp.orders.create({ amount: total * 100, currency: 'INR', receipt: 'trupt_' + Date.now() });
    const o = DEMO
      ? { id: 'demo_' + Date.now(), amount: total * 100 }
      : await rzp.orders.create({ amount: total * 100, currency: 'INR', receipt: 'trupt_' + Date.now() });

    pending.set(o.id, { lines, total, customer });
    // "demo" flag tells the browser to skip the Razorpay popup
    res.json({ orderId: o.id, amount: o.amount, demo: DEMO });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Could not start payment. Try again.' }); }
});

// OLD verify route:
// app.post('/api/verify', async (req, res) => {
//   const { razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: sig } = req.body;
//   const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(oid + '|' + pid).digest('hex');
//   const order = pending.get(oid);
//   if (expected !== sig || !order) return res.status(400).json({ ok: false });
//   pending.delete(oid);
//   await notifyOwner(order, pid, oid).catch(console.error);
//   res.json({ ok: true });
// });

app.post('/api/verify', async (req, res) => {
  const { razorpay_order_id: oid, razorpay_payment_id: pid = 'demo_payment', razorpay_signature: sig } = req.body;
  const order = pending.get(oid);
  const valid = DEMO
    ? oid?.startsWith('demo_')
    : crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(oid + '|' + pid).digest('hex') === sig;
  if (!valid || !order) return res.status(400).json({ ok: false });
  pending.delete(oid);
  await notifyOwner(order, pid, oid).catch(console.error);
  res.json({ ok: true });
});

async function notifyOwner({ lines, total, customer }, paymentId, orderId) {
  const text = [
    `New paid order — ₹${total}`,
    ...lines.map(l => `• ${l.name} × ${l.qty} = ₹${l.price * l.qty}`),
    '', `Name: ${customer.name}`, `Phone: ${customer.phone}`, `Address: ${customer.address}`,
    '', `Order: ${orderId}`, `Payment: ${paymentId}`,
  ].join('\n');

  // Always print the order in the terminal (handy in demo mode)
  console.log('\n===== NEW ORDER =====\n' + text + '\n=====================\n');

  if (process.env.SMTP_USER) {
    const mail = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
    await mail.sendMail({ from: process.env.SMTP_USER, to: process.env.OWNER_EMAIL, subject: `New Trupt order — ₹${total}`, text });
  }
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text }),
    });
  }
}

app.listen(process.env.PORT || 3000, () => console.log('Trupt Chai running on http://localhost:' + (process.env.PORT || 3000)));