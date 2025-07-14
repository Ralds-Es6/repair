const express = require('express');
const router = express.Router();
const RepairTicket = require('../models/RepairTicket');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// Create rate limiter
const repairSubmissionLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 10, // limit each IP to 10 submissions per windowMs
    handler: (req, res) => {
        // Render the form with error that will trigger the modal
        return res.render('user/submit-repair', {
            error: 'Too many repair submissions. Please try again after 30 minutes.',
            formData: req.body
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Home page with repair submission form
router.get('/', (req, res) => {
    res.render('user/submit-repair');
});

// Submit repair ticket - with rate limiter
router.post('/submit-repair', repairSubmissionLimiter, async (req, res) => {
    console.log('=== Starting ticket submission ===');
    console.log('Request body:', req.body);
    
    try {
        const { customerName, designation, phone, deviceType, problemDescription } = req.body;
        
        console.log('Extracted form data:', {
            customerName,
            designation: designation.toUpperCase(),
            phone,
            deviceType,
            problemDescription
        });

        // Create new ticket instance
        console.log('Creating ticket instance...');
        const ticket = new RepairTicket({
            customerName,
            designation: designation.toUpperCase(),
            phone,
            deviceType: deviceType ? deviceType.toLowerCase() : undefined,
            problemDescription
        });

        console.log('Created ticket instance:', ticket);

        // Save the ticket
        console.log('Attempting to save ticket...');
        const savedTicket = await ticket.save();
        console.log('Ticket saved successfully:', savedTicket);

        // Verify ticket ID generation
        if (!savedTicket.ticketId) {
            console.error('Ticket saved but no ticketId generated');
            throw new Error('Failed to generate ticket ID');
        }

        console.log('Rendering success page with ticketId:', savedTicket.ticketId);
        return res.render('user/success', { 
            ticketId: savedTicket.ticketId
        });
    } catch (error) {
        console.error('Error in submit-repair:', error);
        console.error('Error stack:', error.stack);
        
        let errorMessage = 'Error submitting repair ticket';
        
        // Handle different types of errors
        if (error instanceof mongoose.Error.ValidationError) {
            errorMessage = Object.values(error.errors)
                .map(err => err.message)
                .join(', ');
        } else if (error.code === 11000) {
            errorMessage = 'A ticket with this ID already exists';
        }

        console.log('Rendering form with error:', errorMessage);
        return res.render('user/submit-repair', {
            error: errorMessage,
            formData: req.body
        });
    }
});

// Track ticket page
router.get('/track', (req, res) => {
    res.render('user/track');
});

// Track ticket status
router.post('/track', async (req, res) => {
    try {
        const { ticketId } = req.body;
        const ticket = await RepairTicket.findOne({ ticketId });
        if (!ticket) {
            return res.render('user/track', { error: 'Ticket not found' });
        }
        res.render('user/ticket-status', { ticket });
    } catch (error) {
        console.error('Error in track:', error);
        res.render('user/track', { error: 'Error tracking ticket' });
    }
});

module.exports = router;