require('dotenv').config({ path: __dirname + '/.env' });
const mongoose = require('mongoose');
const User = require('./models/User');
const connectDB = require('./config/db');

const seedSuperAdmin = async () => {
  try {
    await connectDB();

    const email = 'superadmin@hireiq.app';
    const existing = await User.findOne({ email });

    if (existing) {
      console.log('Super Admin already exists.');
    } else {
      await User.create({
        name: 'System Admin',
        email,
        password: 'SuperAdmin123!',
        role: 'superadmin',
        status: 'active'
      });
      console.log(`Super Admin created! Email: ${email}, Password: SuperAdmin123!`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error seeding super admin:', error);
    process.exit(1);
  }
};

seedSuperAdmin();
