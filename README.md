# 🥊 FightPass Backend API

> Secure token-based streaming platform for combat sports events

[![Deploy to Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/codeember/fightpass-backend)

## 📋 Overview

FightPass Backend is a Node.js/Express API that powers the FightPass streaming platform. It provides secure, token-based access to live combat sports events, eliminating revenue loss from shared links.

### Key Features

- 🔐 **JWT Authentication** - Secure user authentication
- 🪙 **Token Economy** - Purchase and spend tokens on events
- 💳 **Square Integration** - Secure payment processing
- 📧 **Email Receipts** - Automated receipts via Resend
- 🔏 **Digital Signatures** - HMAC-SHA256 receipt verification
- 📊 **Event Management** - Live and upcoming events
- 🎫 **Access Control** - One-device-per-ticket enforcement

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ installed
- npm or yarn
- Square developer account (for payments)
- Resend account (for emails)

### Local Development

```bash
# Clone repository
git clone https://github.com/codeember/fightpass-backend.git
cd fightpass-backend

# Install dependencies
npm install

# Create .env file from example
cp .env.example .env

# Edit .env with your credentials
nano .env

# Seed database with test data
npm run seed

# Start development server
npm start
```

Server runs at `http://localhost:3000`

### Environment Variables

Create `.env` file with:

```env
# JWT Secret (32+ characters)
JWT_SECRET=your_super_secret_key_at_least_32_characters_long

# Square Credentials
SQUARE_ACCESS_TOKEN=your_square_sandbox_or_production_token
SQUARE_LOCATION_ID=your_square_location_id

# Resend Email
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=receipts@fightpass.com

# Environment
NODE_ENV=development
PORT=3000
```

## 📡 API Endpoints

### Authentication
```
POST /api/v1/auth/signup       - Create new account
POST /api/v1/auth/signin       - Sign in
POST /api/v1/auth/password-reset - Request password reset
```

### Events
```
GET  /api/v1/events/live       - Get live events
GET  /api/v1/events/upcoming   - Get upcoming events
GET  /api/v1/events/:id        - Get event details
GET  /api/v1/events/search     - Search events
```

### Purchases
```
POST /api/v1/purchases/events  - Purchase event access (tokens)
POST /api/v1/tokens/purchase   - Purchase tokens (Square)
```

### User
```
GET  /api/v1/users/:id/events  - Get user's purchased events
GET  /api/v1/users/:id/tokens  - Get token balance
GET  /api/v1/users/:id/orders  - Get order history
```

### Receipts
```
GET  /api/v1/receipts/:receiptNumber - Verify receipt signature
```

### Health
```
GET  /health                   - Health check
```

## 🗄️ Database Schema

### Users
- id, email, password (hashed), name, token_balance, created_at

### Events
- id, title, subtitle, description, thumbnail_url, is_live, viewers, price, start_time, youtube_url, created_at

### Purchases
- id, user_id, event_id, access_token, receipt_number, digital_signature, square_payment_id, amount_paid, purchase_date, expires_at

### Token Purchases
- id, user_id, package_id, tokens_added, bonus_tokens, amount_paid, square_payment_id, receipt_number, digital_signature, purchase_date

### Orders
- id, user_id, type, items, amount, status, receipt_number, digital_signature, created_at

## 💳 Token Packages

| Package | Tokens | Bonus | Price |
|---------|--------|-------|-------|
| Starter | 100 | - | $4.99 |
| Popular | 250 | +50 | $9.99 |
| Value | 500 | +150 | $19.99 |
| Mega | 1000 | +500 | $39.99 |

## 🔐 Security Features

- **JWT Tokens** - Secure authentication
- **Password Hashing** - bcrypt with salt rounds
- **Digital Signatures** - HMAC-SHA256 for receipts
- **Rate Limiting** - Prevent abuse
- **CORS** - Configurable origins
- **Input Validation** - SQL injection prevention
- **Secure Headers** - Helmet.js middleware

## 📧 Email Receipts

Automated HTML receipts sent via Resend including:
- Receipt number
- Digital signature
- Purchase details
- Line items
- Total amount
- Cryptographic verification

## 🚢 Deployment

### Railway (Recommended)

1. **Connect Repository**
   ```bash
   railway.app → New Project → Deploy from GitHub
   → Select codeember/fightpass-backend
   ```

2. **Add Environment Variables**
   - Go to Variables tab
   - Add all `.env` variables
   - Use production credentials

3. **Deploy**
   - Railway auto-deploys on push to main
   - Get domain: `yourapp.up.railway.app`

### Manual Deployment

```bash
# Build
npm install --production

# Start
NODE_ENV=production node server.js
```

## 🧪 Testing

### Test Account
```
Email: test@fightpass.com
Password: test123
Tokens: 500
```

### Square Test Cards
```
Success: 4111 1111 1111 1111
Decline: 4000 0000 0000 0002
Insufficient: 4000 0000 0000 9995
```

### Test Endpoints
```bash
# Health check
curl https://yourapp.up.railway.app/health

# Get live events
curl https://yourapp.up.railway.app/api/v1/events/live

# Sign in
curl -X POST https://yourapp.up.railway.app/api/v1/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@fightpass.com","password":"test123"}'
```

## 📊 Monitoring

- **Railway Dashboard** - Logs, metrics, usage
- **Square Dashboard** - Transactions, disputes
- **Resend Dashboard** - Email delivery, bounces

## 🔄 Development Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
git add .
git commit -m "Add new feature"

# Push to GitHub
git push origin feature/new-feature

# Create Pull Request
# Merge to main
# Railway auto-deploys
```

## 📚 Documentation

- [Quick Start Guide](./QUICK_START.md)
- [Railway Deployment](./RAILWAY_DEPLOYMENT_GUIDE.md)
- [Square & Resend Setup](./SQUARE_RECEIPT_SETUP.md)
- [Receipt Reference](./RECEIPT_QUICK_REFERENCE.md)

## 🛠️ Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** SQLite (dev), PostgreSQL (production)
- **Auth:** JWT + bcrypt
- **Payments:** Square API
- **Email:** Resend
- **Hosting:** Railway

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📝 License

Copyright © 2024 Codember. All rights reserved.

## 📞 Support

- **Email:** support@combatsportscoverage.com
- **Phone:** 1-800-CSC-HELP
- **GitHub Issues:** [Report Issue](https://github.com/codeember/fightpass-backend/issues)

## 🎯 Roadmap

- [ ] PostgreSQL migration
- [ ] GraphQL API
- [ ] Websocket support for live updates
- [ ] Analytics dashboard
- [ ] Refund system
- [ ] Multi-currency support
- [ ] Video CDN integration
- [ ] Advanced fraud detection

---

**Built with ❤️ by Codember**

**Organization:** [@codeember](https://github.com/codeember)  
**Maintainer:** [@hicodeember](https://github.com/hicodeember)
