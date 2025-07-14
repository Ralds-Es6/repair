const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const RepairTicket = require('./models/RepairTicket');
require('dotenv').config();

const app = express();

// Database environment detection and connection
const getDatabaseUri = () => {
  const environment = process.env.DB_ENVIRONMENT || 'local';
  
  if (environment === 'atlas') {
    console.log('🌐 Connecting to MongoDB Atlas...');
    return process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
  } else {
    console.log('🏠 Connecting to Local MongoDB...');
    return process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/repair_system';
  }
};

const mongoUri = getDatabaseUri();
console.log(`📊 Database Environment: ${process.env.DB_ENVIRONMENT || 'local'}`);
console.log(`🔗 Connection URI: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials in logs

// Database connection
mongoose.connect(mongoUri)
  .then(() => console.log('✅ Connected to MongoDB successfully'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Enhanced auto-delete check function with logging
const checkAutoDelete = async () => {
  try {
    console.log('Running auto-delete check...');
    const now = new Date();
    const ticketsToDelete = await RepairTicket.find({
      autoDeleteDate: { $lte: now }
    });

    if (ticketsToDelete.length > 0) {
      console.log(`Found ${ticketsToDelete.length} tickets ready for deletion:`);
      ticketsToDelete.forEach(ticket => {
        console.log(`- Ticket ${ticket.ticketId}: scheduled for ${ticket.autoDeleteDate}`);
      });
      
      // Don't auto-delete, just notify admin through the dashboard
      console.log('Tickets will be shown in admin dashboard for review');
    } else {
      console.log('No tickets found for deletion');
    }
  } catch (error) {
    console.error('Auto-delete check error:', error);
  }
};

// Run initial check on startup
checkAutoDelete();

// Schedule regular checks
setInterval(checkAutoDelete, 24 * 60 * 60 * 1000); // Run check once per day

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Express EJS Layouts setup
app.use(expressLayouts);
app.set('layout', 'layout');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: mongoUri
  }),
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Routes
const adminRoutes = require('./routes/admin');
const userRoutes = require('./routes/user');

app.use('/admin', adminRoutes);
app.use('/', userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});