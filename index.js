import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import products from './data/products.js';
import Customer from './models/customer.js';
import Order from './models/order.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

mongoose.connect('mongodb://localhost:27017/sportsStore', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

app.use(express.static(join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

app.use(session({
  secret: 'sports-equipment-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

app.use(async (req, res, next) => {
  if (!req.session.cart) req.session.cart = [];
  res.locals.cartItemCount = req.session.cart.reduce((sum, item) => sum + item.quantity, 0);
  res.locals.user = req.session.user || null;
  next();
});

app.get('/', (req, res) => res.render('home', { products }));
app.get('/shop', (req, res) => res.render('shop', { products }));
app.get('/about', (req, res) => res.render('about'));

// Cart routes
app.get('/cart', (req, res) => {
  const cartItems = req.session.cart;
  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  res.render('cart', { cartItems, total: total.toFixed(2) });
});

app.post('/cart/add/:id', (req, res) => {
  const productId = Number(req.params.id);
  const product = products.find(p => p.id === productId);
  
  if (!product) return res.status(404).send('Product not found');

  const cartItem = req.session.cart.find(item => item.id === productId);
  if (cartItem) {
    cartItem.quantity += 1;
  } else {
    req.session.cart.push({ ...product, quantity: 1 });
  }

  res.redirect(req.get('Referer') || '/shop');
});

app.post('/cart/update', (req, res) => {
  const { productId, newQuantity } = req.body;
  const product = req.session.cart.find(p => p.id === Number(productId));
  if (product && newQuantity >= 1 && newQuantity <= 99) {
    product.quantity = newQuantity;
    return res.sendStatus(200);
  }
  res.sendStatus(400);
});

app.post('/cart/delete', (req, res) => {
  const { productId } = req.body;
  req.session.cart = req.session.cart.filter(p => p.id !== Number(productId));
  res.sendStatus(200);
});

app.post('/buy/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login');

  const productId = Number(req.params.id);
  const product = products.find(p => p.id === productId);

  if (!product) return res.status(404).send('Product not found');

  req.session.cart = [{ ...product, quantity: 1 }];
  res.redirect('/checkout');
});

app.get('/checkout', (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.cart.length === 0) return res.redirect('/cart');

  const cartItems = req.session.cart;
  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  res.render('checkout', { cartItems, total: total.toFixed(2) });
});

app.post('/checkout/complete', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  if (!req.session.cart || req.session.cart.length === 0) return res.redirect('/cart');

  const { street, city, state, zip, country, paymentMethod } = req.body;
  
  if (!street || !city || !state || !zip || !country || !paymentMethod) {
    return res.status(400).send('All fields are required.');
  }

  // Save order
  const order = new Order({
    customer: req.session.user._id,
    items: req.session.cart,
    total: req.session.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
    status: 'Processing'
  });
  await order.save();

  // Optionally, update user address/payment info here

  req.session.cart = [];
  res.redirect('/orders');
});

app.get('/login', (req, res) => res.render('login'));
app.get('/signup', (req, res) => res.render('signup'));

app.post('/signup', async (req, res) => {
  const { username, email, password, city } = req.body;

  if (!username || !email || !password || !city) {
    return res.status(400).send('All fields are required');
  }

  const existingUser = await Customer.findOne({ email });
  if (existingUser) {
    return res.status(400).send('Email already registered');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = new Customer({ username, email, password: hashedPassword, city });

  await newUser.save();
  req.session.user = newUser;
  res.redirect('/');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await Customer.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).send('Invalid email or password');
  }

  req.session.user = user;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// --- USER ORDER HISTORY ---
app.get('/orders', async (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  const orders = await Order.find({ customer: req.session.user._id }).sort({ createdAt: -1 });
  res.render('orders', { orders });
});

// --- ADMIN AUTH ---
const ADMIN_EMAIL = 'admin@sportsstore.com';
const ADMIN_PASSWORD = 'admin123'; // In production, use env vars and hashing!

app.get('/admin/login', (req, res) => {
  res.render('admin-login');
});

app.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-login', { error: 'Invalid admin credentials' });
});

app.get('/admin/logout', (req, res) => {
  req.session.isAdmin = false;
  res.redirect('/admin/login');
});

function requireAdmin(req, res, next) {
  if (!req.session.isAdmin) return res.redirect('/admin/login');
  next();
}

// --- ADMIN DASHBOARD ---
app.get('/admin/dashboard', requireAdmin, async (req, res) => {
  const orderCount = await Order.countDocuments();
  const customerCount = await Customer.countDocuments();
  res.render('admin-dashboard', { orderCount, customerCount });
});

app.get('/admin/orders', requireAdmin, async (req, res) => {
  const orders = await Order.find().populate('customer').sort({ createdAt: -1 });
  res.render('admin-orders', { orders });
});

app.post('/admin/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  await Order.findByIdAndUpdate(req.params.id, { status });
  res.redirect('/admin/orders');
});

app.get('/admin/customers', requireAdmin, async (req, res) => {
  const customers = await Customer.find();
  res.render('admin-customers', { customers });
});

app.listen(port, () => console.log(`✅ Server running at http://localhost:${port}`)); 