const $ = s => document.querySelector(s);
let products = {}, razorKey = '', cart = {};
const rupee = n => '₹' + n;

async function init() {
  const cfg = await (await fetch('/api/config')).json();
  products = cfg.products; razorKey = cfg.key;
  $('#products').innerHTML = Object.entries(products).map(([id, p]) => `
    <div class="card"><h3>${p.name}</h3><p class="price">${rupee(p.price)}</p>
    <button class="btn" data-add="${id}">Add to cart</button></div>`).join('');
}

function render() {
  const ids = Object.keys(cart);
  let total = 0, count = 0;
  $('#cartItems').innerHTML = ids.map(id => {
    const p = products[id], q = cart[id]; total += p.price * q; count += q;
    return `<div class="line"><div>${p.name}<br><small>${rupee(p.price)}</small></div>
      <div class="qty"><button data-dec="${id}" aria-label="Remove one">−</button><span>${q}</span><button data-inc="${id}" aria-label="Add one">+</button></div></div>`;
  }).join('');
  $('#count').textContent = count;
  $('#total').textContent = rupee(total);
  $('#empty').hidden = ids.length > 0;
  $('#checkout').hidden = ids.length === 0;
}

function setDrawer(open) {
  $('#drawer').classList.toggle('open', open);
  $('#drawer').setAttribute('aria-hidden', !open);
}

document.addEventListener('click', e => {
  const t = e.target;
  if (t.dataset.add) { cart[t.dataset.add] = (cart[t.dataset.add] || 0) + 1; render(); setDrawer(true); }
  if (t.dataset.inc) { cart[t.dataset.inc]++; render(); }
  if (t.dataset.dec) { if (--cart[t.dataset.dec] <= 0) delete cart[t.dataset.dec]; render(); }
});
$('#cartBtn').onclick = () => setDrawer(true);
$('#closeCart').onclick = () => setDrawer(false);

$('#checkout').addEventListener('submit', async e => {
  e.preventDefault();
  const f = new FormData(e.target), msg = $('#msg'), btn = $('#payBtn');
  const customer = { name: f.get('name').trim(), phone: f.get('phone').trim(), address: f.get('address').trim() };
  const items = Object.entries(cart).map(([id, qty]) => ({ id, qty }));
  btn.disabled = true; msg.textContent = 'Starting payment…';
  try {
    const res = await fetch('/api/create-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, customer }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
        if (data.demo) {
      const v = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ razorpay_order_id: data.orderId }) });
      if ((await v.json()).ok) {
        cart = {}; render(); e.target.reset();
        msg.textContent = 'Demo order placed. No real payment was taken.';
      }
      btn.disabled = false;
      return;
    }
    new Razorpay({
      key: razorKey, amount: data.amount, currency: 'INR', order_id: data.orderId,
      name: 'Trupt Chai Masala', description: 'Chai masala order',
      prefill: { name: customer.name, contact: customer.phone },
      theme: { color: '#1f3b2d' },
      handler: async r => {
        const v = await fetch('/api/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r) });
        if ((await v.json()).ok) {
          cart = {}; render(); e.target.reset();
          msg.textContent = 'Payment received. Your order is confirmed — we will call you before dispatch.';
        } else msg.textContent = 'Payment went through but could not be confirmed. Please call us with your payment ID: ' + r.razorpay_payment_id;
      },
      modal: { ondismiss: () => { btn.disabled = false; msg.textContent = 'Payment cancelled. Your cart is saved.'; } },
    }).open();
  } catch (err) { msg.textContent = err.message || 'Something went wrong. Try again.'; }
  btn.disabled = false;
});

init().then(render);
