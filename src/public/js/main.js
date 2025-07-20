document.addEventListener('DOMContentLoaded', function() {
    // Form validation
    const forms = document.querySelectorAll('.needs-validation');
    forms.forEach(form => {
        form.addEventListener('submit', function(event) {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        });
    });

    // Phone number formatting
    const phoneInput = document.querySelector('input[name="phone"]');
    if (phoneInput) {
        phoneInput.addEventListener('input', function(e) {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }

    // Animate cards on page load
    const cards = document.querySelectorAll('.card');
    cards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 * index);
    });

    // Status change handling in admin dashboard
    const statusSelects = document.querySelectorAll('select[name="status"]');
    statusSelects.forEach(select => {
        select.addEventListener('change', function() {
            this.form.submit();
        });
    });

    // Auto-dismiss alerts after 5 seconds
    const alerts = document.querySelectorAll('.alert:not(.alert-permanent)');
    alerts.forEach(alert => {
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => alert.remove(), 500);
        }, 5000);
    });

    // Handle delete button loading state
    document.querySelectorAll('form[action*="/delete"]').forEach(form => {
        form.addEventListener('submit', function() {
            if (this.checkValidity()) {
                const submitBtn = this.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Deleting...';
                }
            }
        });
    });

    // PDF Preview Enhancement
    // (Removed modal logic for preview links; let them open in a new tab)
    // No JS needed for preview links with target="_blank"

    // Signature Display Enhancement
    const signatureImages = document.querySelectorAll('.signature-image');
    signatureImages.forEach(img => {
        img.addEventListener('error', function() {
            this.style.display = 'none';
            const status = this.parentElement.querySelector('.signature-status');
            if (status) {
                status.textContent = 'Signature not available';
                status.style.color = '#dc3545';
            }
        });

        img.addEventListener('load', function() {
            const status = this.parentElement.querySelector('.signature-status');
            if (status) {
                status.textContent = 'Signature loaded successfully';
                status.style.color = '#28a745';
            }
        });
    });

    // Enhanced PDF download with progress
    const pdfDownloadLinks = document.querySelectorAll('a[href*="/print/"]:not([href*="preview"])');
    pdfDownloadLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i>Generating PDF...';
            this.style.pointerEvents = 'none';

            // Reset after a delay to allow download to start
            setTimeout(() => {
                this.innerHTML = originalText;
                this.style.pointerEvents = 'auto';
            }, 3000);
        });
    });

    // Close PDF preview when clicking outside
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('pdf-preview-container')) {
            e.target.remove();
        }
    });

    // Keyboard shortcut to close PDF preview (ESC key)
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const previewContainer = document.querySelector('.pdf-preview-container');
            if (previewContainer) {
                previewContainer.remove();
            }
        }
    });
});