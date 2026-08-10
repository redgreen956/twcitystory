/**
 * LinkWhisper Telemetry Service
 * Handles logging of user interactions for analytics
 */

class WpilTelemetryLogger {
    constructor() {
        this.nonce = wpil_ajax?.nonce || '';
        this.ajaxUrl = wpil_ajax?.ajax_url || '';
        this.isEnabled = wpil_ajax?.telemetry_active || '';
        this.debounceDelay = 100; // Prevent duplicate events
        this.recentEvents = new Set();
    }

    /**
     * Generic event logging method
     * @param {string} eventName - The event name to log
     * @param {object} eventData - Additional data to log with the event
     * @returns {Promise}
     */
    async logEvent(eventName, eventData = {}) {
        if (!this.isEnabled || !eventName || !this.ajaxUrl) {
            return Promise.resolve();
        }

        // Prevent duplicate events in quick succession
        const eventKey = `${eventName}_${JSON.stringify(eventData)}`;
        if (this.recentEvents.has(eventKey)) {
            return Promise.resolve();
        }

        // Add to debounce set
        this.recentEvents.add(eventKey);
        setTimeout(() => {
            this.recentEvents.delete(eventKey);
        }, this.debounceDelay);

        const data = {
            action: 'wpil_log_event',
            event_name: eventName,
            event_data: JSON.stringify(eventData),
            nonce: wpil_ajax.telemetry_nonce
        };

        return new Promise((resolve) => {
            jQuery.post(this.ajaxUrl, data)
                .done(() => {
                    console.log(`LinkWhisper Telemetry: Logged event '${eventName}'`);
                })
                .fail((xhr, status, error) => {
                    console.warn(`LinkWhisper Telemetry: Failed to log event '${eventName}':`, error);
                })
                .always(resolve);
        });
    }

    /**
     * Log notification hub events
     * @param {string} action - The action performed (loaded, notification_impression, notification_clicked)
     * @param {object} extraData - Additional data specific to the action
     */
    logNotificationHubEvent(action, extraData = {}) {
        const eventName = `notification_hub_${action}`;
        return this.logEvent(eventName, {
            timestamp: Math.round(Date.now()/1000),
            ...extraData
        });
    }

    /**
     * Log popup notification events  
     * @param {string} action - The action performed (impression, cta_clicked, dismissed, auto_dismissed)
     * @param {string|number} notificationId - The notification identifier
     * @param {object} extraData - Additional data specific to the action
     */
    logPopupNotificationEvent(action, notificationId = null, extraData = {}) {
        const eventName = `popup_notification_${action}`;
        return this.logEvent(eventName, {
            notification_id: notificationId,
            timestamp: Math.round(Date.now()/1000),
            ...extraData
        });
    }

    /**
     * Log tour events
     * @param {string} action - The action performed (started, step_viewed, completed, etc.)
     * @param {string|number} tourId - The tour identifier
     * @param {string|number} stepId - The step identifier (optional)
     * @param {object} extraData - Additional data specific to the action
     */
    logTourEvent(action, tourId = null, stepId = null, extraData = {}) {
        const eventName = `tour_${action}`;
        return this.logEvent(eventName, {
            tour_id: tourId,
            step_id: stepId,
            timestamp: Math.round(Date.now()/1000),
            ...extraData
        });
    }

    /**
     * Convenience methods for specific notification hub events
     */
    logNotificationHubLoaded(notificationCount = 0, unreadCount = 0) {
        return this.logNotificationHubEvent('loaded', {
            notification_count: notificationCount,
            unread_count: unreadCount
        });
    }

    logNotificationHubNotificationImpression(notificationId, positionInList = null) {
        return this.logNotificationHubEvent('notification_impression', {
            notification_id: notificationId,
            position_in_list: positionInList
        });
    }

    logNotificationHubNotificationClicked(notificationId) {
        return this.logNotificationHubEvent('notification_clicked', {
            notification_id: notificationId
        });
    }

    /**
     * Convenience methods for specific popup notification events
     */
    logPopupNotificationImpression(notificationId, priority = null, displayFrequency = null) {
        return this.logPopupNotificationEvent('impression', notificationId, {
            priority: priority,
            display_frequency: displayFrequency
        });
    }

    logPopupNotificationCtaClicked(notificationId, ctaText = null) {
        return this.logPopupNotificationEvent('cta_clicked', notificationId, {
            cta_text: ctaText
        });
    }

    logPopupNotificationDismissed(notificationId, dismissMethod = 'user_action') {
        return this.logPopupNotificationEvent('dismissed', notificationId, {
            dismiss_method: dismissMethod
        });
    }

    logPopupNotificationAutoDismissed(notificationId, displayDuration = null) {
        return this.logPopupNotificationEvent('auto_dismissed', notificationId, {
            display_duration: displayDuration
        });
    }

    /**
     * Convenience methods for specific tour events
     */
    logTourStarted(tourId, isAutoStart = false) {
        return this.logTourEvent('started', tourId, null, {
            auto_start: isAutoStart
        });
    }

    logTourAutoStarted(tourId) {
        return this.logTourEvent('auto_started', tourId);
    }

    logTourStepViewed(tourId, stepId, stepNumber = null, totalSteps = null) {
        return this.logTourEvent('step_viewed', tourId, stepId, {
            step_number: stepNumber,
            total_steps: totalSteps
        });
    }

    logTourStepCompleted(tourId, stepId, stepNumber = null) {
        return this.logTourEvent('step_completed', tourId, stepId, {
            step_number: stepNumber
        });
    }

    logTourNavigationClicked(tourId, stepId, action = null) {
        return this.logTourEvent('navigation_clicked', tourId, stepId, {
            navigation_action: action // 'next', 'previous', 'done'
        });
    }

    logTourCompleted(tourId, totalSteps = null, timeSpent = null) {
        return this.logTourEvent('completed', tourId, null, {
            total_steps: totalSteps,
            time_spent: timeSpent
        });
    }

    logTourDismissed(tourId, stepId = null, reason = null) {
        return this.logTourEvent('dismissed', tourId, stepId, {
            dismiss_reason: reason
        });
    }

    logTourWidgetExpanded(tourId) {
        return this.logTourEvent('widget_expanded', tourId);
    }

    logTourWidgetMinimized(tourId) {
        return this.logTourEvent('widget_minimized', tourId);
    }

    logTourReset(tourId) {
        return this.logTourEvent('reset', tourId);
    }

    /**
     * Utility method to check if telemetry is enabled
     */
    isLoggingEnabled() {
        return this.isEnabled;
    }
}

// Initialize the global telemetry logger
window.wpilTelemetry = new WpilTelemetryLogger();

// Expose for debugging in development
if (window.wpil_ajax?.debug) {
    console.log('LinkWhisper Telemetry Logger initialized:', window.wpilTelemetry);
}