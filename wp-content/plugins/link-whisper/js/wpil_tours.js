"use strict";

(function ($) {
    
    /**
     * Tour Service - Handles server-side tour fetching with caching
     */
    class LinkWhisperTourService {
        constructor() {
            // No need for client-side cache since server handles caching
        }

        async fetchTours(pageSlug, pluginVersion) {
            try {
                // Use jQuery.ajax for WordPress compatibility
                const response = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: window.wpil_ajax.ajax_url,
                        data: {
                            action: 'wpil_load_tours',
                            nonce: window.wpil_ajax.tour_nonce,
                            page_slug: pageSlug,
                            plugin_version: pluginVersion
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
                    throw new Error(response.data || 'Failed to fetch tours');
                }

                return response.data;

            } catch (error) {
                console.error('LinkWhisper Tours: Failed to fetch tours', error);
                return { tours: [], user_progress: null };
            }
        }
    }

    /**
     * Tour Progress Manager - Handles server-side progress tracking
     */
    class LinkWhisperTourProgress {
        constructor(userProgress = null) {
            this.progress = this.parseUserProgress(userProgress);
        }

        parseUserProgress(userProgress) {
            if (!userProgress) {
                return {
                    completedTours: new Set(),
                    completedSteps: new Set(),
                    dismissedTours: new Set()
                };
            }

            return {
                completedTours: new Set(userProgress.completed_tours || []),
                completedSteps: new Set(userProgress.completed_steps || []),
                dismissedTours: new Set(userProgress.dismissed_tours || [])
            };
        }

        async saveProgress() {
            try {
                const toSave = {
                    completed_tours: Array.from(this.progress.completedTours),
                    completed_steps: Array.from(this.progress.completedSteps),
                    dismissed_tours: Array.from(this.progress.dismissedTours)
                };

                const response = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: window.wpil_ajax.ajax_url,
                        data: {
                            action: 'wpil_save_tour_progress',
                            nonce: window.wpil_ajax.save_tour_progress_nonce,
                            progress: JSON.stringify(toSave)
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
                    throw new Error(response.data || 'Failed to save progress');
                }
            } catch (error) {
                console.error('LinkWhisper Tours: Failed to save progress', error);
            }
        }

        async markStepComplete(stepId) {
            this.progress.completedSteps.add(stepId);
            await this.saveProgress();
        }

        async markTourComplete(tourId) {
            this.progress.completedTours.add(tourId);
            await this.saveProgress();
        }

        async dismissTour(tourId) {
            this.progress.dismissedTours.add(tourId);
            await this.saveProgress();
        }

        async resetTour(tourId) {
            console.log('LinkWhisper Tours: Resetting tour', tourId);
            console.log('LinkWhisper Tours: Current completed steps before reset:', Array.from(this.progress.completedSteps));
            
            // Clear ALL completed steps (since we only have one tour active at a time)
            this.progress.completedSteps.clear();
            
            // Remove tour from completed list
            this.progress.completedTours.delete(tourId);
            
            // Remove from dismissed list if present
            this.progress.dismissedTours.delete(tourId);
            
            await this.saveProgress();
            console.log('LinkWhisper Tours: Tour reset complete. Completed steps after reset:', Array.from(this.progress.completedSteps));
        }

        isStepComplete(stepId) {
            return this.progress.completedSteps.has(stepId);
        }

        isTourComplete(tourId) {
            return this.progress.completedTours.has(tourId);
        }

        isTourDismissed(tourId) {
            return this.progress.dismissedTours.has(tourId);
        }
    }

    /**
     * Tour UI Manager - Handles rendering and user interactions
     */
    class LinkWhisperTourUI {
        constructor(tourService, progressManager) {
            this.tourService = tourService;
            this.progress = progressManager;
            this.currentTour = null;
            this.currentStep = 0;
            this.lastClickTime = 0;
            this.clickDebounceDelay = 300; // 300ms debounce
        }

        async initializePage(pageSlug, pluginVersion) {
            const response = await this.tourService.fetchTours(pageSlug, pluginVersion);
            
            // Log debug information for target_events debugging
            if (response.debug_info) {
                console.log('LinkWhisper Tours Debug Info:', response.debug_info);
            }
            if (response.user_events_debug) {
                console.log('LinkWhisper User Events Debug:', response.user_events_debug);
            }
            
            if (response.tours && response.tours.length > 0) {
                // Update progress manager with user progress from server
                this.progress = new LinkWhisperTourProgress(response.user_progress);
                
                // Sort by priority and show the first tour (always persist)
                response.tours.sort((a, b) => a.priority - b.priority);
                this.showTour(response.tours[0]);
                
                // Check for auto_start tours and show first pending step automatically
                const autoStartTour = response.tours.find(tour => tour.auto_start === 1 || tour.auto_start === '1');
                if (autoStartTour) {
                    console.log('LinkWhisper Tours: Found auto_start tour:', autoStartTour.title);
                    this.checkAndAutoStartTour(autoStartTour);
                }
            }
        }

        checkAndAutoStartTour(tour) {
            // Find the first pending step
            for (let i = 0; i < tour.steps.length; i++) {
                const step = tour.steps[i];
                if (!this.progress.isStepComplete(step.id)) {
                    console.log('LinkWhisper Tours: Auto-starting tour at step:', step.title);
                    // Set current tour and step
                    this.currentTour = tour;
                    this.currentStep = i;
                    
                    // Log tour auto-start event
                    if (window.wpilTelemetry) {
                        window.wpilTelemetry.logTourAutoStarted(tour.id);
                    }
                    
                    // Mark tour as shown for frequency tracking
                    this.markTourAsShown(tour.id);
                    
                    // Show the step after a short delay to ensure page is fully loaded
                    setTimeout(() => {
                        // Ensure widget is expanded when auto-starting (skip auto-step to avoid conflicts)
                        this.expandWidget(true);
                        // Show the step popup
                        this.showStepByIndex(i);
                    }, 500);
                    return;
                }
            }
            console.log('LinkWhisper Tours: Auto_start tour has no pending steps');
        }

        async markTourAsShown(tourId) {
            try {
                const response = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: window.wpil_ajax.ajax_url,
                        data: {
                            action: 'wpil_mark_tour_shown',
                            nonce: window.wpil_ajax.mark_tour_shown_nonce,
                            tour_id: tourId
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
                    console.warn('LinkWhisper Tours: Failed to mark tour as shown:', response.data);
                }
            } catch (error) {
                console.error('LinkWhisper Tours: Error marking tour as shown:', error);
            }
        }

        showTour(tour) {
            this.currentTour = tour;
            this.currentStep = -1; // No step selected initially

            // Create persistent tour widget
            this.createTourWidget(tour);
        }

        createTourWidget(tour) {
            // Remove existing widget
            const existingWidget = document.getElementById('linkwhisper-tour-widget');
            if (existingWidget) {
                existingWidget.remove();
            }

            // Create persistent tour widget
            const widget = document.createElement('div');
            widget.id = 'linkwhisper-tour-widget';
            widget.className = 'linkwhisper-tour-widget minimized';
            
            // Initial minimized state
            widget.innerHTML = `
                <div class="tour-widget-minimized">
                    <div class="tour-widget-icon">📚</div>
                    <div class="tour-widget-title">${this.escapeHtml(tour.title)}</div>
                    <div class="tour-widget-progress">${this.getCompletedStepsCount(tour)}/${tour.steps.length}</div>
                </div>
                <div class="tour-widget-expanded" style="display: none;">
                    <div class="tour-header">
                        <div class="tour-title-section">
                            <h3>${this.escapeHtml(tour.title)}</h3>
                            <div class="tour-header-actions">
                                <button class="tour-dismiss" data-action="dismiss" aria-label="Dismiss tour">×</button>
                                <button class="tour-minimize" data-action="minimize" aria-label="Minimize">−</button>
                            </div>
                        </div>
                    </div>
                    <div class="tour-progress-bar">
                        <div class="progress-fill" style="width: ${this.getProgressPercentage(tour)}%"></div>
                    </div>
                    <div class="tour-progress-controls">
                        <div class="tour-progress-text">${this.getCompletedStepsCount(tour)}/${tour.steps.length}</div>
                        <button class="tour-reset" data-action="reset" aria-label="Reset tour progress">↻</button>
                    </div>
                    <div class="tour-checklist">
                        ${tour.steps.map((step, index) => `
                            <div class="step-item ${this.progress.isStepComplete(step.id) ? 'completed' : ''}" data-step="${index}" data-action="show-step">
                                <span class="step-checkbox" aria-hidden="true">${this.progress.isStepComplete(step.id) ? '✓' : (index + 1)}</span>
                                <span class="step-title">${this.escapeHtml(step.title)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;

            // Add event listeners
            widget.addEventListener('click', (e) => {
                const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
                const stepElement = e.target.closest('[data-step]');
                const stepIndex = stepElement?.dataset.step;
                
                // Debug logging
                if (window.wpil_ajax && window.wpil_ajax.debug) {
                    console.log('Tour widget clicked:', {
                        target: e.target,
                        action: action,
                        stepIndex: stepIndex,
                        stepElement: stepElement,
                        isMinimized: widget.classList.contains('minimized'),
                        clickedMinimized: !!e.target.closest('.tour-widget-minimized')
                    });
                }
                
                // Stop propagation for specific buttons to prevent conflicts
                if (action === 'expand') {
                    e.stopPropagation();
                    this.expandWidget();
                    return;
                } else if (action === 'minimize') {
                    e.stopPropagation();
                    this.minimizeWidget();
                    return;
                } else if (action === 'dismiss') {
                    e.stopPropagation();
                    this.dismissTourWidget();
                    return;
                } else if (action === 'reset') {
                    e.stopPropagation();
                    this.resetTour();
                    return;
                } else if (stepIndex !== undefined) {
                    // Handle step clicks (regardless of action attribute)
                    e.stopPropagation();
                    
                    // Debounce rapid clicks
                    const now = Date.now();
                    if (now - this.lastClickTime < this.clickDebounceDelay) {
                        console.log('LinkWhisper Tours: Click debounced, ignoring rapid click');
                        return;
                    }
                    this.lastClickTime = now;
                    
                    console.log('LinkWhisper Tours: Step clicked, index:', stepIndex);
                    
                    // Log manual tour start if this is the first step and no steps completed yet
                    const stepIndexInt = parseInt(stepIndex);
                    const completedCount = this.getCompletedStepsCount(this.currentTour);
                    if (stepIndexInt === 0 && completedCount === 0 && window.wpilTelemetry) {
                        window.wpilTelemetry.logTourStarted(this.currentTour.id, false);
                    }
                    
                    this.showStepByIndex(stepIndexInt);
                    return;
                }
                
                // If clicked on minimized widget, expand and show pending step
                if (widget.classList.contains('minimized') && 
                    e.target.closest('.tour-widget-minimized')) {
                    e.stopPropagation();
                    this.expandWidget();
                }
            });

            // Add keyboard navigation
            widget.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (!widget.classList.contains('minimized')) {
                        this.minimizeWidget();
                    }
                }
            });

            // Check for Tawk.to widget and adjust position
            this.adjustForTawkWidget(widget);
            
            document.body.appendChild(widget);
        }

        adjustForTawkWidget(widget) {
            // Check for Tawk.to widget elements
            const tawkElements = document.querySelectorAll('[id*="tawk"], [class*="tawk"], #tawkchat-minified-container, #tawkchat-container');
            
            if (tawkElements.length > 0) {
                console.log('LinkWhisper Tours: Tawk.to widget detected, adjusting position');
                widget.style.bottom = '120px';
            } else {
                // Check again after a delay in case Tawk.to loads later
                setTimeout(() => {
                    const laterTawkElements = document.querySelectorAll('[id*="tawk"], [class*="tawk"], #tawkchat-minified-container, #tawkchat-container');
                    if (laterTawkElements.length > 0) {
                        console.log('LinkWhisper Tours: Tawk.to widget detected later, adjusting position');
                        widget.style.bottom = '120px';
                    }
                }, 2000);
            }
        }

        getCompletedStepsCount(tour) {
            return tour.steps.filter(step => this.progress.isStepComplete(step.id)).length;
        }

        getProgressPercentage(tour) {
            const completed = this.getCompletedStepsCount(tour);
            return Math.round((completed / tour.steps.length) * 100);
        }

        expandWidget(skipAutoStep = false) {
            const widget = document.getElementById('linkwhisper-tour-widget');
            if (widget) {
                widget.classList.remove('minimized');
                widget.querySelector('.tour-widget-minimized').style.display = 'none';
                widget.querySelector('.tour-widget-expanded').style.display = 'block';
                
                // Log widget expansion event
                if (window.wpilTelemetry && this.currentTour) {
                    window.wpilTelemetry.logTourWidgetExpanded(this.currentTour.id);
                }
                
                // Show current pending step popup if there is one (unless we're skipping auto-step)
                if (!skipAutoStep) {
                    const pendingStep = this.getCurrentPendingStep();
                    if (pendingStep) {
                        console.log('LinkWhisper Tours: Showing pending step after expand:', pendingStep);
                        this.showStepByIndex(pendingStep.index);
                    }
                }
            }
        }

        getCurrentPendingStep() {
            if (!this.currentTour || !this.currentTour.steps) {
                return null;
            }

            // Find the first incomplete step
            for (let i = 0; i < this.currentTour.steps.length; i++) {
                const step = this.currentTour.steps[i];
                if (!this.progress.isStepComplete(step.id)) {
                    return {
                        step: step,
                        index: i
                    };
                }
            }

            // All steps completed
            return null;
        }

        minimizeWidget() {
            const widget = document.getElementById('linkwhisper-tour-widget');
            if (widget) {
                widget.classList.add('minimized');
                widget.querySelector('.tour-widget-minimized').style.display = 'flex';
                widget.querySelector('.tour-widget-expanded').style.display = 'none';
                
                // Log widget minimization event
                if (window.wpilTelemetry && this.currentTour) {
                    window.wpilTelemetry.logTourWidgetMinimized(this.currentTour.id);
                }
                
                // Clear any active highlights when minimizing
                this.clearHighlights();
            }
        }

        async dismissTourWidget() {
            if (!this.currentTour) {
                console.warn('LinkWhisper Tours: No current tour to dismiss');
                return;
            }

            console.log('LinkWhisper Tours: Dismissing tour widget:', this.currentTour.title);
            
            try {
                // Log tour dismissal event
                if (window.wpilTelemetry) {
                    window.wpilTelemetry.logTourDismissed(
                        this.currentTour.id, 
                        this.currentStep >= 0 ? this.currentTour.steps[this.currentStep]?.id : null,
                        'user_action'
                    );
                }
                
                // Mark tour as dismissed with timestamp
                await this.markTourDismissed(this.currentTour.id, this.currentTour.display_frequency);
                
                // Hide the widget
                const widget = document.getElementById('linkwhisper-tour-widget');
                if (widget) {
                    widget.style.display = 'none';
                }
                
                // Clear any active highlights
                this.clearHighlights();
                
                console.log('LinkWhisper Tours: Tour widget dismissed successfully');
            } catch (error) {
                console.error('LinkWhisper Tours: Error dismissing tour widget:', error);
            }
        }

        async markTourDismissed(tourId, displayFrequency) {
            try {
                const response = await new Promise((resolve, reject) => {
                    $.ajax({
                        type: 'POST',
                        url: window.wpil_ajax.ajax_url,
                        data: {
                            action: 'wpil_dismiss_tour_widget',
                            nonce: window.wpil_ajax.dismiss_tour_widget_nonce,
                            tour_id: tourId,
                            display_frequency: displayFrequency
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
                    throw new Error(response.data || 'Failed to dismiss tour widget');
                }
            } catch (error) {
                console.error('LinkWhisper Tours: Error marking tour as dismissed:', error);
                throw error;
            }
        }

        async resetTour() {
            if (!this.currentTour) return;
            
            console.log('LinkWhisper Tours: Resetting tour progress');
            
            // Log tour reset event
            if (window.wpilTelemetry) {
                window.wpilTelemetry.logTourReset(this.currentTour.id);
            }
            
            // Reset progress for this tour
            await this.progress.resetTour(this.currentTour.id);
            
            // Clear any active highlights and tooltips
            this.clearHighlights();
            
            // Reset current step
            this.currentStep = -1;
            
            // Update widget to reflect reset state
            this.updateWidget();
            
            console.log('LinkWhisper Tours: Tour progress reset');
        }

        showStepByIndex(stepIndex) {
            console.log('LinkWhisper Tours: showStepByIndex called with:', stepIndex);
            
            if (!this.currentTour) {
                console.warn('LinkWhisper Tours: No current tour available');
                return;
            }
            
            if (stepIndex < 0 || stepIndex >= this.currentTour.steps.length) {
                console.warn('LinkWhisper Tours: Invalid step index:', stepIndex, 'Tour has', this.currentTour.steps.length, 'steps');
                return;
            }

            this.currentStep = stepIndex;
            const step = this.currentTour.steps[stepIndex];
            
            // Log step viewed event
            if (window.wpilTelemetry && step) {
                window.wpilTelemetry.logTourStepViewed(
                    this.currentTour.id, 
                    step.id, 
                    stepIndex + 1, 
                    this.currentTour.steps.length
                );
            }
            
            console.log('LinkWhisper Tours: Attempting to show step:', step);
            this.showStep(step);
        }

        nextStep() {
            console.log('LinkWhisper Tours: Moving to next step');
            if (!this.currentTour) {
                console.warn('LinkWhisper Tours: No current tour available');
                return;
            }
            
            const currentIndex = this.currentStep || 0;
            const currentStep = this.currentTour.steps[currentIndex];
            
            // Log navigation click event
            if (window.wpilTelemetry && currentStep) {
                window.wpilTelemetry.logTourNavigationClicked(
                    this.currentTour.id, 
                    currentStep.id, 
                    'next'
                );
            }
            
            // Mark current step as completed before moving to next
            if (currentStep) {
                console.log('LinkWhisper Tours: Marking current step as completed:', currentStep.id);
                this.progress.markStepComplete(currentStep.id);
                this.progress.saveProgress();
                
                // Log step completion
                if (window.wpilTelemetry) {
                    window.wpilTelemetry.logTourStepCompleted(
                        this.currentTour.id, 
                        currentStep.id, 
                        currentIndex + 1
                    );
                }
            }
            
            const nextIndex = currentIndex + 1;
            
            if (nextIndex < this.currentTour.steps.length) {
                // Clear current tooltip before showing next step
                this.clearHighlights();
                this.showStepByIndex(nextIndex);
                // Update widget to reflect completed step
                this.updateWidget();
            } else {
                console.log('LinkWhisper Tours: Already at last step');
                this.markStepComplete();
            }
        }

        previousStep() {
            console.log('LinkWhisper Tours: Moving to previous step');
            if (!this.currentTour) {
                console.warn('LinkWhisper Tours: No current tour available');
                return;
            }
            
            const currentIndex = this.currentStep || 0;
            const currentStep = this.currentTour.steps[currentIndex];
            const previousIndex = currentIndex - 1;
            
            // Log navigation click event
            if (window.wpilTelemetry && currentStep) {
                window.wpilTelemetry.logTourNavigationClicked(
                    this.currentTour.id, 
                    currentStep.id, 
                    'previous'
                );
            }
            
            if (previousIndex >= 0) {
                this.showStepByIndex(previousIndex);
            } else {
                console.log('LinkWhisper Tours: Already at first step');
            }
        }

        showStep(step) {
            if (!step) {
                console.warn('LinkWhisper Tours: No step provided to showStep');
                return;
            }

            // Debug logging
            if (window.wpil_ajax && window.wpil_ajax.debug) {
                console.log('Showing step:', {
                    stepId: step.id,
                    title: step.title,
                    targetSelector: step.target_selector
                });
            }

            // Find target element
            const targetElement = document.querySelector(step.target_selector);
            if (!targetElement) {
                console.error(`LinkWhisper Tours: Target element not found: ${step.target_selector}`);
                console.warn('Available elements with IDs:', Array.from(document.querySelectorAll('[id]')).map(el => '#' + el.id));
                console.warn('Available elements with wpil classes:', Array.from(document.querySelectorAll('[class*="wpil"]')).map(el => el.className));
                return false;
            }

            console.log('LinkWhisper Tours: Found target element:', targetElement);
            this.proceedWithStep(targetElement, step);
            return true;
        }

        proceedWithStep(targetElement, step) {
            console.log('LinkWhisper Tours: Proceeding with step for element:', targetElement);

            // Remove existing highlights
            this.clearHighlights();

            // Highlight target element
            this.highlightElement(targetElement);

            // Scroll to element immediately
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center'
            });

            // Show tooltip immediately without delay
            this.showTooltip(targetElement, step);
        }

        highlightElement(element) {
            // Add highlight class
            element.classList.add('linkwhisper-tour-highlight');

            // Create spotlight effect
            const spotlight = document.createElement('div');
            spotlight.className = 'linkwhisper-tour-spotlight';
            
            // Position spotlight
            const rect = element.getBoundingClientRect();
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

            spotlight.style.cssText = `
                position: absolute;
                top: ${rect.top + scrollTop - 10}px;
                left: ${rect.left + scrollLeft - 10}px;
                width: ${rect.width + 20}px;
                height: ${rect.height + 20}px;
                border: 2px solid #007cba;
                border-radius: 4px;
                box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
                pointer-events: none;
                z-index: 9999;
                animation: linkwhisper-tour-pulse 2s infinite;
            `;

            document.body.appendChild(spotlight);

            // Scroll element into view
            element.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center',
                inline: 'center'
            });
        }

        showTooltip(targetElement, step) {
            console.log('LinkWhisper Tours: Creating tooltip for step:', step.title);

            if (!targetElement) {
                console.error('LinkWhisper Tours: Cannot show tooltip - target element is null');
                return false;
            }

            if (!step || !step.title || !step.description) {
                console.error('LinkWhisper Tours: Cannot show tooltip - invalid step data:', step);
                return false;
            }

            // Remove existing tooltip
            const existingTooltip = document.getElementById('linkwhisper-tour-tooltip');
            if (existingTooltip) {
                existingTooltip.remove();
                console.log('LinkWhisper Tours: Removed existing tooltip');
            }

            // Create tooltip
            const tooltip = document.createElement('div');
            tooltip.id = 'linkwhisper-tour-tooltip';
            tooltip.className = 'linkwhisper-tour-tooltip';
            tooltip.setAttribute('role', 'dialog');
            tooltip.setAttribute('aria-modal', 'true');
            
            try {
                const currentStep = this.currentStep || 0;
                const totalSteps = this.currentTour?.steps?.length || 1;
                const isFirstStep = currentStep === 0;
                const isLastStep = currentStep === totalSteps - 1;
                
                tooltip.innerHTML = `
                    <div class="tooltip-content">
                        ${step.image ? `<img src="${step.image}" alt="${this.escapeHtml(step.title)}" class="tooltip-image">` : ''}
                        <h4>${this.escapeHtml(step.title)}</h4>
                        <p>${this.escapeHtml(step.description)}</p>
                        <div class="tooltip-progress">
                            <span class="step-counter">${currentStep + 1} of ${totalSteps}</span>
                        </div>
                        <div class="tooltip-actions">
                            ${!isFirstStep ? `<button class="btn-secondary" data-action="previous">Previous</button>` : ''}
                            ${!isLastStep ? `<button class="btn-primary" data-action="next">Next</button>` : `<button class="btn-primary" data-action="done">Done</button>`}
                        </div>
                    </div>
                    <div class="tooltip-arrow"></div>
                `;
            } catch (error) {
                console.error('LinkWhisper Tours: Error creating tooltip HTML:', error);
                return false;
            }

            // Add tooltip to DOM and position immediately
            document.body.appendChild(tooltip);
            console.log('LinkWhisper Tours: Tooltip added to DOM, element ID:', tooltip.id);

            // Position tooltip immediately (synchronously)
            this.positionTooltipSync(tooltip, targetElement);

            // Ensure tooltip is visible
            tooltip.style.display = 'block';
            tooltip.style.visibility = 'visible';
            tooltip.style.opacity = '1';
            tooltip.style.zIndex = '10001';
            
            console.log('LinkWhisper Tours: Tooltip created and positioned immediately');

            // Add event listeners
            tooltip.addEventListener('click', (e) => {
                const action = e.target.dataset.action;
                if (action === 'got-it' || action === 'done') {
                    console.log('LinkWhisper Tours: Done/Got it button clicked');
                    this.markStepComplete();
                } else if (action === 'next') {
                    console.log('LinkWhisper Tours: Next button clicked');
                    this.nextStep();
                } else if (action === 'previous') {
                    console.log('LinkWhisper Tours: Previous button clicked');
                    this.previousStep();
                }
            });

            // Add keyboard listeners
            tooltip.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.clearHighlights(); // Just close tooltip, don't dismiss tour
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.nextStep();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.previousStep();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const action = e.target.dataset.action;
                    if (action === 'got-it' || action === 'done') {
                        this.markStepComplete();
                    } else if (action === 'next') {
                        this.nextStep();
                    } else if (action === 'previous') {
                        this.previousStep();
                    }
                }
            });

            // Focus management for accessibility
            const gotItButton = tooltip.querySelector('button');
            if (gotItButton) {
                gotItButton.focus();
            }
        }

        positionTooltipSync(tooltip, targetElement) {
            console.log('LinkWhisper Tours: Positioning tooltip synchronously');
            
            const targetRect = targetElement.getBoundingClientRect();
            console.log('LinkWhisper Tours: Target element rect:', targetRect);
            
            // Use estimated tooltip dimensions for immediate positioning
            const estimatedTooltipWidth = 320;
            const estimatedTooltipHeight = 200;
            
            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };

            let position = 'bottom';
            let top, left;

            // Calculate best position using estimated dimensions
            if (targetRect.bottom + estimatedTooltipHeight + 20 < viewport.height) {
                position = 'bottom';
                top = targetRect.bottom + window.pageYOffset + 10;
            } else if (targetRect.top - estimatedTooltipHeight - 20 > 0) {
                position = 'top';
                top = targetRect.top + window.pageYOffset - estimatedTooltipHeight - 10;
            } else if (targetRect.right + estimatedTooltipWidth + 20 < viewport.width) {
                position = 'right';
                top = targetRect.top + window.pageYOffset;
                left = targetRect.right + 10;
            } else if (targetRect.left - estimatedTooltipWidth - 20 > 0) {
                position = 'left';
                top = targetRect.top + window.pageYOffset;
                left = targetRect.left - estimatedTooltipWidth - 10;
            } else {
                // Fallback: center on screen
                position = 'bottom';
                top = targetRect.bottom + window.pageYOffset + 10;
            }

            // Center horizontally for top/bottom positions
            if (position === 'top' || position === 'bottom') {
                left = targetRect.left + window.pageXOffset + (targetRect.width / 2) - (estimatedTooltipWidth / 2);
                
                // Ensure tooltip stays within viewport
                if (left < 10) left = 10;
                if (left + estimatedTooltipWidth > viewport.width - 10) {
                    left = viewport.width - estimatedTooltipWidth - 10;
                }
            }

            // Apply position immediately
            tooltip.style.position = 'absolute';
            tooltip.style.top = `${top}px`;
            tooltip.style.left = `${left}px`;
            tooltip.dataset.position = position;
            
            console.log('LinkWhisper Tours: Tooltip positioned immediately at:', { top, left, position });
            
            // Fine-tune position after render using actual dimensions
            requestAnimationFrame(() => {
                this.adjustTooltipPosition(tooltip, targetElement);
            });
        }

        adjustTooltipPosition(tooltip, targetElement) {
            const targetRect = targetElement.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            
            const viewport = {
                width: window.innerWidth,
                height: window.innerHeight
            };

            let position = tooltip.dataset.position;
            let top = parseInt(tooltip.style.top);
            let left = parseInt(tooltip.style.left);

            // Adjust based on actual tooltip dimensions
            if (position === 'top' || position === 'bottom') {
                left = targetRect.left + window.pageXOffset + (targetRect.width / 2) - (tooltipRect.width / 2);
                
                // Ensure tooltip stays within viewport
                if (left < 10) left = 10;
                if (left + tooltipRect.width > viewport.width - 10) {
                    left = viewport.width - tooltipRect.width - 10;
                }
                
                tooltip.style.left = `${left}px`;
            }
            
            console.log('LinkWhisper Tours: Tooltip position adjusted to:', { top, left });
        }

        async markStepComplete() {
            if (!this.currentTour || this.currentStep < 0) return;

            const currentStep = this.currentTour.steps[this.currentStep];
            await this.progress.markStepComplete(currentStep.id);
            
            // Log step completion
            if (window.wpilTelemetry && currentStep) {
                window.wpilTelemetry.logTourStepCompleted(
                    this.currentTour.id, 
                    currentStep.id, 
                    this.currentStep + 1
                );
                
                // Check if this was the last step and log tour completion
                if (this.currentStep === this.currentTour.steps.length - 1) {
                    window.wpilTelemetry.logTourCompleted(
                        this.currentTour.id,
                        this.currentTour.steps.length
                    );
                }
            }

            // Clear highlights and tooltip
            this.clearHighlights();

            // Update widget UI to reflect completion but keep it visible
            this.updateWidget();
        }



        updateWidget() {
            const widget = document.getElementById('linkwhisper-tour-widget');
            if (!widget || !this.currentTour) return;

            const completedCount = this.getCompletedStepsCount(this.currentTour);
            const totalCount = this.currentTour.steps.length;

            // Update minimized state progress
            const progressText = widget.querySelector('.tour-widget-progress');
            if (progressText) {
                progressText.textContent = `${completedCount}/${totalCount}`;
            }

            // Update maximized state progress
            const expandedProgress = widget.querySelector('.tour-progress-text');
            if (expandedProgress) {
                expandedProgress.textContent = `${completedCount}/${totalCount}`;
            }

            // Update expanded state
            const checklist = widget.querySelector('.tour-checklist');
            if (checklist) {
                this.currentTour.steps.forEach((step, index) => {
                    const stepItem = checklist.querySelector(`[data-step="${index}"]`);
                    if (stepItem) {
                        const isComplete = this.progress.isStepComplete(step.id);
                        stepItem.classList.toggle('completed', isComplete);
                        
                        const checkbox = stepItem.querySelector('.step-checkbox');
                        if (checkbox) {
                            checkbox.textContent = isComplete ? '✓' : (index + 1);
                        }
                    }
                });
            }

            // Update progress bar
            const progressFill = widget.querySelector('.progress-fill');
            if (progressFill) {
                progressFill.style.width = `${this.getProgressPercentage(this.currentTour)}%`;
            }
        }

        updateProgress() {
            this.updateChecklist();
        }

        clearHighlights() {
            // Remove highlight classes
            document.querySelectorAll('.linkwhisper-tour-highlight').forEach(el => {
                el.classList.remove('linkwhisper-tour-highlight');
            });

            // Remove spotlight
            document.querySelectorAll('.linkwhisper-tour-spotlight').forEach(el => {
                el.remove();
            });

            // Remove tooltip
            const tooltip = document.getElementById('linkwhisper-tour-tooltip');
            if (tooltip) {
                tooltip.remove();
            }
        }


        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    }

    // Initialize tours when document is ready
    $(document).ready(function() {
        // Only initialize on LinkWhisper admin pages
        if (!window.wpil_ajax || !window.wpil_ajax.current_page) return;

        // Create tour instances
        const tourService = new LinkWhisperTourService();
        const progressManager = new LinkWhisperTourProgress(); // Will be updated with server data
        const tourUI = new LinkWhisperTourUI(tourService, progressManager);

        // Get current page and plugin version
        const currentPage = window.wpil_ajax.current_page;
        const pluginVersion = window.wpil_ajax.plugin_version || '1.0.0';

        // Initialize tours for current page
        tourUI.initializePage(currentPage, pluginVersion);

        // Expose for debugging if needed
        if (window.wpil_ajax.debug) {
            window.linkwhisperTours = {
                service: tourService,
                progress: progressManager,
                ui: tourUI
            };
        }
    });

})(jQuery);