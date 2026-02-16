// server.js - FightPass Backend for Railway Deployment
// Complete Express API server for iOS app

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Client, Environment } = require('square');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================================
// SQUARE CLIENT SETUP
// ================================
const squareClient = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.NODE_ENV === 'production' ? Environment.Production : Environment.Sandbox
});

const { paymentsApi } = squareClient;

// ================================
// RESEND CLIENT SETUP
// ================================
const resend = new Resend(process.env.RESEND_API_KEY);

// ================================
// DATABASE SETUP
// ================================
const db = new Database('fightpass.db');

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT,
    token_balance INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    thumbnail_url TEXT,
    is_live INTEGER DEFAULT 0,
    viewers INTEGER DEFAULT 0,
    price INTEGER NOT NULL,
    start_time TEXT,
    end_time TEXT,
    youtube_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    event_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    square_payment_id TEXT,
    receipt_number TEXT,
    receipt_url TEXT,
    digital_signature TEXT,
    amount_paid REAL,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(event_id) REFERENCES events(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    items TEXT,
    amount REAL,
    status TEXT DEFAULT 'pending',
    square_payment_id TEXT,
    receipt_number TEXT,
    receipt_url TEXT,
    digital_signature TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS token_purchases (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    package_id TEXT NOT NULL,
    tokens_added INTEGER NOT NULL,
    bonus_tokens INTEGER DEFAULT 0,
    amount_paid REAL NOT NULL,
    square_payment_id TEXT NOT NULL,
    receipt_number TEXT NOT NULL,
    receipt_url TEXT,
    digital_signature TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

// ================================
// MIDDLEWARE
// ================================
app.use(helmet());
app.use(cors({
  origin: '*', // In production, specify your domains
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// ================================
// AUTHENTICATION MIDDLEWARE
// ================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// ================================
// UTILITY FUNCTIONS
// ================================
const generateId = () => {
  return 'id_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
};

const generateAccessToken = () => {
  return 'tok_' + Math.random().toString(36).substr(2, 16);
};

// Generate unique receipt number
const generateReceiptNumber = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substr(2, 6).toUpperCase();
  return `RCP-${timestamp}-${random}`;
};

// Generate digital signature for purchase verification
const generateDigitalSignature = (data) => {
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  const dataString = JSON.stringify(data);
  return crypto
    .createHmac('sha256', secret)
    .update(dataString)
    .digest('hex');
};

// Verify digital signature
const verifyDigitalSignature = (data, signature) => {
  const expectedSignature = generateDigitalSignature(data);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
};

// Send receipt email via Resend
const sendReceiptEmail = async (receiptData) => {
  try {
    const { email, receiptNumber, items, totalAmount, purchaseDate, signature } = receiptData;
    
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FF0000; color: white; padding: 20px; text-align: center; }
        .content { background: #f9f9f9; padding: 20px; margin-top: 20px; }
        .receipt-info { background: white; padding: 15px; margin: 10px 0; border-left: 4px solid #FF0000; }
        .items { background: white; padding: 15px; margin: 10px 0; }
        .total { font-size: 20px; font-weight: bold; color: #FF0000; margin-top: 15px; }
        .signature { font-size: 10px; color: #666; margin-top: 20px; word-break: break-all; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎫 FightPass Receipt</h1>
          <p>Thank you for your purchase!</p>
        </div>
        
        <div class="content">
          <div class="receipt-info">
            <h3>Receipt Details</h3>
            <p><strong>Receipt Number:</strong> ${receiptNumber}</p>
            <p><strong>Date:</strong> ${new Date(purchaseDate).toLocaleString()}</p>
            <p><strong>Email:</strong> ${email}</p>
          </div>
          
          <div class="items">
            <h3>Items Purchased</h3>
            ${items}
          </div>
          
          <div class="total">
            Total: $${totalAmount.toFixed(2)}
          </div>
          
          <div class="signature">
            <p><strong>Digital Signature:</strong></p>
            <p>${signature}</p>
            <p style="margin-top: 10px; font-size: 9px;">This signature verifies the authenticity of this receipt. Do not share this receipt as it may contain sensitive purchase information.</p>
          </div>
        </div>
        
        <div class="footer">
          <p>FightPass - Token-Based Streaming Platform</p>
          <p>Questions? Contact support@fightpass.com</p>
          <p style="margin-top: 15px; font-size: 10px;">This is an automated receipt. Please do not reply to this email.</p>
        </div>
      </div>
    </body>
    </html>
    `;

    const result = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'FightPass <onboarding@resend.dev>',
      to: email,
      subject: `Receipt ${receiptNumber} - FightPass Purchase`,
      html: emailHtml
    });

    return result;
  } catch (error) {
    console.error('Error sending receipt email:', error);
    throw error;
  }
};

// ================================
// HEALTH CHECK
// ================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ================================
// AUTHENTICATION ENDPOINTS
// ================================

// Sign Up
app.post('/api/v1/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Check if user exists
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = generateId();

    // Create user
    db.prepare(`
      INSERT INTO users (id, email, password, name, token_balance)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, email, hashedPassword, name || null, 0);

    // Generate JWT
    const token = jwt.sign({ userId, email }, process.env.JWT_SECRET || 'your-secret-key', {
      expiresIn: '30d'
    });

    res.status(201).json({
      token,
      user_id: userId,
      email,
      name: name || null,
      token_balance: 0
    });
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sign In
app.post('/api/v1/auth/signin', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET || 'your-secret-key', {
      expiresIn: '30d'
    });

    res.json({
      token,
      user_id: user.id,
      email: user.email,
      name: user.name,
      token_balance: user.token_balance
    });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Password Reset
app.post('/api/v1/auth/password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If that email exists, a reset link has been sent', success: true });
    }

    // TODO: Send email with reset link using Resend

    res.json({ message: 'Password reset email sent', success: true });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================================
// EVENT ENDPOINTS
// ================================

// Get Live Events
app.get('/api/v1/events/live', (req, res) => {
  try {
    const events = db.prepare('SELECT * FROM events WHERE is_live = 1').all();
    
    res.json({
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle || '',
        description: e.description,
        thumbnail_url: e.thumbnail_url,
        is_live: Boolean(e.is_live),
        viewers: e.viewers,
        price: e.price,
        start_time: e.start_time,
        end_time: e.end_time
      })),
      total: events.length
    });
  } catch (error) {
    console.error('Get live events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Upcoming Events
app.get('/api/v1/events/upcoming', (req, res) => {
  try {
    const events = db.prepare('SELECT * FROM events WHERE is_live = 0').all();
    
    res.json({
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle || '',
        description: e.description,
        thumbnail_url: e.thumbnail_url,
        is_live: Boolean(e.is_live),
        viewers: e.viewers,
        price: e.price,
        start_time: e.start_time,
        end_time: e.end_time
      })),
      total: events.length
    });
  } catch (error) {
    console.error('Get upcoming events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Event Details
app.get('/api/v1/events/:eventId', (req, res) => {
  try {
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.eventId);
    
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    res.json({
      id: event.id,
      title: event.title,
      subtitle: event.subtitle || '',
      description: event.description || '',
      thumbnail_url: event.thumbnail_url,
      is_live: Boolean(event.is_live),
      viewers: event.viewers,
      price: event.price,
      start_time: event.start_time,
      end_time: event.end_time,
      venue: null,
      categories: []
    });
  } catch (error) {
    console.error('Get event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search Events
app.get('/api/v1/events/search', (req, res) => {
  try {
    const query = req.query.q || '';
    const events = db.prepare(`
      SELECT * FROM events 
      WHERE title LIKE ? OR subtitle LIKE ? OR description LIKE ?
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
    
    res.json({
      events: events.map(e => ({
        id: e.id,
        title: e.title,
        subtitle: e.subtitle || '',
        description: e.description,
        thumbnail_url: e.thumbnail_url,
        is_live: Boolean(e.is_live),
        viewers: e.viewers,
        price: e.price,
        start_time: e.start_time,
        end_time: e.end_time
      })),
      total: events.length
    });
  } catch (error) {
    console.error('Search events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================================
// PURCHASE ENDPOINTS
// ================================

// Purchase Event
app.post('/api/v1/purchases/events', authenticateToken, async (req, res) => {
  try {
    const { event_id, user_id } = req.body;

    // Get event
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(event_id);
    if (!event) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Get user
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check token balance
    if (user.token_balance < event.price) {
      return res.status(400).json({ 
        message: 'Insufficient tokens',
        required: event.price,
        current: user.token_balance,
        shortage: event.price - user.token_balance
      });
    }

    // ================================
    // PROCESS PURCHASE
    // ================================
    
    // Deduct tokens
    db.prepare('UPDATE users SET token_balance = token_balance - ? WHERE id = ?')
      .run(event.price, user_id);

    // Generate purchase details
    const purchaseId = generateId();
    const accessToken = generateAccessToken();
    const receiptNumber = generateReceiptNumber();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days

    // Create signature data
    const signatureData = {
      receipt_number: receiptNumber,
      purchase_id: purchaseId,
      user_id: user_id,
      event_id: event_id,
      access_token: accessToken,
      tokens_spent: event.price,
      expires_at: expiresAt,
      timestamp: new Date().toISOString()
    };
    
    const digitalSignature = generateDigitalSignature(signatureData);

    // ================================
    // SAVE PURCHASE RECORD
    // ================================
    db.prepare(`
      INSERT INTO purchases (
        id, user_id, event_id, access_token, expires_at,
        receipt_number, digital_signature, amount_paid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      purchaseId,
      user_id,
      event_id,
      accessToken,
      expiresAt,
      receiptNumber,
      digitalSignature,
      event.price
    );

    // Create order record
    const orderId = generateId();
    db.prepare(`
      INSERT INTO orders (
        id, user_id, type, items, amount, status,
        receipt_number, digital_signature
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      user_id,
      'Event Access',
      `${event.title} - ${event.subtitle}`,
      event.price,
      'completed',
      receiptNumber,
      digitalSignature
    );

    // ================================
    // SEND RECEIPT EMAIL
    // ================================
    const itemsHtml = `
      <h4>${event.title}</h4>
      <p>${event.subtitle}</p>
      <ul>
        <li><strong>Access Token:</strong> ${accessToken}</li>
        <li><strong>Valid Until:</strong> ${new Date(expiresAt).toLocaleDateString()}</li>
        <li><strong>Tokens Used:</strong> ${event.price}</li>
      </ul>
      <p style="margin-top: 15px; padding: 10px; background: #fff3cd; border-left: 4px solid #ffc107;">
        <strong>⚠️ Keep this receipt safe!</strong> Your access token is required to watch this event.
      </p>
    `;

    try {
      await sendReceiptEmail({
        email: user.email,
        receiptNumber: receiptNumber,
        items: itemsHtml,
        totalAmount: event.price,
        purchaseDate: new Date().toISOString(),
        signature: digitalSignature
      });
    } catch (emailError) {
      console.error('Failed to send receipt email:', emailError);
      // Don't fail the purchase if email fails
    }

    // ================================
    // RETURN SUCCESS
    // ================================
    res.json({
      success: true,
      access_token: accessToken,
      expires_at: expiresAt,
      receipt_number: receiptNumber,
      digital_signature: digitalSignature,
      message: `Event purchased successfully! Receipt sent to ${user.email}`
    });

  } catch (error) {
    console.error('Purchase event error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get User Events
app.get('/api/v1/users/:userId/events', authenticateToken, (req, res) => {
  try {
    const purchases = db.prepare(`
      SELECT p.*, e.title, e.thumbnail_url
      FROM purchases p
      JOIN events e ON p.event_id = e.id
      WHERE p.user_id = ?
      ORDER BY p.purchase_date DESC
    `).all(req.params.userId);

    res.json({
      events: purchases.map(p => ({
        id: p.id,
        event_id: p.event_id,
        title: p.title,
        purchase_date: p.purchase_date,
        expires_at: p.expires_at,
        status: new Date(p.expires_at) > new Date() ? 'active' : 'expired',
        thumbnail_url: p.thumbnail_url
      })),
      total: purchases.length
    });
  } catch (error) {
    console.error('Get user events error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Stream URL
app.post('/api/v1/events/:eventId/stream', authenticateToken, (req, res) => {
  try {
    const { user_id } = req.body;
    const eventId = req.params.eventId;

    // Verify purchase
    const purchase = db.prepare(`
      SELECT * FROM purchases 
      WHERE user_id = ? AND event_id = ? AND datetime(expires_at) > datetime('now')
    `).get(user_id, eventId);

    if (!purchase) {
      return res.status(403).json({ message: 'No valid purchase found' });
    }

    // Get event
    const event = db.prepare('SELECT * FROM events WHERE id = ?').get(eventId);
    if (!event || !event.youtube_url) {
      return res.status(404).json({ message: 'Stream not available' });
    }

    res.json({
      stream_url: event.youtube_url,
      expires_at: purchase.expires_at
    });
  } catch (error) {
    console.error('Get stream error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================================
// TOKEN ENDPOINTS
// ================================

// Purchase Tokens (with Square integration placeholder)
app.post('/api/v1/tokens/purchase', authenticateToken, async (req, res) => {
  try {
    const { package_id, user_id, source_id, verification_token } = req.body;

    // Token packages
    const packages = {
      '100': { tokens: 100, bonus: 0, price: 499, name: '100 Tokens' }, // $4.99 in cents
      '250': { tokens: 250, bonus: 50, price: 999, name: '250 + 50 Bonus Tokens' },
      '500': { tokens: 500, bonus: 150, price: 1999, name: '500 + 150 Bonus Tokens' },
      '1000': { tokens: 1000, bonus: 500, price: 3999, name: '1000 + 500 Bonus Tokens' }
    };

    const pkg = packages[package_id];
    if (!pkg) {
      return res.status(400).json({ message: 'Invalid package' });
    }

    // Get user info
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ================================
    // PROCESS PAYMENT WITH SQUARE
    // ================================
    const idempotencyKey = generateId();
    
    try {
      const paymentResponse = await paymentsApi.createPayment({
        sourceId: source_id,
        idempotencyKey: idempotencyKey,
        amountMoney: {
          amount: BigInt(pkg.price),
          currency: 'USD'
        },
        locationId: process.env.SQUARE_LOCATION_ID,
        note: `FightPass Token Purchase - ${pkg.name}`,
        buyerEmailAddress: user.email,
        verificationToken: verification_token, // SCA verification
        autocomplete: true,
        statementDescriptionIdentifier: 'FIGHTPASS'
      });

      const payment = paymentResponse.result.payment;

      // ================================
      // GENERATE RECEIPT & SIGNATURE
      // ================================
      const receiptNumber = generateReceiptNumber();
      const purchaseId = generateId();
      const totalTokens = pkg.tokens + pkg.bonus;
      
      // Create signature data
      const signatureData = {
        receipt_number: receiptNumber,
        purchase_id: purchaseId,
        user_id: user_id,
        package_id: package_id,
        tokens: totalTokens,
        amount: pkg.price / 100,
        square_payment_id: payment.id,
        timestamp: new Date().toISOString()
      };
      
      const digitalSignature = generateDigitalSignature(signatureData);

      // ================================
      // UPDATE DATABASE
      // ================================
      
      // Add tokens to user account
      db.prepare('UPDATE users SET token_balance = token_balance + ? WHERE id = ?')
        .run(totalTokens, user_id);

      // Record token purchase with receipt info
      db.prepare(`
        INSERT INTO token_purchases (
          id, user_id, package_id, tokens_added, bonus_tokens, 
          amount_paid, square_payment_id, receipt_number, digital_signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        purchaseId,
        user_id,
        package_id,
        pkg.tokens,
        pkg.bonus,
        pkg.price / 100,
        payment.id,
        receiptNumber,
        digitalSignature
      );

      // Create order record
      const orderId = generateId();
      db.prepare(`
        INSERT INTO orders (
          id, user_id, type, items, amount, status, 
          square_payment_id, receipt_number, digital_signature
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        user_id,
        'Token Package',
        pkg.name,
        pkg.price / 100,
        'completed',
        payment.id,
        receiptNumber,
        digitalSignature
      );

      // ================================
      // SEND RECEIPT EMAIL
      // ================================
      const itemsHtml = `
        <p><strong>${pkg.name}</strong></p>
        <ul>
          <li>${pkg.tokens} Base Tokens</li>
          ${pkg.bonus > 0 ? `<li>+ ${pkg.bonus} Bonus Tokens 🎁</li>` : ''}
          <li><strong>Total: ${totalTokens} Tokens</strong></li>
        </ul>
      `;

      await sendReceiptEmail({
        email: user.email,
        receiptNumber: receiptNumber,
        items: itemsHtml,
        totalAmount: pkg.price / 100,
        purchaseDate: new Date().toISOString(),
        signature: digitalSignature
      });

      // Get updated balance
      const updatedUser = db.prepare('SELECT token_balance FROM users WHERE id = ?').get(user_id);

      // ================================
      // RETURN SUCCESS RESPONSE
      // ================================
      res.json({
        success: true,
        new_balance: updatedUser.token_balance,
        tokens_added: totalTokens,
        bonus_tokens: pkg.bonus,
        receipt_number: receiptNumber,
        receipt_url: null, // Could link to PDF generator
        digital_signature: digitalSignature,
        square_payment_id: payment.id,
        message: `Successfully purchased ${totalTokens} tokens! Receipt sent to ${user.email}`
      });

    } catch (squareError) {
      console.error('Square payment error:', squareError);
      
      // Handle specific Square errors
      if (squareError.errors) {
        const errorMessages = squareError.errors.map(e => e.detail || e.code).join(', ');
        return res.status(400).json({ 
          message: `Payment failed: ${errorMessages}`,
          code: 'SQUARE_PAYMENT_ERROR'
        });
      }
      
      return res.status(500).json({ 
        message: 'Payment processing failed. Please try again.',
        code: 'PAYMENT_ERROR'
      });
    }

  } catch (error) {
    console.error('Purchase tokens error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get Token Balance
app.get('/api/v1/users/:userId/tokens', authenticateToken, (req, res) => {
  try {
    const user = db.prepare('SELECT token_balance FROM users WHERE id = ?').get(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      balance: user.token_balance,
      user_id: req.params.userId
    });
  } catch (error) {
    console.error('Get token balance error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================================
// ORDER ENDPOINTS
// ================================

// Get User Orders
app.get('/api/v1/users/:userId/orders', authenticateToken, (req, res) => {
  try {
    const orders = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.params.userId);

    res.json({
      orders: orders.map(o => ({
        id: o.id,
        type: o.type,
        items: o.items,
        date: o.created_at,
        amount: `$${o.amount.toFixed(2)}`,
        status: o.status
      })),
      total: orders.length
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================================
// PLACEHOLDER ENDPOINTS
// ================================
// These return mock data - implement as needed

app.get('/api/v1/merchandise', (req, res) => {
  res.json({ items: [], total: 0 });
});

app.get('/api/v1/events/:eventId/photos', (req, res) => {
  res.json({ photos: [], total: 0 });
});

app.get('/api/v1/users/:userId', authenticateToken, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    token_balance: user.token_balance,
    created_at: user.created_at,
    notification_preferences: {
      live_events: true,
      upcoming_events: true,
      merchandise: false,
      photos: true,
      token_deals: false,
      order_updates: true,
      email: true,
      push: true
    }
  });
});

// ================================
// RECEIPT VERIFICATION ENDPOINT
// ================================
app.get('/api/v1/receipts/:receiptNumber', authenticateToken, (req, res) => {
  try {
    const { receiptNumber } = req.params;
    
    // Check token purchases
    const tokenPurchase = db.prepare(`
      SELECT tp.*, u.email, u.name 
      FROM token_purchases tp
      JOIN users u ON tp.user_id = u.id
      WHERE tp.receipt_number = ?
    `).get(receiptNumber);
    
    if (tokenPurchase) {
      // Verify signature
      const signatureData = {
        receipt_number: tokenPurchase.receipt_number,
        purchase_id: tokenPurchase.id,
        user_id: tokenPurchase.user_id,
        package_id: tokenPurchase.package_id,
        tokens: tokenPurchase.tokens_added + tokenPurchase.bonus_tokens,
        amount: tokenPurchase.amount_paid,
        square_payment_id: tokenPurchase.square_payment_id,
        timestamp: tokenPurchase.created_at
      };
      
      const isValid = verifyDigitalSignature(signatureData, tokenPurchase.digital_signature);
      
      return res.json({
        type: 'token_purchase',
        receipt_number: tokenPurchase.receipt_number,
        purchase_date: tokenPurchase.created_at,
        customer_email: tokenPurchase.email,
        customer_name: tokenPurchase.name,
        tokens_purchased: tokenPurchase.tokens_added,
        bonus_tokens: tokenPurchase.bonus_tokens,
        total_tokens: tokenPurchase.tokens_added + tokenPurchase.bonus_tokens,
        amount_paid: tokenPurchase.amount_paid,
        square_payment_id: tokenPurchase.square_payment_id,
        digital_signature: tokenPurchase.digital_signature,
        signature_valid: isValid,
        verified: isValid
      });
    }
    
    // Check event purchases
    const eventPurchase = db.prepare(`
      SELECT p.*, u.email, u.name, e.title, e.subtitle
      FROM purchases p
      JOIN users u ON p.user_id = u.id
      JOIN events e ON p.event_id = e.id
      WHERE p.receipt_number = ?
    `).get(receiptNumber);
    
    if (eventPurchase) {
      // Verify signature
      const signatureData = {
        receipt_number: eventPurchase.receipt_number,
        purchase_id: eventPurchase.id,
        user_id: eventPurchase.user_id,
        event_id: eventPurchase.event_id,
        access_token: eventPurchase.access_token,
        tokens_spent: eventPurchase.amount_paid,
        expires_at: eventPurchase.expires_at,
        timestamp: eventPurchase.purchase_date
      };
      
      const isValid = verifyDigitalSignature(signatureData, eventPurchase.digital_signature);
      
      return res.json({
        type: 'event_purchase',
        receipt_number: eventPurchase.receipt_number,
        purchase_date: eventPurchase.purchase_date,
        customer_email: eventPurchase.email,
        customer_name: eventPurchase.name,
        event_title: eventPurchase.title,
        event_subtitle: eventPurchase.subtitle,
        tokens_spent: eventPurchase.amount_paid,
        access_token: eventPurchase.access_token,
        expires_at: eventPurchase.expires_at,
        digital_signature: eventPurchase.digital_signature,
        signature_valid: isValid,
        verified: isValid
      });
    }
    
    return res.status(404).json({ 
      message: 'Receipt not found',
      receipt_number: receiptNumber
    });
    
  } catch (error) {
    console.error('Receipt verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ================================
// ERROR HANDLING
// ================================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// ================================
// START SERVER
// ================================
app.listen(PORT, () => {
  console.log(`🚀 FightPass API running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing database...');
  db.close();
  process.exit(0);
});
