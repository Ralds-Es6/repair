const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const RepairTicket = require('../models/RepairTicket');
const rateLimit = require('express-rate-limit');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');
const mongoose = require('mongoose');

// Function to load and embed signature
async function embedSignature(pdfDoc) {
    try {
        const signatureImagePath = path.join(__dirname, '..', 'public', 'images', 'signature.png');
        console.log('[Signature Debug] Attempting to load signature from:', signatureImagePath);
        
        const imageBytes = await fs.readFile(signatureImagePath);
        console.log('[Signature Debug] Successfully loaded signature file, size:', imageBytes.length, 'bytes');
        
        if (imageBytes.length === 0) {
            throw new Error('Signature image file is empty');
        }
        
        const image = await pdfDoc.embedPng(imageBytes);
        console.log('[Signature Debug] Successfully embedded signature in PDF');
        
        const dimensions = image.scale(80);
        console.log('[Signature Debug] Signature dimensions:', dimensions);
        
        return image;
    } catch (error) {
        console.error('[Signature Error]:', error);
        console.error('[Signature Error] Stack:', error.stack);
        throw error;
    }
}

// Function to draw signature image
function drawSignatureImage(page, image, x, y, width = 80) {
    try {
        if (!image) {
            console.error('[Signature Error] No image provided to drawSignatureImage');
            return;
        }
        
        console.log('[Signature Debug] Drawing signature at position:', { x, y, width });
        const { height } = image.scale(width);
        const maxHeight = 30;
        let finalWidth = width;
        let finalHeight = height;
        
        if (height > maxHeight) {
            const scale = maxHeight / height;
            finalWidth = width * scale;
            finalHeight = maxHeight;
        }
        
        // Position signature above the line with proper spacing
        const adjustedY = y + 5;  // Small gap between signature and line
        
        console.log('[Signature Debug] Final dimensions:', {
            width: finalWidth,
            height: finalHeight,
            adjustedY,
            originalY: y
        });
        
        page.drawImage(image, {
            x,
            y: adjustedY,
            width: finalWidth,
            height: finalHeight
        });
        
        console.log('[Signature Debug] Signature drawn successfully');
    } catch (error) {
        console.error('[Signature Error] Failed to draw signature:', error);
        console.error('[Signature Error] Stack:', error.stack);
        throw error;
    }
}

// Create rate limiter
const adminSubmissionLimiter = rateLimit({
    windowMs: 30 * 60 * 1000, // 30 minutes
    max: 3, // limit each IP to 3 submissions per windowMs
    handler: (req, res) => {
        // Render the form with error that will trigger the modal
        return res.render('login', {
            error: 'Too many login attempts. Please try again after 30 minutes.',
            formData: req.body
        });
    },
    standardHeaders: true,
    legacyHeaders: false
});








// Middleware to check if admin is logged in
const isAuthenticated = (req, res, next) => {
  if (req.session.adminId) {
    next();
  } else {
    res.redirect('/admin/login');
  }
};

// Admin login page
router.get('/login', (req, res) => {
  res.render('admin/login');
});

// Admin login process
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    
    if (!admin || !(await admin.comparePassword(password))) {
      return res.render('admin/login', { error: 'Invalid credentials' });
    }

    req.session.adminId = admin._id;
    res.redirect('/admin/dashboard');
  } catch (error) {
    res.render('admin/login', { error: 'An error occurred' });
  }
});

// Admin dashboard
router.get('/dashboard', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search || '';

    // Build filter query
    let query = {};
    if (status && status !== 'all') {  // Only add status filter if it's not 'all'
      query.status = status;
    }
    if (search) {
      query.$or = [
        { ticketId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
        { deviceType: { $regex: search, $options: 'i' } },
        { problemDescription: { $regex: search, $options: 'i' } }
      ];
    }

    // Get tickets that need deletion
    const ticketsToDelete = await RepairTicket.find({
      autoDeleteDate: { $lte: new Date() }
    });

    // Get all data in parallel
    const [
      totalTickets,
      tickets,
      statusCounts
    ] = await Promise.all([
      RepairTicket.countDocuments(query),
      RepairTicket.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      RepairTicket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);

    // Convert status counts to an object with default values
    const counts = {
      pending: 0,
      'in-progress': 0,
      completed: 0,
      cancelled: 0
    };
    statusCounts.forEach(({ _id, count }) => {
      if (_id) counts[_id] = count;
    });

    res.render('admin/dashboard', { 
      tickets,
      currentPage: page,
      totalPages: Math.ceil(totalTickets / limit),
      totalTickets,
      currentStatus: status || 'all',
      currentSearch: search,
      statusCounts: counts,
      showAutoDeleteModal: ticketsToDelete.length > 0,
      ticketsToDelete
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.render('admin/dashboard', { 
      error: 'Could not fetch tickets', 
      tickets: [],
      currentPage: 1,
      totalPages: 1,
      totalTickets: 0,
      currentStatus: 'all',
      currentSearch: '',
      statusCounts: {
        pending: 0,
        'in-progress': 0,
        completed: 0,
        cancelled: 0
      },
      showAutoDeleteModal: false,
      ticketsToDelete: []
    });
  }
});

// Update ticket status
router.post('/ticket/:id/update', isAuthenticated, async (req, res) => {
    try {
        const { newStatus, page, search, status: currentStatus } = req.body;
        await RepairTicket.findByIdAndUpdate(req.params.id, { status: newStatus });
        
        // Build redirect URL with query parameters
        let redirectUrl = '/admin/dashboard';
        const params = new URLSearchParams();
        
        if (page) params.set('page', page);
        if (search) params.set('search', search);
        if (currentStatus && currentStatus !== 'all') params.set('status', currentStatus);
        
        const queryString = params.toString();
        if (queryString) {
            redirectUrl += `?${queryString}`;
        }
        
        res.redirect(redirectUrl);
    } catch (error) {
        console.error('Status update error:', error);
        res.redirect('/admin/dashboard');
    }
});

// Delete ticket
router.post('/ticket/:id/delete', isAuthenticated, async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid ticket ID' });
        }

        const ticket = await RepairTicket.findById(id);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }

        await RepairTicket.findByIdAndDelete(id);
        
        // Redirect back to the dashboard with the current filters
        const redirectUrl = new URL('/admin/dashboard', 'https://repair-j8li.onrender.com/');
        if (req.query.page) redirectUrl.searchParams.set('page', req.query.page);
        if (req.query.status) redirectUrl.searchParams.set('status', req.query.status);
        if (req.query.search) redirectUrl.searchParams.set('search', req.query.search);
        
        return res.redirect(redirectUrl.pathname + redirectUrl.search);
    } catch (error) {
        console.error('Error deleting ticket:', error);
        return res.status(500).json({ error: 'Failed to delete ticket' });
    }
});

// Auto-delete old tickets (called by cron job)
router.post('/cleanup', async (req, res) => {
    try {
        const { confirmed } = req.body;
        
        if (!confirmed) {
            // If not confirmed, just return the tickets that would be deleted
            const ticketsToDelete = await RepairTicket.find({
                autoDeleteDate: { $lte: new Date() }
            });
            return res.json({ 
                requiresConfirmation: true,
                tickets: ticketsToDelete.map(t => ({
                    id: t.ticketId,
                    date: t.autoDeleteDate
                }))
            });
        }

        // If confirmed, proceed with deletion
        const result = await RepairTicket.deleteMany({
            autoDeleteDate: { $lte: new Date() }
        });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

// AJAX search endpoint
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const status = req.query.status || 'all';
    const search = req.query.search || '';
    // Build filter query
    let query = {};
    if (status !== 'all') {
      query.status = status;
    }
    if (search) {
      query.$or = [
        { ticketId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { designation: { $regex: search, $options: 'i' } },
        { deviceType: { $regex: search, $options: 'i' } },
        { problemDescription: { $regex: search, $options: 'i' } }
      ];
    }
    const tickets = await RepairTicket.find(query)
      .sort({ createdAt: -1 })
      .limit(10);
    res.json({ success: true, tickets });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
});

// Bulk delete tickets
router.post('/tickets/bulk-delete', isAuthenticated, async (req, res) => {    try {        const { ticketIds } = req.body;        if (!ticketIds || !Array.isArray(ticketIds)) {            return res.status(400).json({ error: 'Invalid ticket IDs provided' });        }        await RepairTicket.deleteMany({ _id: { $in: ticketIds } });                req.flash('success', `Successfully deleted ${ticketIds.length} tickets`);        res.json({ success: true });    } catch (error) {        console.error('Bulk delete error:', error);        res.status(500).json({ error: 'Failed to delete tickets' });    }});

// Generate PDF for single ticket
router.get('/print/:id', isAuthenticated, async (req, res) => {
    try {
        const ticket = await RepairTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).send('Ticket not found');
        }

        const pdfDoc = await PDFDocument.create();
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Colors
        const primary = rgb(0.17, 0.24, 0.31);   // #2c3e50
        const headerBg = rgb(0.95, 0.95, 0.95);  // #f2f2f2
        const borderColor = rgb(0.8, 0.8, 0.8);  // #cccccc
        const alternateBg = rgb(0.98, 0.98, 0.98); // #fafafa

        const page = pdfDoc.addPage([800, 1100]);
        const { width, height } = page.getSize();

        // Add header
        page.drawRectangle({
            x: 0,
            y: height - 60,
            width: width,
            height: 60,
            color: headerBg
        });

        page.drawText('REPAIR TICKET DETAILS', {
            x: 50,
            y: height - 40,
            size: 16,
            font: helveticaBold,
            color: primary
        });

        const printDate = new Date().toLocaleString();
        page.drawText(`Printed on: ${printDate}`, {
            x: width - 250,
            y: height - 40,
            size: 10,
            font: helvetica,
            color: primary
        });

        // Add footer with expanded height for signature and date
        page.drawRectangle({
            x: 0,
            y: 0,
            width: width,
            height: 80,
            color: headerBg
        });

        // Add signature line in footer (left side)
        page.drawLine({
            start: { x: 50, y: 55 },
            end: { x: 300, y: 55 },
            thickness: 1,
            color: primary
        });
        page.drawText('Head Office Signature:', {
            x: 50,
            y: 40,
            size: 8,
            font: helvetica,
            color: primary
        });

        // Embed and draw signature image
        const signatureImage = await embedSignature(pdfDoc);
        drawSignatureImage(page, signatureImage, 50, 55, 80); // Using consistent width of 80

        // Add date/time line (right side)
        page.drawLine({
            start: { x: width - 300, y: 55 },
            end: { x: width - 50, y: 55 },
            thickness: 1,
            color: primary
        });
        page.drawText('Client Signature:', {
            x: width - 300,
            y: 40,
            size: 8,
            font: helvetica,
            color: primary
        });

        // Add page numbers at the bottom center
        page.drawText('Page 1 of 1', {
            x: width / 2 - 40,
            y: 10,
            size: 10,
            font: helvetica,
            color: primary
        });

        // Excel-like table
        const startY = height - 100;
        const rowHeight = 30;
        const colWidth = (width - 100) / 2;

        // Function to draw table row
        const drawRow = (label, value, rowIndex, highlight = false) => {
            const y = startY - (rowIndex * rowHeight);
            
            // Background
            page.drawRectangle({
                x: 50,
                y: y - rowHeight,
                width: colWidth,
                height: rowHeight,
                color: highlight ? headerBg : (rowIndex % 2 === 0 ? alternateBg : rgb(1, 1, 1)),
                borderColor,
                borderWidth: 1,
            });
            
            page.drawRectangle({
                x: 50 + colWidth,
                y: y - rowHeight,
                width: colWidth,
                height: rowHeight,
                color: highlight ? headerBg : (rowIndex % 2 === 0 ? alternateBg : rgb(1, 1, 1)),
                borderColor,
                borderWidth: 1,
            });

            // Text
            page.drawText(label, {
                x: 60,
                y: y - rowHeight + 10,
                size: 10,
                font: highlight ? helveticaBold : helvetica,
                color: primary
            });

            const valueText = value.toString();
            page.drawText(valueText, {
                x: 60 + colWidth,
                y: y - rowHeight + 10,
                size: 10,
                font: helvetica,
                color: primary
            });
        };

        // Draw table headers
        drawRow('Field', 'Value', 0, true);

        // Table data
        const data = [
            ['Ticket ID', ticket.ticketId],
            ['Status', ticket.status.toUpperCase()],
            ['Submission Date', new Date(ticket.createdAt).toLocaleString()],
            ['Customer Name', ticket.customerName],
            ['Designation', ticket.designation],
            ['Phone', ticket.phone],
            ['Device Type', ticket.deviceType.charAt(0).toUpperCase() + ticket.deviceType.slice(1)],
            ['Problem Description', ticket.problemDescription]
        ];

        data.forEach((row, index) => {
            drawRow(row[0], row[1], index + 1);
        });

        const pdfBytes = await pdfDoc.save();
        
        // Check if preview is requested
        if (req.query.preview === 'true') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
        } else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=ticket-${ticket.ticketId}.pdf`);
        }
        res.send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).send('Error generating PDF');
    }
});

// Preview PDF for single ticket (inline display)
router.get('/preview/:id', isAuthenticated, async (req, res) => {
    try {
        const ticket = await RepairTicket.findById(req.params.id);
        if (!ticket) {
            return res.status(404).send('Ticket not found');
        }

        // Redirect to print route with preview parameter
        res.redirect(`/admin/print/${req.params.id}?preview=true`);
    } catch (error) {
        console.error('PDF preview error:', error);
        res.status(500).send('Error generating PDF preview');
    }
});

// Generate PDF for all tickets
router.get('/print-all', isAuthenticated, async (req, res) => {
    try {
        const tickets = await RepairTicket.find().sort({ createdAt: -1 });
        const pdfDoc = await PDFDocument.create();
        const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const signatureImage = await embedSignature(pdfDoc); // Embed signature once for all pages

        // Colors
        const primary = rgb(0.17, 0.24, 0.31);   // #2c3e50
        const headerBg = rgb(0.95, 0.95, 0.95);  // #f2f2f2
        const borderColor = rgb(0.8, 0.8, 0.8);  // #cccccc

        // Calculate how many items fit per page
        const rowHeight = 30;
        const headerHeight = 60;
        const footerHeight = 80; // Increased to accommodate signature
        const pageMargins = 100;
        const contentHeight = 1100 - headerHeight - footerHeight - pageMargins;
        const rowsPerPage = Math.floor(contentHeight / rowHeight);
        const totalPages = Math.ceil(tickets.length / rowsPerPage);

        // Function to add header and footer to a page
        const addHeaderAndFooter = async (page, pageNumber, totalPages, signatureImage) => {
            const { width, height } = page.getSize();
            
            // Add header
            page.drawRectangle({
                x: 0,
                y: height - 60,
                width: width,
                height: 60,
                color: headerBg
            });

            page.drawText('REPAIR TICKETS REPORT', {
                x: 50,
                y: height - 40,
                size: 16,
                font: helveticaBold,
                color: primary
            });

            const printDate = new Date().toLocaleString();
            page.drawText(`Printed on: ${printDate}`, {
                x: width - 250,
                y: height - 40,
                size: 10,
                font: helvetica,
                color: primary
            });

            // Add footer with expanded height for signature and date
            page.drawRectangle({
                x: 0,
                y: 0,
                width: width,
                height: 80,
                color: headerBg
            });

            // Add signature line in footer (left side)
            page.drawLine({
                start: { x: 50, y: 55 },
                end: { x: 300, y: 55 },
                thickness: 1,
                color: primary
            });
            page.drawText('Head Office Signature:', {
                x: 50,
                y: 40,
                size: 8,
                font: helvetica,
                color: primary
            });

            // Draw signature image
            if (signatureImage) {
                drawSignatureImage(page, signatureImage, 50, 55, 100);
            }

            // Add date/time line (right side)
            page.drawLine({
                start: { x: width - 300, y: 55 },
                end: { x: width - 50, y: 55 },
                thickness: 1,
                color: primary
            });
            page.drawText('Client Signature:', {
                x: width - 300,
                y: 40,
                size: 8,
                font: helvetica,
                color: primary
            });

            // Add page numbers at the bottom center
            page.drawText(`Page ${pageNumber} of ${totalPages}`, {
                x: width / 2 - 40,
                y: 10,
                size: 10,
                font: helvetica,
                color: primary
            });
        };

        // Process tickets in chunks for each page
        for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
            const page = pdfDoc.addPage([800, 1100]);
            const startY = page.getHeight() - headerHeight - 40;
            const ticketsForPage = tickets.slice(pageIndex * rowsPerPage, (pageIndex + 1) * rowsPerPage);
            
            // Add header and footer with signature
            await addHeaderAndFooter(page, pageIndex + 1, totalPages, signatureImage);

            // Draw table headers
            const headers = ['Ticket ID', 'Customer', 'Device', 'Status', 'Submission Date/Time'];
            const colWidth = (page.getWidth() - 100) / headers.length;

            page.drawRectangle({
                x: 50,
                y: startY - rowHeight,
                width: page.getWidth() - 100,
                height: rowHeight,
                color: headerBg,
                borderColor,
                borderWidth: 1,
            });

            headers.forEach((header, index) => {
                page.drawText(header, {
                    x: 60 + (colWidth * index),
                    y: startY - rowHeight + 10,
                    size: 10,
                    font: helveticaBold,
                    color: primary
                });
            });

            // Draw table rows for current page
            let currentY = startY - rowHeight;
            ticketsForPage.forEach((ticket, index) => {
                // Row background
                page.drawRectangle({
                    x: 50,
                    y: currentY - rowHeight,
                    width: page.getWidth() - 100,
                    height: rowHeight,
                    color: index % 2 === 0 ? rgb(0.98, 0.98, 0.98) : rgb(1, 1, 1),
                    borderColor,
                    borderWidth: 1,
                });

                // Row data
                const rowData = [
                    ticket.ticketId,
                    ticket.customerName,
                    ticket.deviceType.charAt(0).toUpperCase() + ticket.deviceType.slice(1),
                    ticket.status.toUpperCase(),
                    new Date(ticket.createdAt).toLocaleString()
                ];

                rowData.forEach((text, colIndex) => {
                    page.drawText(text.toString(), {
                        x: 60 + (colWidth * colIndex),
                        y: currentY - rowHeight + 10,
                        size: 10,
                        font: helvetica,
                        color: primary
                    });
                });

                currentY -= rowHeight;
            });
        }

        const pdfBytes = await pdfDoc.save();
        
        // Check if preview is requested
        if (req.query.preview === 'true') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'inline');
        } else {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=all-tickets.pdf');
        }
        res.send(Buffer.from(pdfBytes));
    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).send('Error generating PDF');
    }
});

// Preview PDF for all tickets (inline display)
router.get('/preview-all', isAuthenticated, async (req, res) => {
    try {
        // Redirect to print-all route with preview parameter
        res.redirect('/admin/print-all?preview=true');
    } catch (error) {
        console.error('PDF preview error:', error);
        res.status(500).send('Error generating PDF preview');
    }
});

// Test signature functionality
router.get('/test-signature', isAuthenticated, async (req, res) => {
    try {
        const pdfDoc = await PDFDocument.create();
        const signatureImage = await embedSignature(pdfDoc);
        
        if (signatureImage) {
            res.json({ 
                success: true, 
                message: 'Signature loaded successfully',
                signatureDimensions: signatureImage.scale(80)
            });
        } else {
            res.json({ 
                success: false, 
                message: 'Failed to load signature' 
            });
        }
    } catch (error) {
        console.error('Signature test error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error testing signature',
            error: error.message 
        });
    }
});

module.exports = router;
