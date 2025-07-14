const mongoose = require('mongoose');

const repairTicketSchema = new mongoose.Schema({
    ticketId: {
        type: String,
        unique: true,
        required: true
    },
    customerName: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true,
        uppercase: true // Add uppercase transform for customer name
    },
    designation: {
        type: String,
        required: [true, 'Designation is required'],
        trim: true,
        uppercase: true,
        match: [/^[A-Z\s]+$/, 'Please enter a valid designation (CAPITAL LETTERS only)']
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        trim: true
    },
    deviceType: {
        type: String,
        required: [true, 'Device type is required'],
        enum: {
            values: ['laptop', 'desktop', 'phone', 'tablet', 'other'],
            message: '{VALUE} is not a supported device type'
        },
        lowercase: true
    },
    problemDescription: {
        type: String,
        required: [true, 'Problem description is required'],
        trim: true,
        uppercase: true // Add uppercase transform
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'cancelled'],
        default: 'pending',
        lowercase: true
    },
    autoDeleteDate: {
        type: Date,
        default: () => new Date(+new Date() + 60 * 24 * 60 * 60 * 1000) // 60 days from now
    }
}, { 
    timestamps: true 
});

// Generate ticket ID before validation
repairTicketSchema.pre('validate', function(next) {
    if (!this.ticketId) {
        const date = new Date();
        const year = date.getFullYear().toString().substr(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        this.ticketId = `RT${year}${month}-${random}`;
    }
    next();
});

module.exports = mongoose.model('RepairTicket', repairTicketSchema);