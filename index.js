import express from 'express';
import session from 'express-session';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import products from './data/products.js';
import Customer from './models/Customer.js';

// Set up file path utilities
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// ✅ Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/sportsStore', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// ✅ Middleware
app.use(express.static(join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

// ✅ Session Middleware
app.use(session({
  secret: 'sports-equipment-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true }
}));

// ✅ Initialize cart & user session
app.use(async (req, res, next) => {
  if (!req.session.cart) req.session.cart = [];
  res.locals.cartItemCount = req.session.cart.reduce((sum, item) => sum + item.quantity, 0);
  res.locals.user = req.session.user || null;
  next();
});

// 🏠 Home Route
app.get('/', (req, res) => res.render('home', { products }));

// 🛍 Shop Page
app.get('/shop', (req, res) => res.render('shop', { products }));

// 📚 About Page
app.get('/about', (req, res) => res.render('about'));

// 🛒 Cart Page
app.get('/cart', (req, res) => {
  const cartItems = req.session.cart;
  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  res.render('cart', { cartItems, total: total.toFixed(2) });
});

// ✅ Add to Cart Route
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

// ✅ "Buy Now" - Direct Checkout for One Product
app.post('/buy/:id', (req, res) => {
  if (!req.session.user) return res.redirect('/login'); // Redirect to login page

  const productId = Number(req.params.id);
  const product = products.find(p => p.id === productId);

  if (!product) return res.status(404).send('Product not found');

  req.session.cart = [{ ...product, quantity: 1 }]; // Only keep the selected product
  res.redirect('/checkout');
});

// 🛒 Checkout Page
app.get('/checkout', (req, res) => {
  if (!req.session.user) return res.redirect('/login'); // Require login/signup
  if (req.session.cart.length === 0) return res.redirect('/cart');

  const cartItems = req.session.cart;
  const total = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  res.render('checkout', { cartItems, total: total.toFixed(2) });
});

// ✅ Checkout Process
app.post('/checkout/complete', async (req, res) => {
    if (!req.session.user) return res.redirect('/login'); // Ensure logged-in user
    if (!req.session.cart || req.session.cart.length === 0) return res.redirect('/cart');

    const { address, paymentMethod } = req.body;

    if (!address || !paymentMethod) {
        return res.status(400).send('Address and payment method are required.');
    }

    // ✅ Save Order Data
    const order = {
        user: req.session.user._id, 
        cart: req.session.cart,
        total: req.session.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0).toFixed(2),
        address,
        paymentMethod,
        date: new Date().toISOString()
    };

    console.log("🛒 Order Placed:", order);

    req.session.cart = []; // Empty cart after checkout
    res.redirect('/checkout-success');
});

// ✅ Separate Login & Signup Pages
app.get('/login', (req, res) => res.render('login')); 
app.get('/signup', (req, res) => res.render('signup'));

// ✅ Handle Sign-Up
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

// ✅ Handle Login
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await Customer.findOne({ email });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).send('Invalid email or password');
  }

  req.session.user = user;
  res.redirect('/');
});

// ✅ Logout Route
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// 🚀 Start Server
app.listen(port, () => console.log(`✅ Server running at http://localhost:${port}`));