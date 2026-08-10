"use strict";

(function ($) {
    
    /**
     * Popup Service - Handles server-side popup fetching
     */
    class LinkWhisperPopupService {
        constructor() {
            // No client-side cache needed
        }

        async fetchPopups(pageSlug) {
            try {
                const response = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: window.wpil_ajax.ajax_url,
                        data: {
                            action: 'wpil_load_popups',
                            nonce: window.wpil_ajax.popup_nonce,
                            page_slug: pageSlug
                        },
                        success: function(response) {
                            resolve(response);
                        },
                        error: function(xhr, status, error) {
                            reject(new Error(`AJAX error: ${status} - ${error}`));
                        }
                    });
                });

                if (!response.success) {
                    throw new Error(response.data || 'Failed to fetch popups');
                }

                return response.data;

            } catch (error) {
                console.error('LinkWhisper Popups: Failed to fetch popups', error);
                return { popups: [] };
            }
        }

        async dismissPopup(popupId) {
            try {
                const response = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: window.wpil_ajax.ajax_url,
                        data: {
                            action: 'wpil_dismiss_popup',
                            nonce: window.wpil_ajax.dismiss_popup_nonce,
                            popup_id: popupId
                        },
                        success: function(response) {
                            resolve(response);
                        },
                        error: function(xhr, status, error) {
                            reject(new Error(`AJAX error: ${status} - ${error}`));
                        }
                    });
                });

                if (!response.success) {
                    throw new Error(response.data || 'Failed to dismiss popup');
                }

                return true;

            } catch (error) {
                console.error('LinkWhisper Popups: Failed to dismiss popup', error);
                return false;
            }
        }
    }

    /**
     * Popup UI Manager - Handles rendering and user interactions
     */
    class LinkWhisperPopupUI {
        constructor(popupService) {
            this.popupService = popupService;
            this.currentPopup = null;
            this.autoDismissTimeout = null;
        }

        async initializePage(pageSlug) {
            const response = await this.popupService.fetchPopups(pageSlug);
            
            if (response.popups && response.popups.length > 0) {
                // Show the first (and only) popup for this page
                this.showPopup(response.popups[0]);
            }
        }

        showPopup(popup) {
            this.currentPopup = popup;

            // Remove any existing popup
            this.hidePopup();

            // Log popup impression event
            if (window.wpilTelemetry) {
                window.wpilTelemetry.logPopupNotificationImpression(
                    popup.id,
                    popup.priority || null,
                    popup.display_frequency || null
                );
            }

            // Create popup overlay
            const overlay = document.createElement('div');
            overlay.id = 'linkwhisper-popup-overlay';
            overlay.className = 'linkwhisper-popup-overlay';

            // Create popup container
            const container = document.createElement('div');
            container.id = 'linkwhisper-popup-container';
            container.className = 'linkwhisper-popup-container';

            // Build popup HTML
            container.innerHTML = `
                <div class="popup-content">
                    ${popup.image ? `<div class="popup-image">
                        <img src="${this.escapeHtml(popup.image)}" alt="${this.escapeHtml(popup.title)}" />
                    </div>` : ''}
                    <div class="popup-body">
                        <h3 class="popup-title">${this.escapeHtml(popup.title)}</h3>
                        <p class="popup-description">${this.escapeHtml(popup.description)}</p>
                        <div class="popup-actions">
                            ${popup.action_url ? `<a href="${this.escapeHtml(popup.action_url)}" class="popup-action-button" data-action="navigate">Check it out</a>` : ''}
                            <button class="popup-dismiss-button" data-action="dismiss">Dismiss</button>
                        </div>
                    </div>
                    <button class="popup-close" data-action="dismiss" aria-label="Close">×</button>
                </div>
            `;

            // Add event listeners
            container.addEventListener('click', (e) => {
                const action = e.target.dataset.action;

                if (action === 'dismiss') {
                    // Log dismiss event
                    if (window.wpilTelemetry) {
                        window.wpilTelemetry.logPopupNotificationDismissed(
                            popup.id,
                            'user_action'
                        );
                    }
                    this.dismissPopup();
                } else if (action === 'navigate' && popup.action_url) {
                    // Log CTA click event
                    if (window.wpilTelemetry) {
                        window.wpilTelemetry.logPopupNotificationCtaClicked(
                            popup.id,
                            e.target.textContent || 'Open'
                        );
                    }
                    // Navigate to action URL and dismiss
                    window.location.href = popup.action_url;
                    this.dismissPopup();
                }
            });

            // Add escape key listener
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    // Log dismiss via escape key
                    if (window.wpilTelemetry) {
                        window.wpilTelemetry.logPopupNotificationDismissed(
                            popup.id,
                            'escape_key'
                        );
                    }
                    this.dismissPopup();
                    document.removeEventListener('keydown', escapeHandler);
                }
            };
            document.addEventListener('keydown', escapeHandler);

            // Make clicking on the overlay hide the popup
            overlay.addEventListener('click', (e) => {
                this.dismissPopup();

                if (e.target === overlay) {
                    // Could add shake animation here if desired // neat idea, maybe something to think about.
                }
            });

            // Append to page
            overlay.appendChild(container);
            document.body.appendChild(overlay);

            // Trigger show animation
            requestAnimationFrame(() => {
                overlay.classList.add('show');
            });

            // Set up auto-dismiss if specified
            if (popup.auto_dismiss_seconds && popup.auto_dismiss_seconds > 0) {
                this.autoDismissTimeout = setTimeout(() => {
                    // Log auto-dismiss event
                    if (window.wpilTelemetry) {
                        window.wpilTelemetry.logPopupNotificationAutoDismissed(
                            popup.id,
                            popup.auto_dismiss_seconds
                        );
                    }
                    this.dismissPopup();
                }, popup.auto_dismiss_seconds * 1000);
            }

            // Debug logging
            if (window.wpil_ajax && window.wpil_ajax.debug) {
                console.log('LinkWhisper Popup: Showing popup', popup);
            }
        }

        async dismissPopup() {
            if (!this.currentPopup) return;

            // Clear auto-dismiss timeout
            if (this.autoDismissTimeout) {
                clearTimeout(this.autoDismissTimeout);
                this.autoDismissTimeout = null;
            }

            // Send dismiss request to server
            await this.popupService.dismissPopup(this.currentPopup.id);

            // Remove popup from DOM
            this.hidePopup();

            this.currentPopup = null;

            // Debug logging
            if (window.wpil_ajax && window.wpil_ajax.debug) {
                console.log('LinkWhisper Popup: Popup dismissed');
            }
        }

        hidePopup() {
            const overlay = document.getElementById('linkwhisper-popup-overlay');
            if (overlay) {
                overlay.classList.add('hide');
                setTimeout(() => {
                    overlay.remove();
                }, 300); // Match CSS transition duration
            }
        }

        escapeHtml(text) {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // Initialize popups when document is ready
    $(document).ready(function() {
        // Only initialize on LinkWhisper admin pages
        if (!window.wpil_ajax || !window.wpil_ajax.current_page) return;

        // Create popup instances
        const popupService = new LinkWhisperPopupService();
        const popupUI = new LinkWhisperPopupUI(popupService);

        // Get current page
        const currentPage = window.wpil_ajax.current_page;

        // Initialize popups for current page
        popupUI.initializePage(currentPage);

        // Debug logging
        if (window.wpil_ajax.debug) {
            console.log('LinkWhisper Popups: Initialized for page:', currentPage);
        }
    });

})(jQuery);