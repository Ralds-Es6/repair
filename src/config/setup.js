const mongoose = require('mongoose');
const Admin = require('../models/Admin');
require('dotenv').config();

// Database environment detection and connection
const getDatabaseUri = () => {
  const environment = process.env.DB_ENVIRONMENT || 'local';
  
  if (environment === 'atlas') {
    console.log('🌐 Connecting to MongoDB Atlas for setup...');
    return process.env.MONGODB_ATLAS_URI || process.env.MONGODB_URI;
  } else {
    console.log('🏠 Connecting to Local MongoDB for setup...');
    return process.env.MONGODB_LOCAL_URI || 'mongodb://localhost:27017/repair_system';
  }
};

const createAdminUser = async () => {
    try {
        const mongoUri = getDatabaseUri();
        console.log(`📊Setup Database Environment: ${process.env.DB_ENVIRONMENT || 'local'}`);
        await mongoose.connect(mongoUri);
        
        const adminExists = await Admin.findOne({ username: 'admin' });
        
        if (!adminExists) {
            const admin = new Admin({
                username: 'admin',
                password: '@rovee bayut bakla 150 ang offer' // This will be hashed automatically by the schema
            });
            
            await admin.save();
            console.log('Admin user created successfully');
        } else {
            console.log('Admin user already exists');
        }
        
    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await mongoose.connection.close();
    }
};

createAdminUser();