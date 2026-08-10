"use strict";

(function ($) {
    // we're going to do this via Ajax, sliding from page to page wihtout reloading

    // NOTE: Decoupling AI from One Click Scan
    // AI scanning + linking are disabled inside One Click Setup by default. They're
    // re-enabled for this run when the wizard is loaded with the ?doLinking=1 param.
    var aiLinkingRequested = (new URLSearchParams(window.location.search)).get('doLinking') === '1';

    // link handler
    $(document).on('click', '.wpil-wizard-link', handleLinkClick);
    function handleLinkClick(e){
        e.preventDefault();
        var pageId = $(this).data('wpil-wizard-link-id');

        if(pageId && pageId.length > 0){
            changePage(pageId);
        }
        console.log(this);
    }

    // link handler
    /*$(document).on('click', '.wpil-get-gsc-access-token', function (){
        saveAboutYouInfo(1);
        changePage('run-scan');
    });*/

    $(document).ready(function($) {
        // if we've just navved back from the GSC auth screen
        var params = new URLSearchParams(window.location.search);
        if(params.has('access_valid')){
            // zoom to the open ai page
            changePage('connect-gsc');
            // and set a timeout for starting the scan!
            setTimeout(function(){
                changePage('scanning');
            }, 3000);
        }
    });

    // switch pager
    function changePage(pageId = ''){
        var page = $('.wizard-' + pageId);
console.log('.wizard-' + pageId);
        // first hide all the pages
        $('.wpil-wizard-page').addClass('wpil-wizard-page-hidden');

        // then hide any spinners
        $('.wpil-setup-wizard-loading').css({'display': 'none'});

        // now show the changed page
        page.removeClass('wpil-wizard-page-hidden');

        // if the page is the setup runner
        if(pageId === 'scanning'){
            setProcessingDataHeaderState('running');
            // make sure the credit indicator is set
            if(isWizardAiServiceConnected()){
                setCreditsUiDisabled(false);
            }else{
                setCreditsUiDisabled(true);
                setStepState('ai_scan', 'inactive', {
                    label: 'Not connected',
                    desc: 'Connect to Link Whisper AI to enable AI scanning for this site.'
                });
                setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We will finish scanning without generating links.' });
            }
            initWizardErrorState();
            // clear the process tracker and run the installation
            clearProcessTracker();
        }
    }

    function initWizardErrorState(){
        var $banner = $('#wpil-wizard-error-banner');
        if(!$banner.length || $banner.hasClass('hidden')){
            return false;
        }
        var error = {
            title: $banner.find('[data-role="error-title"]').text(),
            text: $banner.find('[data-role="error-text"]').html(),
            code: $banner.data('error-code') || ''
        };
        handleAiFatalError(error);
        return true;
    }
/*
    function skipLicensePage(){
        if(hasLicense == 1){
            //changePage('about-you');
            changePage('connect-gsc');
        }
    }
    skipLicensePage();*/

    // process runner // runs the loading scan and processor

    // completion handler

    // button highlighter
    $(document).on('click', '.wpil-setup-wizard-radio', handleButtonClick);
    function handleButtonClick(){
        var button = $(this),
            page = button.parents('.wpil-setup-wizard:visible');
        // remove the checked clase from any active buttons
        button.parents('.wpil-setup-wizard-radio-button-wrapper').find('.wpil-setup-wizard-radio-button').removeClass('checked');
        // and tag our clicked button with the checked class
        button.parents('.wpil-setup-wizard-radio-button').addClass('checked');
        // if the radios are all selected
        if(checkRequiredRadios()){
            // enable the next stage button
            page.find('.wpil-setup-wizard-main-button').removeClass('button-disabled');
        }
    }

    function checkRequiredRadios(){
        var buttons = $('.wpil-setup-wizard-radio:visible'),
            checked = [],
            names = [];


        buttons.each(function(ind, element){
            var name = element.name;
            if(!$('[name="' + name + '"]').is('[required]')){
                return;
            }

            if(names.indexOf(name) === -1){
                names.push(name);
                if($('[name="' + name + '"]').is(':checked')){
                    checked.push(name);
                }
            }
        });

        return names.length === checked.length;
    }

    function getCheckedRadios(){
        var buttons = $('.wpil-setup-wizard-radio'),
            checked = {},
            names = [];

        buttons.each(function(ind, element){
            var name = element.name;
            if(!$('[name="' + name + '"]').is('[required]')){
                return;
            }

            if(names.indexOf(name) === -1){
                names.push(name);
                var selected = $('[name="' + name + '"]:checked');
                if(selected.length){
                    checked[name] = selected.val();
                }
            }
        });

        return checked;
    }

    var wizardAiPopup = null,
        wizardAiPopupWatcher = null,
        wizardAiCheckingStatus = false,
        wizardAiAdvanceTimer = null;

    function wpilWizardCloseAiPopup(){
        if(wizardAiPopupWatcher){
            clearInterval(wizardAiPopupWatcher);
            wizardAiPopupWatcher = null;
        }

        if(wizardAiPopup && !wizardAiPopup.closed){
            try{
                wizardAiPopup.close();
            }catch(error){}
        }

        wizardAiPopup = null;
    }

    function wpilWizardPrimeAiPopup(){
        var width = 600,
            height = 700,
            left = (window.screen.width / 2) - (width / 2),
            top = (window.screen.height / 2) - (height / 2),
            loadingMessage = '<!doctype html><html><head><meta charset="utf-8"><title>Link Whisper AI</title><style>body{margin:0;font-family:Arial,sans-serif;background:#f8fafc;color:#0f172a;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}.wrap{max-width:520px;background:#fff;border-radius:18px;box-shadow:0 18px 50px rgba(15,23,42,.12);padding:32px;border:1px solid #e2e8f0;text-align:center}.spinner{width:42px;height:42px;border:4px solid #e5e7eb;border-top-color:#7F5AF0;border-radius:999px;animation:spin 1s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}h1{margin:0 0 12px;font-size:28px;line-height:1.2}p{margin:0;font-size:16px;line-height:1.6;color:#475569}</style></head><body><div class="wrap"><div class="spinner"></div><h1>Setting Up Link Whisper AI</h1><p>Hang tight for a second while we work on things behind the scenes...</p></div></body></html>';

        if(wizardAiPopup && !wizardAiPopup.closed){
            return true;
        }

        wizardAiPopup = window.open('', 'LinkWhisperAIConnect', 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left);

        if(!wizardAiPopup){
            wizardAiPopup = null;
            return false;
        }

        try{
            wizardAiPopup.document.open();
            wizardAiPopup.document.write(loadingMessage);
            wizardAiPopup.document.close();
        }catch(error){}

        return true;
    }

    function wpilWizardSetAiActionBusy(buttonSelector, isBusy){
        var $button = $(buttonSelector);
        if(!$button.length){
            return;
        }

        $button.prop('disabled', !!isBusy);
        $button.toggleClass('opacity-60 pointer-events-none', !!isBusy);
    }

    function wpilWizardSetAiConnectedState(isConnected){
        var value = isConnected ? '1' : '0';

        $('#wpil-setup-wizard-ai-connected').val(value);
        $('#wpil-wizard-ai-service-connected').val(value);
    }

    function wpilWizardGetAttemptEmail(fallbackEmail){
        var email = $.trim($('#wpil-wizard-ai-email').val());
        if(email){
            return email;
        }

        if(typeof fallbackEmail === 'string' && $.trim(fallbackEmail)){
            return $.trim(fallbackEmail);
        }

        email = $.trim($('.wizard-license [data-role="wizard-ai-verify-email"]').text());

        return email ? email : '';
    }

    function wpilWizardGetConnectedEmail(fallbackEmail){
        var email = $.trim($('.wizard-license [data-role="wizard-ai-connected-email"]').text());
        if(email){
            return email;
        }

        if(typeof fallbackEmail === 'string' && $.trim(fallbackEmail)){
            return $.trim(fallbackEmail);
        }

        return '';
    }

    function wpilWizardSetAiConnectionState(state, details){
        var $page = $('.wizard-license');
        var $error = $page.find('[data-role="wizard-ai-error"]');
        var $verificationMessage = $page.find('[data-role="wizard-ai-verification-message"]');
        details = details || {};

        if(!$page.length){
            return;
        }

        $page.attr('data-ai-state', state);
        $page.find('[data-wpil-ai-state]').addClass('hidden');
        $page.find('[data-wpil-ai-state="' + state + '"]').removeClass('hidden');

        if(Object.prototype.hasOwnProperty.call(details, 'email')){
            $('#wpil-wizard-ai-email').val(details.email);
        }

        if(Object.prototype.hasOwnProperty.call(details, 'verifyEmail')){
            $page.find('[data-role="wizard-ai-verify-email"]').text(details.verifyEmail);
        }else if(Object.prototype.hasOwnProperty.call(details, 'email') && state !== 'connected'){
            $page.find('[data-role="wizard-ai-verify-email"]').text(details.email);
        }

        if(Object.prototype.hasOwnProperty.call(details, 'connectedEmail')){
            $page.find('[data-role="wizard-ai-connected-email"]').text(details.connectedEmail);
        }else if(state === 'connected' && Object.prototype.hasOwnProperty.call(details, 'email')){
            $page.find('[data-role="wizard-ai-connected-email"]').text(details.email);
        }

        $error.addClass('hidden').text('');
        $verificationMessage.addClass('hidden').text('');

        if(state === 'ready'){
            wpilWizardSetAiConnectedState(false);
            if(details.message){
                $error.removeClass('hidden').text(details.message);
            }
        }

        if(state === 'verification_required' && details.message){
            $verificationMessage.removeClass('hidden').text(details.message);
        }

        if(state === 'connecting' && details.message){
            $page.find('[data-role="wizard-ai-connecting-text"]').text(details.message);
        }

        if(state === 'connected'){
            wpilWizardSetAiConnectedState(true);
        }
    }

    function wpilWizardValidEmail(email){
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test($.trim(email));
    }

    function wpilWizardResetAiActivation(){
        var nonce = $('#wpil-wizard-ai-auth-nonce').val();
        if(!nonce){
            wpilWizardCloseAiPopup();
            wpilWizardSetAiConnectionState('ready', {
                email: '',
                verifyEmail: '',
                connectedEmail: '',
                message: 'Enter your email again to start the Link Whisper AI connection over.'
            });
            return;
        }

        wpilWizardCloseAiPopup();
        wpilWizardSetAiActionBusy('.wpil-wizard-connect-ai', false);
        wpilWizardSetAiActionBusy('.wpil-wizard-confirm-ai-email', false);
        wpilWizardSetAiActionBusy('.wpil-wizard-reset-ai-activation', true);

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: {
                action: 'wpil_wizard_reset_ai_activation',
                nonce: nonce
            },
            success: function(response){
                wpilWizardSetAiConnectionState('ready', {
                    email: '',
                    verifyEmail: '',
                    connectedEmail: '',
                    message: (response && response.message) ? response.message : 'Enter your email again to start the Link Whisper AI connection over.'
                });
            },
            error: function(){
                wpilWizardSetAiConnectionState('ready', {
                    email: '',
                    verifyEmail: '',
                    connectedEmail: '',
                    message: 'Enter your email again to start the Link Whisper AI connection over.'
                });
            },
            complete: function(){
                wizardAiCheckingStatus = false;
                wpilWizardSetAiActionBusy('.wpil-wizard-reset-ai-activation', false);
            }
        });
    }

    function wpilWizardFinishAiConnection(details){
        var connectedEmail;

        details = details || {};
        connectedEmail = (details && details.email) ? $.trim(details.email) : wpilWizardGetConnectedEmail(wpilWizardGetAttemptEmail());

        wpilWizardCloseAiPopup();

        wpilWizardSetAiActionBusy('.wpil-wizard-connect-ai', false);
        wpilWizardSetAiActionBusy('.wpil-wizard-confirm-ai-email', false);
        wpilWizardSetAiConnectionState('connected', $.extend({}, details, {
            email: connectedEmail,
            connectedEmail: connectedEmail
        }));

        if(wizardAiAdvanceTimer){
            clearTimeout(wizardAiAdvanceTimer);
        }

        wizardAiAdvanceTimer = setTimeout(function(){
            changePage('moneypage');
        }, 900);
    }

    function wpilWizardHandlePreparedAuth(response, fallbackEmail){
        var email = wpilWizardGetAttemptEmail((response && response.email) ? response.email : fallbackEmail);
        var authUrl = (response && response.auth_url) ? response.auth_url : '';

        if(!authUrl){
            wpilWizardCloseAiPopup();
            wpilWizardSetAiConnectionState('ready', {
                email: email,
                message: "We couldn't finish the AI connection just now. Please try again."
            });
            return;
        }

        wpilWizardSetAiConnectionState('connecting', {
            email: email,
            message: (response && response.message) ? response.message : 'We opened the secure Link Whisper popup. Finish the AI authorization there and we will keep watch here.'
        });
        wpilWizardOpenAiPopup(authUrl, email);
    }

    function wpilWizardHandleStatusResponse(response, context){
        var responseEmail = (response && response.email) ? $.trim(response.email) : '';
        var email = wpilWizardGetAttemptEmail(responseEmail);
        var status = (response && response.status) ? response.status : '';
        var message = (response && response.message) ? response.message : '';

        if(response && parseInt(response.connected, 10) === 1){
            wpilWizardFinishAiConnection($.extend({}, response, {
                email: responseEmail || wpilWizardGetConnectedEmail(email)
            }));
            return;
        }

        if(status === 'auth_ready'){
            if(context === 'verify'){
                wpilWizardHandlePreparedAuth(response, email);
                return;
            }

            wpilWizardSetAiConnectionState('ready', {
                email: email,
                message: "We couldn't confirm the AI connection just yet. Please try again."
            });
            return;
        }

        if(status === 'verification_required'){
            wpilWizardCloseAiPopup();
            wpilWizardSetAiConnectionState('verification_required', {
                email: email,
                message: message || 'Check your email for the Link Whisper verification message, then come back here and try again.'
            });
            return;
        }

        if(status === 'expired' || status === 'invalid'){
            wpilWizardCloseAiPopup();
            wpilWizardSetAiConnectionState('ready', {
                email: email,
                message: message || 'This activation request expired. Please enter your email again and try once more.'
            });
            return;
        }

        if(status === 'rate_limited' || status === 'blocked'){
            wpilWizardCloseAiPopup();
            wpilWizardSetAiConnectionState('verification_required', {
                email: email,
                message: message || "We couldn't confirm the AI activation just now. Please wait a moment and try again."
            });
            return;
        }

        if(context === 'popup'){
            wpilWizardCloseAiPopup();
            wpilWizardSetAiConnectionState('ready', {
                email: email,
                message: "We couldn't confirm the AI connection just yet. Please try again."
            });
            return;
        }

        wpilWizardCloseAiPopup();
        wpilWizardSetAiConnectionState('ready', {
            email: email,
            message: message || "We couldn't start the AI connection just now. Please try again."
        });
    }

    function wpilWizardCheckAiConnection(context){
        var nonce = $('#wpil-wizard-ai-auth-nonce').val();
        if(!nonce || wizardAiCheckingStatus){
            return;
        }

        context = context || 'status';
        wizardAiCheckingStatus = true;
        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: {
                action: 'wpil_wizard_ai_connection_status',
                nonce: nonce
            },
            success: function(response){
                wpilWizardHandleStatusResponse(response, context);
            },
            error: function(){
                wpilWizardCloseAiPopup();
                var email = $('#wpil-wizard-ai-email').val();

                if(context === 'verify'){
                    wpilWizardSetAiConnectionState('verification_required', {
                        email: email,
                        message: "We couldn't check your email verification just now. Please try again."
                    });
                }else{
                    wpilWizardSetAiConnectionState('ready', {
                        email: email,
                        message: "We couldn't check the AI connection just now. Please try again."
                    });
                }
            },
            complete: function(){
                wizardAiCheckingStatus = false;
                wpilWizardSetAiActionBusy('.wpil-wizard-confirm-ai-email', false);
            }
        });
    }

    function wpilWizardOpenAiPopup(authUrl, email){
        var width = 600,
            height = 700,
            left = (window.screen.width / 2) - (width / 2),
            top = (window.screen.height / 2) - (height / 2);

        if(wizardAiPopup && !wizardAiPopup.closed){
            try{
                wizardAiPopup.location.href = authUrl;
                wizardAiPopup.focus();
            }catch(error){
                wizardAiPopup = null;
            }
        }

        if(!wizardAiPopup || wizardAiPopup.closed){
            wizardAiPopup = window.open(authUrl, 'LinkWhisperAIConnect', 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left);
        }

        if(!wizardAiPopup){
            wpilWizardSetAiActionBusy('.wpil-wizard-connect-ai', false);
            wpilWizardSetAiActionBusy('.wpil-wizard-confirm-ai-email', false);
            wpilWizardSetAiConnectionState('ready', {
                email: email,
                message: 'Popup blocked! Please allow popups for this site and try again.'
            });
            return false;
        }

        if(wizardAiPopupWatcher){
            clearInterval(wizardAiPopupWatcher);
        }

        wizardAiPopupWatcher = setInterval(function(){
            if(wizardAiPopup && wizardAiPopup.closed){
                clearInterval(wizardAiPopupWatcher);
                wizardAiPopupWatcher = null;
                setTimeout(function(){
                    wpilWizardCheckAiConnection('popup');
                }, 600);
            }
        }, 800);

        return true;
    }

    $(window).on('message', function(event){
        var payload = event.originalEvent && event.originalEvent.data ? event.originalEvent.data : null;
        if(payload && payload.type === 'AI_AUTH_COMPLETE'){
            wpilWizardCheckAiConnection('popup');
        }
    });

    $(document).on('input', '#wpil-wizard-ai-email', function(){
        $(this).removeClass('wpil-invalid');
        $('.wizard-license [data-role="wizard-ai-error"]').addClass('hidden').text('');
    });

    $(document).on('click', '.wpil-wizard-connect-ai', function(e){
        e.preventDefault();

        var $email = $('#wpil-wizard-ai-email'),
            email = $.trim($email.val()),
            nonce = $('#wpil-wizard-ai-auth-nonce').val();

        $email.removeClass('wpil-invalid');

        if(!wpilWizardValidEmail(email)){
            $email.addClass('wpil-invalid');
            wpilWizardSetAiConnectionState('ready', {
                email: email,
                message: 'Please enter a valid email address to connect Link Whisper AI.'
            });
            return;
        }

        wpilWizardPrimeAiPopup();
        wpilWizardSetAiActionBusy('.wpil-wizard-connect-ai', true);

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: {
                action: 'wpil_wizard_prepare_ai_activation',
                email: email,
                nonce: nonce
            },
            success: function(response){
                wpilWizardSetAiActionBusy('.wpil-wizard-connect-ai', false);

                if(response && response.status === 'connected'){
                    wpilWizardFinishAiConnection($.extend({}, response, {
                        email: (response && response.email) ? $.trim(response.email) : email
                    }));
                    return;
                }

                if(response && response.status === 'auth_ready' && response.auth_url){
                    wpilWizardHandlePreparedAuth(response, response.email || email);
                    return;
                }

                if(response && response.status === 'verification_required'){
                    wpilWizardCloseAiPopup();
                    wpilWizardSetAiConnectionState('verification_required', {
                        email: wpilWizardGetAttemptEmail((response && response.email) ? response.email : email),
                        message: response.message || 'Check your email for the Link Whisper verification message, then come back here and click the button below.'
                    });
                    return;
                }

                wpilWizardCloseAiPopup();
                wpilWizardSetAiConnectionState('ready', {
                    email: email,
                    message: (response && response.message) ? response.message : "We couldn't start the AI connection just now. Please try again."
                });
            },
            error: function(){
                wpilWizardCloseAiPopup();
                wpilWizardSetAiActionBusy('.wpil-wizard-connect-ai', false);
                wpilWizardSetAiConnectionState('ready', {
                    email: email,
                    message: "We couldn't start the AI connection just now. Please try again."
                });
            }
        });
    });

    $(document).on('click', '.wpil-wizard-confirm-ai-email', function(e){
        e.preventDefault();
        wpilWizardPrimeAiPopup();
        wpilWizardSetAiActionBusy('.wpil-wizard-confirm-ai-email', true);
        wpilWizardCheckAiConnection('verify');
    });

    $(document).on('click', '.wpil-wizard-reset-ai-activation', function(e){
        e.preventDefault();
        wpilWizardResetAiActivation();
    });

    var calling = false;
    $(document).on('click', '.linkwhisper-wizard-activate-license-legacy-disabled', function(){
    //$(document).on('change, input, blur, paste, keyup', '#wpil_license_key', function(){
        var input = $('#wpil_license_key');
        if(!iSayOldBeanThatLooksLikeALicenseKey(input.val())){ 
            alert("🤔 Hmm, that doesn’t look like a license key. \n\n You’ll find it in your purchase receipt email. \n\n  Need help? Contact support and we’ll be happy to assist.");
            return;
        }

        clearTimeout(calling);
        calling = setTimeout(function(){
            $('#wpil_license_key').prop('disabled', true);
            $('#wpil-setup-wizard-license-activate').trigger('submit');
        }, 500);
    });
    
    $(document).on('click', '.wpil-wizard-about-you-next-button', function(){
        if($(this).hasClass('button-disabled')){
            return;
        }
        changePage('automatic-linking');
    });

    $(document).on('click', '.wpil-wizard-automatic-linking-next-button', function(){
        if($(this).hasClass('button-disabled')){
            return;
        }

        var checked = getCheckedRadios();

        if( checked && 
            checked['wpil_setup_wizard_run_linking'] && 
            checked['wpil_setup_wizard_run_linking'] === 'yes' &&
            $('#wpil-setup-wizard-ai-connected').val() > 0
        ){
            changePage('link-planning');
        }else{
            changePage('run-setup');
        }
    });

    $(document).on('change', '#wpil_open_ai_api_key', function(){
        var text = $(this);
        if(text.val().length > 0){
            $('.wpil-wizard-activate-oai-button').removeClass('button-disabled');
        }else{
            $('.wpil-wizard-activate-oai-button').addClass('button-disabled');
        }
    });

    $(document).on('click', '.wpil-wizard-activate-oai-button', activateOaiKey);
    function activateOaiKey(e){
        e.preventDefault();

        var button = $(this);

        if(button.hasClass('button-disabled')){
            return;
        }

        // disable button && create loading effect
        $('.wpil-setup-wizard-loading').css({'display': 'block'});

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_wizard_save_oai_key',
                key: $('#wpil_open_ai_api_key').val(),
                nonce: button.data('wpil-nonce')
            },
            success: function(response){
                console.log(response);

                if(response.status === 'valid'){
                    changePage('run-setup');
                }else{
                    // undisable button
                    $('.wpil-setup-wizard-loading').css({'display': 'none'});
                }
			},
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
//				setupProcessingError(true);
            }
        });
    }

    function clearProcessTracker(){
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_clear_process_tracker'
            },
            success: function(response){
                console.log(response);
                runInstallation();
			},
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
            }
        });
    }

    function hasRunWizard(){
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_has_run_wizard'
            },
            success: function(response){
                console.log(response);
			},
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
            }
        });
    }
    hasRunWizard();

    function runWizardTippy(){
        if(typeof tippy !== 'function'){
            return;
        }

        $('.wpil-tippy-tooltipped').not('.wpil-tippy-loaded').each(function(index, element){
            var el = $(element);
            if(!el.data('wpilTooltipContent')){
                return;
            }

            var args = {
                content: el.data('wpilTooltipContent')
            };

            if(el.data('wpilTooltipPlacement')){
                args['placement'] = el.data('wpilTooltipPlacement');
            }

            if(el.data('wpilTooltipMaxwidth')){
                args['maxWidth'] = parseInt(el.data('wpilTooltipMaxwidth'));
            }

            tippy(element, args);
            el.addClass('wpil-tippy-loaded');
        });
    }
    runWizardTippy();

    var dashboardTooltip = null;
    function runInstallation(){
        var aiConnectionActive = isWizardAiServiceConnected();

        clearTimeout(dashboardTooltip);
        aiScanStopped = false;
        aiScannPaused = false;
        processingStatus['runLinkScan'] = false;
        processingStatus['runKeywordScan'] = false;
        processingStatus['runAIScan'] = !aiConnectionActive;
        processingStatus['runAILinking'] = (!aiConnectionActive || !isAiLinkingEnabled());
        setWizardReviewProcessState(false, false);
        syncAiLinkingEnabledState();
        if(aiConnectionActive){
            setCreditsUiLoading();
            refreshWizardCreditEstimate();
        }else{
            setCreditsUiDisabled(true);
        }
        // start the dashboard tooltip timeout
        dashboardTooltip = setTimeout(function(){
            $('#wpil-explain-page-button').trigger('click');
        }, 1000 * 10);

//        saveAboutYouInfo();
        runLinkScan();
        runKeywordScan();
        animateFunFacts();
        if(aiConnectionActive && !aiFatalError){
            scanWithAI();
        }
        if(aiConnectionActive && !aiFatalError){
            applyAiLinkingUiState();
            setManualReviewVisible(isAiLinkingEnabled());
        }else{
            setManualReviewVisible(false);
        }
        // set the process loading icons
        setStepState('links', 'running',  { desc: 'Scanning site\'s internal links…' });
        setStepState('keywords', 'running',{ desc: 'Importing keyword data…' });
        if(aiConnectionActive){
            setStepState('ai_scan', 'running',{ desc: 'Scanning site content and generating keywords…' });
            if(isAiLinkingEnabled()){
                setStepState('ai_linking', 'pending',{ desc: 'Waiting for analysis to finish…' });
            }else{
                setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
            }
        }else{
            stopWizardAiProcessing('Connect Link Whisper AI to turn on AI scanning for this setup.', 'inactive', 'Not connected');
        }
        if(aiFatalError){
            setWizardReviewProcessState(false, false);
            setStepState('ai_scan', 'stopped', { desc: 'Stopped due to an error.' });
            setStepState('ai_linking', 'stopped', { desc: 'Stopped due to an error.' });
        }
    }

    /**
     * Keeps track of how the processing is doing
     **/
    var processingStatus = {
        'runLinkScan': false,
        'runKeywordScan': false,
        'runAIScan': false,
        'runAILinking': true
//        'runAutolinkScan': false,
//        'runAutolinkInsert': false
    };

    function setProcessingDataHeaderState(state){
        var $spinner = $('[data-role="processing-status-spinner"]');
        var $check = $('[data-role="processing-status-check"]');
        var $label = $('[data-role="processing-status-label"]');

        if(!$spinner.length || !$check.length || !$label.length){
            return;
        }

        if(state === 'complete'){
            $spinner.addClass('hidden');
            $check.removeClass('hidden');
            $label.text('Processing Complete')
                .removeClass('text-[#7F5AF0]')
                .addClass('text-green-600');
            return;
        }

        $spinner.removeClass('hidden');
        $check.addClass('hidden');
        $label.text('Processing Data')
            .removeClass('text-green-600')
            .addClass('text-[#7F5AF0]');
    }

    function checkInstallationComplete(){
        finishWizardWithoutAiIfReady();

        var allGreen = true;
        for(var i in processingStatus){
            if(!processingStatus[i]){
                allGreen = false;
            }
        }

        if(allGreen){
            setProcessingDataHeaderState('complete');
            // set a flag so the Dashboard is sure that we're done
            setCompletionFlag();
            setTimeout(function(){
                window.location.href = dashboardURL;
            }, 350);
            // redirect to Dashboard
        }
    }

    function finishWizardWithoutAiIfReady(){
        if(!processingStatus.runLinkScan || !processingStatus.runKeywordScan){
            return;
        }

        if(processingStatus.runAIScan && processingStatus.runAILinking){
            return;
        }

        if(!aiScannPaused && !aiScanStopped && runningDownload){
            return;
        }

        processingStatus['runAIScan'] = true;
        processingStatus['runAILinking'] = true;
        aiScanStopped = true;
        aiScannPaused = false;
        runningDownload = false;
        resetAiLinkingQueueResetState();
        setWizardReviewProcessState(false, false);
        setManualReviewVisible(false);
        setStepState('ai_scan', 'inactive', { desc: 'AI scanning skipped. Regular setup is complete.', label: 'Skipped' });
        if(isAiLinkingEnabled()){
            setStepState('ai_linking', 'inactive', { desc: 'AI linking skipped. Regular setup is complete.', label: 'Skipped' });
        }else{
            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. Regular setup is complete.' });
        }
    }

    function runLinkScan(){
        processReportReset($('.wpil-wizard-reset-report-nonce').val(), 0, true);
    }

    function runKeywordScan(){
        wpil_target_keyword_reset_process(1, 1, true);
    }

    function scanWithAI(){
        if(!isWizardAiServiceConnected() || aiScanStopped){
            return;
        }
        ajaxliveDownloadAIData();
    }

    function wpilParseInt(val){
        if(val === undefined || val === null){ return 0; }
        var s = String(val).replace(/,/g,'').trim();
        var n = parseInt(s, 10);
        return isNaN(n) ? 0 : n;
    }

    function wpilFormatInt(n){
        n = wpilParseInt(n);
        return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    function wpilUpdateCreditsUI(available, needed){
        if(aiFatalError){
            setCreditsUiDisabled(true);
            return;
        }
        if(!isWizardAiServiceConnected() || aiScanStopped){
            setCreditsUiDisabled(true);
            return;
        }
        available = wpilParseInt(available);
        needed    = wpilParseInt(needed);

        // text
        $('.wpil-setup-wizard-credit-container .ai-credits-available').text(wpilFormatInt(available));
        $('.wpil-setup-wizard-credit-container .ai-credits-needed').text(wpilFormatInt(needed));

        // bar
        var pct = 100;
        if(needed > 0){
            pct = Math.min(100, Math.round((available / needed) * 100));
        }
        $('[data-role="credits-bar"]').css({ width: pct + '%' });

        // state
        var enough = (needed <= 0) ? true : (available >= needed);
        $('#wpil-wizard-enough-credits').val(enough ? '1' : '0');

        var $badge = $('[data-role="credit-status"]');
        var $warn  = $('[data-role="credit-warning"]');

        if(enough){
            $badge
            .removeClass('bg-red-100 text-red-700 bg-gray-200 text-gray-500')
            .addClass('bg-green-100 text-green-700')
            .text('Ready');

            $warn.addClass('hidden');
            lastOutOfCreditsPromptKey = '';
        }else{
            var shortfall = Math.max(0, needed - available);

            // add 25% padding
            var padded = Math.ceil(shortfall * 1.25);

            // round to nearest 100
            padded = Math.round(padded / 100) * 100;

            // safety: never drop below original shortfall
            if(padded < shortfall){
                padded += 100;
            }

            if(padded < 500){
                padded = 500;
            }

            $('[data-role="credit-shortfall"]').text(wpilFormatInt(padded));

            $badge.removeClass('bg-green-100 text-green-700 bg-gray-200 text-gray-500').addClass('bg-red-100 text-red-700').text('Not enough credits');

            $warn.removeClass('hidden');

            // keep buy button in sync
            $('.lw-credits-buy').show().attr('data-credits', padded).attr('data-quantity', padded);

            // check if we need to prompt for payment
            maybePromptForPayment();
        }
    }

    var aiScannPaused = false;
    var aiFatalError = false;
    var aiScanStopped = false;
    var lastOutOfCreditsPromptKey = '';
    var showWizardInsufficientCreditsNotice = false;

    function isWizardAiServiceConnected(){
        return $('#wpil-wizard-ai-service-connected').val() === '1';
    }

    function showWizardErrorBanner(error){
        if(isCreditRelatedError(error) && !showWizardInsufficientCreditsNotice){
            return;
        }

        var $banner = $('#wpil-wizard-error-banner');
        if(!$banner.length){
            return;
        }
        var title = (error && error.title) ? error.title : 'Processing Stopped';
        var text = (error && error.text) ? error.text : 'An unexpected error stopped processing.';
        var code = (error && error.code) ? error.code : '';
        $banner.removeClass('hidden');
        $banner.data('error-code', code);
        $banner.attr('data-error-code', code);
        $banner.find('[data-role="error-title"]').text(title);
        $banner.find('[data-role="error-text"]').html(text);
    }

    function clearCreditRelatedWizardError(){
        var $banner = $('#wpil-wizard-error-banner');
        if(!$banner.length){
            return;
        }

        var code = String($banner.data('error-code') || '');
        if(code === 'insufficient_credits'){
            $banner.addClass('hidden');
            $banner.find('[data-role="error-title"]').text('');
            $banner.find('[data-role="error-text"]').html('');
            $banner.data('error-code', '');
            $banner.attr('data-error-code', '');
        }

        if(aiFatalError && code === 'insufficient_credits'){
            aiFatalError = false;
        }
    }

    function closeOutOfCreditsPrompt(){
        var $oc = $('#wpil-out-of-credits-modal');
        if($oc.length){
            $oc.hide().attr('aria-hidden', 'true');
            $('body').removeClass('lwoc-open');
        }
    }

    function isCreditRelatedError(error){
        return !!(error && error.code === 'insufficient_credits');
    }

    function disableCreditPurchase(){
        $('.lw-credits-buy')
            .addClass('pointer-events-none opacity-50')
            .attr('aria-disabled', 'true');
    }

    function setCreditsUiDisabled(disabled){
        var $wrap = $('.wpil-setup-wizard-credit-container');
        if(!$wrap.length){
            return;
        }
        if(disabled){
            $wrap.addClass('opacity-60 pointer-events-none');
            $wrap.find('.ai-credits-needed').text('N/A');
            $wrap.find('[data-role="credit-status"]')
                .removeClass('bg-green-100 text-green-700')
                .addClass('bg-gray-200 text-gray-500')
                .text('N/A');
            $wrap.find('[data-role="credits-bar"]').css({ width: '0%' });
            $wrap.find('[data-role="credit-warning"]').addClass('hidden');
        }else{
            $wrap.removeClass('opacity-60 pointer-events-none');
        }
    }

    function setCreditsUiLoading(){
        var $wrap = $('.wpil-setup-wizard-credit-container');
        if(!$wrap.length){
            return;
        }

        $wrap.removeClass('opacity-60 pointer-events-none');
        $wrap.find('.ai-credits-available').text('Counting...');
        $wrap.find('.ai-credits-needed').text('Estimating...');
        $wrap.find('[data-role="credit-status"]')
            .removeClass('bg-green-100 text-green-700 bg-red-100 text-red-700')
            .addClass('bg-gray-200 text-gray-500')
            .text('Checking credits');
        $wrap.find('[data-role="credits-bar"]').css({ width: '0%' });
        $wrap.find('[data-role="credit-warning"]').addClass('hidden');
        $('#wpil-wizard-enough-credits').val('');
        lastOutOfCreditsPromptKey = '';
    }

    function stopWizardAiProcessing(message, state, label){
        state = state || 'stopped';
        aiScanStopped = true;
        aiScannPaused = false;
        runningDownload = false;
        processingStatus['runAIScan'] = true;
        processingStatus['runAILinking'] = true;
        resetAiLinkingQueueResetState();
        setWizardReviewProcessState(false, false);
        setCreditsUiDisabled(true);
        setStepState('ai_scan', state, {
            desc: message || 'AI scanning has been stopped.',
            label: label || 'Stopped'
        });
        if(isAiLinkingEnabled()){
            setStepState('ai_linking', state, {
                desc: 'AI linking has been stopped.',
                label: label || 'Stopped'
            });
        }else{
            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We will finish scanning without generating links.' });
        }
        setManualReviewVisible(false);
        checkInstallationComplete();
    }

    function handleAiFatalError(error){
        if(isCreditRelatedError(error)){
            aiFatalError = false;
            if(showWizardInsufficientCreditsNotice){
                showWizardErrorBanner(error);
            }
            setCreditsUiDisabled(false);
            processingStatus['runAILinking'] = isAiLinkingEnabled() ? processingStatus['runAILinking'] : true;
            pauseAIScan();
            return;
        }

        aiFatalError = true;
        showWizardErrorBanner(error);
        setStepState('ai_scan', 'stopped', { desc: 'Stopped due to an error.' });
        setStepState('ai_linking', 'stopped', { desc: 'Stopped due to an error.' });
        setManualReviewVisible(false);
        if(typeof processingStatus !== 'undefined' && processingStatus){
            processingStatus['runAIScan'] = true;
            processingStatus['runAILinking'] = true;
            setWizardReviewProcessState(false, false);
        }
        setCreditsUiDisabled(true);
        if(error && (
            error.code === 'ai_connection' || 
            error.code === 'ai_user_missing' || 
            error.code === 'invalid_api_key' || 
            error.code === 'ai_license_error' || 
            error.code === 'license_error' ||
            error.code === 'provider_conflict'
        )){
            disableCreditPurchase();
        }
    }

    $(document).on('click', '[data-role="error-close"]', function(){
        $('#wpil-wizard-error-banner').addClass('hidden');
    });
    function maybePromptForPayment(){
        if(aiFatalError || aiScanStopped || !isWizardAiServiceConnected()){
            return;
        }
        if($('#wpil-wizard-enough-credits').val() === '0'){
            var needed = parseInt(($('.ai-credits-needed').first().text() || '0').replace(/,/g,''), 10) || 0;
            var available = parseInt(($('.ai-credits-available').first().text() || '0').replace(/,/g,''), 10) || 0;

            if(available < needed){
                var promptKey = needed + ':' + available;
                if(!showWizardInsufficientCreditsNotice){
                    pauseAIScan();
                    return;
                }

                if($('#wpil-out-of-credits-modal').is(':visible') || $('#lw-credit-checkout-modal').is(':visible') || (aiScannPaused && lastOutOfCreditsPromptKey === promptKey)){
                    pauseAIScan();
                    return;
                }

                lastOutOfCreditsPromptKey = promptKey;
                // lives in template...
                if(typeof window.wpilOpenOutOfCredits === 'function'){
                    window.wpilOpenOutOfCredits({ needed: needed, available: available });
                }
                // also say that the scan is paused
                pauseAIScan();
            }else{
                resumeAIScan(); // unset the pause if we're here
            }
        }else{
            resumeAIScan(); // same
        }
    }

    function pauseAIScan(){
        if(aiFatalError || aiScanStopped){
            return;
        }
        aiScannPaused = true;
        if(!processingStatus.runAIScan){
            setStepState('ai_scan', 'paused', { desc: 'Scan Paused. Need More AI Credits.' });
        }
        if(!processingStatus.runAILinking){
            setStepState('ai_linking', 'paused', { desc: 'Linking Paused. Need More AI Credits.' });
        }
        finishWizardWithoutAiIfReady();
        checkInstallationComplete();
    }

    function resumeAIScan(){
        if(aiFatalError || aiScanStopped){
            return;
        }
        if(aiScannPaused){
            setWizardReviewProcessState(true, false);
            aiScannPaused = false;
            if(!processingStatus.runAIScan){
                setStepState('ai_scan', 'running', { desc: 'Scanning site content and generating keywords…' });
                // NOTE: Decoupling AI from One Click Scan (gated inside ajaxliveDownloadAIData)
                ajaxliveDownloadAIData(Math.floor(Date.now())); // restart the scan!
            }
            if(!processingStatus.runAILinking){
                if(!processingStatus.runAIScan || !processingStatus.runLinkScan){
                    setStepState('ai_linking', 'pending', { desc: 'Waiting for analysis to finish…' });
                }else{
                    setStepState('ai_linking', 'running', { desc: 'Searching for linking opportunities…' });
                    ajaxAILinkingRun();
                }
            }
        }
    }

    var aiDownloadTimer = 0,
        aiDownloadRetry = 0,
        completionRetry = 0,
        completeCount   = 0,
        rateLimitCount  = 0,
        lastStats       = {},
        runningDownload = false;

    function restartAiProcessingAfterCreditPurchase(){
        if(aiFatalError || aiScanStopped || !isWizardAiServiceConnected()){
            return;
        }

        if(aiScannPaused){
            resumeAIScan();
            return;
        }

        if(!processingStatus.runAIScan){
            if(!runningDownload){
                setStepState('ai_scan', 'running', { desc: 'Scanning site content and generating keywordsâ€¦' });
                ajaxliveDownloadAIData(Math.floor(Date.now()));
            }
            return;
        }

        if(isAiLinkingEnabled() && !processingStatus.runAILinking){
            applyAiLinkingUiState();
        }
    }

    // if the customer just bought credits
    $(document).on('lwcc:paid', function () {
        if(!isWizardAiServiceConnected() || aiScanStopped){
            return;
        }

        closeOutOfCreditsPrompt();
        clearCreditRelatedWizardError();
        lastOutOfCreditsPromptKey = '';
        setCreditsUiLoading();
        refreshWizardCreditEstimate(true, function(){
            if($('#wpil-wizard-enough-credits').val() === '1'){
                restartAiProcessingAfterCreditPurchase();
            }else{
                setTimeout(maybePromptForPayment, 300);
            }
        });
    });

    function ajaxliveDownloadAIData(time = 0, lastPassUnchanged = false){
        if(aiFatalError || aiScanStopped || !isWizardAiServiceConnected()){
            return;
        }
        if(aiScannPaused){
            return;
        }

        aiDownloadTimer = Math.floor(Date.now());
        runningDownload = true;
        var nonce = $('#wpil-setup-wizard-ai-data').data('nonce');
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_live_download_ai_data',
                start_time: time,
                activate_batch_processing: 1,//($(input).hasClass('wpil-turn-on-batch-ai-processing') ? 1: 0),
                last_pass_unchanged: (lastPassUnchanged) ? '1': '0',
                ai_linking_enabled: isAiLinkingEnabled() ? 1 : 0,
                nonce: nonce,
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.log('There has been an error during the download!');
                console.log(aiDownloadRetry);
                aiDownloadRetry += 1;

                // if the scan has errored less than 5 times, try it again
                if(aiDownloadRetry < 5){
                    var wait = 5;
                    if(jqXHR && jqXHR.status && jqXHR.status === 524){
                        // if we probably had a CloudFlare error, wait longer
                        wait *  420; // 7 minutes
                        console.log('had a Cloudflare error!');
                    }
                    setTimeout(function(){
                        ajaxliveDownloadAIData(time);
                    }, wait * 1000);
                    
                }else{
                    runningDownload = false;
                    finishWizardWithoutAiIfReady();
                    checkInstallationComplete();
//                    var wrapper = document.createElement('div');
//                    $(wrapper).append('<strong>' + textStatus + '</strong><br>' + errorThrown);
//                    $(wrapper).append(jqXHR.responseText);
//                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});
//                    disableAIDownloadOverlay();
                }
            },
            success: function(response){
                aiDownloadRetry = 0;
                var completionPercent = 0,
                    totalProgress = 0,
                    totalProcessRequired = 0;

                console.log(response);
                // if there was an error
                if(response.error){

                    if(!isCreditRelatedError(response.error)){
                        // note that the process is finished
                        processingStatus['runAIScan'] = true;
                        processingStatus['runAILinking'] = true;
                    }

                    handleAiFatalError(response.error);

                    // note that we're not running a scan
                    runningDownload = false;

                    // TODO: HANDLE ERRORS IN THE CLICKTHORUGH WIZARD
                    /*var wrapper = document.createElement('div');
                    $(wrapper).append(response.error.text);
                    // output the error message
                    wpil_swal({"title": response.error.title, "content": wrapper, "icon": "error"}).then(() => {
                        //location.reload();
                    });*/
//                    disableAIDownloadOverlay();
                    // and exit
                    return;
                }else if(response.continue){
                    // update the loader text
                    if(response.continue.data_total_processed){
                        var changed = false;
                        if(Object.keys(lastStats).length > 0){
                            var newKeys = Object.keys(response.continue.data_total_processed),
                                oldKeys = Object.keys(lastStats),
                                diff = newKeys.map(function(a){return parseInt(a);}).filter(x => !oldKeys.map(function(b){return parseInt(b);}).includes(x)).concat(oldKeys.map(function(b){return parseInt(b);}).filter(x => !newKeys.map(function(a){return parseInt(a);}).includes(x)));
                            if(false/*newKeys.length !== oldKeys.length || diff.length > 0*/){
                                changed = true;
                                completeCount = 0;
                            }else{
                                for(var i in response.continue.data_total_processed){
                                    if(lastStats[i] && parseInt(lastStats[i]) !== parseInt(response.continue.data_total_processed[i])){
                                        changed = true;
                                    }
                                }

                                if(changed){
                                    completeCount = 0;
                                }else if(completeCount >= 3){
//                                    disableAIDownloadOverlay();
                                    //wpil_swal(response.continue.completion_messages.info.title, response.continue.completion_messages.info.text, 'info').then(() => {
                                    //    location.reload();
                                    //});
                                    // note that the process is finished
                                    processingStatus['runAIScan'] = true;

                                    // ping the checker to see if we should redirect now
                                    checkInstallationComplete();
                                    return;
                                }else if (response.continue.post_saving && response.continue.processed_embeddings < 1){
                                    completeCount++;
                                }
                            }
                        }else{
                            changed = true;
                        }

                        lastStats = response.continue.data_total_processed;
                        for(var i in response.continue.data_total_processed){
                            totalProcessRequired += parseInt($('#wpil-setup-wizard-total-ai-processable-post-count').val());
                            totalProgress += parseInt(response.continue.data_total_processed[i]);
                        }
                    }

                    if(totalProcessRequired > 0){
                        if(totalProgress > 0){
                            completionPercent = ((totalProgress/totalProcessRequired) * 100).toFixed(0);
                        }
                    }
                    
                    // update the loading bar
                    //$('.wpil-wizard-ai-scan-progress-loader .progress_count').css({'width': completionPercent + '%'}).html('');
                    //$('.wpil-wizard-ai-scan-progress-loader .wpil-loading-status').text(completionPercent + '%');

                    setStepState('ai_scan', 'running',  {pct: completionPercent});

                    // update the credit counters
                    if(response.continue.ai_credits !== undefined || response.continue.estimated_credit_cost !== undefined){
                        var currentAvail = response.continue.ai_credits !== undefined
                            ? response.continue.ai_credits
                            : $('.wpil-setup-wizard-credit-container .ai-credits-available').first().text();

                        var currentNeed = response.continue.estimated_credit_cost !== undefined
                            ? response.continue.estimated_credit_cost
                            : $('.wpil-setup-wizard-credit-container .ai-credits-needed').first().text();

                        wpilUpdateCreditsUI(currentAvail, currentNeed);
                    }

                    if(!changed || response.continue.oai_completed){
                        var offset = 0;
                    }else{
                        var offset = (aiDownloadTimer && (15000 - (Math.floor(Date.now()) - aiDownloadTimer)) > 0) ? (15000 - (Math.floor(Date.now()) - aiDownloadTimer) + 150): 0;
                    }

                    if(response.continue.is_rate_limited){
                        rateLimitCount++;
                        // if we've been rate limited for a while now
                        if(rateLimitCount > 10 && response.continue.completion_messages.error){
                            // tell the user about it and exit
                            // TODO: MAYBE HANDLE ERRORS HERE!
                            //var wrapper = document.createElement('div');
                            //$(wrapper).append(response.continue.completion_messages.error.text);
                            //wpil_swal({"title": response.continue.completion_messages.error.title, "content": wrapper, "icon": "error"}).then(() => {
                                //location.reload();
                            //});
//                            disableAIDownloadOverlay();

                            // note that the process is finished
                            processingStatus['runAIScan'] = true;

                            // ping the checker to see if we should redirect now
                            checkInstallationComplete();

                            // and quit
                            return;
                        }
                        // otherwise,
                        offset += 60000; // wait an extra minute if we're rate limited
                    }else{
                        rateLimitCount = 0;
                    }

                    setTimeout(function(){
                        ajaxliveDownloadAIData(response.continue.start_time, !changed);
                    }, offset);

                }else if(response.success){

                    if(completionRetry < 2){
                        if(response.success.oai_completed){
                            var offset = 0;
                        }else{
                            var offset = (aiDownloadTimer && (65000 - (Math.floor(Date.now()) - aiDownloadTimer)) > 0) ? (65000 - (Math.floor(Date.now()) - aiDownloadTimer) + 150): 0;
                        }
                        setTimeout(function(){
                            ajaxliveDownloadAIData(time);
                        }, offset);
                        completionRetry++;
                        return;
                    }

                    // update the loading bar one last time
                    //$('.wpil-wizard-ai-scan-progress-loader .progress_count').css({'width': '100%'});
                    //$('.wpil-wizard-ai-scan-progress-loader .wpil-loading-status').text(completionPercent + '100%');

                    setStepState('ai_scan', 'done',  { desc: 'AI Scanning Complete!', pct: 100});

                    // note that the process is finished
                    processingStatus['runAIScan'] = true;

                    // ping the checker to see if we should redirect now
                    checkInstallationComplete();

                    // if we've also completed the keyword scan! And the link scan!
                    if(processingStatus.runKeywordScan && processingStatus.runLinkScan){
                        // check if we're doing ai linking
                        if(isAiLinkingEnabled()){
                            // fire off the AI linking!
                            // NOTE: Decoupling AI from One Click Scan (gated inside ajaxAILinkingRun)
                            ajaxAILinkingRun();
                            setStepState('ai_linking', 'running', { desc: 'Searching for linking opportunities…' });
                        }else{
                            processingStatus['runAILinking'] = true;
                            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
                            checkInstallationComplete();
                        }
                    }

//                    disableAIDownloadOverlay();
                    //wpil_swal(response.success.title, response.success.text, 'success').then(() => {
                        //location.reload(); // todo handle finishes
                    //});
                }
            }
        });
    }

    var aiLinkTimer = 0,
        aiLinkRetry = 0,
        aiLinkingRunStarted = false;//,
        //completionRetry = 0,
        //completeCount   = 0,
        //rateLimitCount  = 0,
        //lastStats       = {};
    function resetAiLinkingQueueResetState(){
        aiLinkingRunStarted = false;
    }

    function setWizardReviewProcessState(isRunning, isComplete){
        $('#wpil-ai-linking-running').val(isRunning ? 1 : 0);
        $('#wpil-ai-linking-complete').val(isComplete ? 1 : 0);
    }

    function updateWizardReviewReadyCount(total){
        var count = parseInt(total, 10);
        if(isNaN(count) || count < 0){
            count = 0;
        }

        var $reviewReadyCount = $('[data-role="review-ready-count"]');
        var $reviewButton = $('#wpil-review-open');
        var $reviewButtonLabel = $reviewButton.find('[data-role="review-button-label"]');
        var $reviewButtonSpinner = $reviewButton.find('[data-role="review-button-spinner"]');
        var isRunning = !processingStatus['runAILinking'];

        if($reviewReadyCount.length){
            $reviewReadyCount.text(count);
        }

        if(!$reviewButton.length){
            return;
        }

        if(count > 0){
            $reviewButton.prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
            if($reviewButtonSpinner.length){
                $reviewButtonSpinner.addClass('hidden');
            }
        }else{
            $reviewButton.prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
            if($reviewButtonSpinner.length){
                $reviewButtonSpinner.toggleClass('hidden', !isRunning);
            }
        }

        if($reviewButtonLabel.length){
            $reviewButtonLabel.text('Review');
        }
    }

    function ajaxAILinkingRun(lastPassUnchanged = false){ // and a merry christmas to you too!
        if(aiFatalError || aiScanStopped || !isWizardAiServiceConnected()){
            return;
        }
        if(aiScannPaused){
            return;
        }
        
        if(!isAiLinkingEnabled()){
            setWizardReviewProcessState(false, false);
            processingStatus['runAILinking'] = true;
            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
            checkInstallationComplete();
            return;
        }

        aiLinkTimer = Math.floor(Date.now());
        var nonce = $('#wpil-setup-wizard-ai-data').data('nonce');
        var shouldResetQueue = !aiLinkingRunStarted;
        aiLinkingRunStarted = true;
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_live_ai_linking',
                approve_all: (isAutoLinkingEnabled()) ? 1: 0,
                last_pass_unchanged: (lastPassUnchanged) ? '1': '0',
                queue_reset: (shouldResetQueue) ? '1' : '0',
                ai_linking_enabled: isAiLinkingEnabled() ? 1 : 0,
                nonce: nonce,
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.log('There has been an error during the download!');
                console.log(aiLinkRetry);
                aiLinkRetry += 1;

                // if the scan has errored less than 5 times, try it again
                if(aiLinkRetry < 5){
                    var wait = 5;
                    if(jqXHR && jqXHR.status && jqXHR.status === 524){
                        // if we probably had a CloudFlare error, wait longer
                        wait = 420; // 7 minutes
                        console.log('had a Cloudflare error!');
                    }
                    setTimeout(function(){
                        ajaxAILinkingRun(lastPassUnchanged);
                    }, wait * 1000);
                    
                }else{
                    resetAiLinkingQueueResetState();
                    setWizardReviewProcessState(false, false);
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>' + errorThrown);
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});
                }
            },
            success: function(response){
                aiLinkRetry = 0;
                var completionPercent = 0,
                    totalProgress = 0,
                    totalProcessRequired = 0;

                console.log(response);
                // if there was an error
                if(response.error){
                    if(!isCreditRelatedError(response.error)){
                        // note that the process is finished
                        processingStatus['runAILinking'] = true;
                        processingStatus['runAIScan'] = true;
                        resetAiLinkingQueueResetState();
                        setWizardReviewProcessState(false, false);
                    }

                    handleAiFatalError(response.error);
                }else if(response.continue){

                    var progress = (response.continue.progress) ? response.continue.progress: 0;
                    setWizardReviewProcessState(true, false);

                    if(response.continue.review_ready_count !== undefined){
                        updateWizardReviewReadyCount(response.continue.review_ready_count);
                    }

                    // update the loading bar as we go
                    //$('.wpil-wizard-ai-linking-progress-loader .progress_count').css({'width': progress + '%'}).html('');
                    //$('.wpil-wizard-ai-linking-progress-loader .wpil-loading-status').text(progress + '%');

                    setStepState('ai_linking', 'running',  { desc: 'Searching for linking opportunities…', pct: progress});

                    // update the credit counters
                    if(response.continue.ai_credits !== undefined || response.continue.estimated_credit_cost !== undefined){
                        var currentAvail = response.continue.ai_credits !== undefined
                            ? response.continue.ai_credits
                            : $('.wpil-setup-wizard-credit-container .ai-credits-available').first().text();

                        var currentNeed = response.continue.estimated_credit_cost !== undefined
                            ? response.continue.estimated_credit_cost
                            : $('.wpil-setup-wizard-credit-container .ai-credits-needed').first().text();

                        wpilUpdateCreditsUI(currentAvail, currentNeed);
                    }

                    if(isAiLinkingEnabled()){
                        ajaxAILinkingRun();
                    }else{
                        processingStatus['runAILinking'] = true;
                        setWizardReviewProcessState(false, false);
                        setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
                        checkInstallationComplete();
                    }
                }else if(response.success){
                    processingStatus['runAILinking'] = true;
                    resetAiLinkingQueueResetState();

                    if(response.success.review_ready_count !== undefined){
                        updateWizardReviewReadyCount(response.success.review_ready_count);
                    }

                    // let the review panel know the linking pass is done
                    setWizardReviewProcessState(false, true);

                    // start polling to see if we should redirect now
                    setInterval(function(){
                        // if the user wants all links inserted
                        if(isAutoLinkingEnabled() || ($('#wpil-wizard-approve-all').val() > 0 || $('#wpil-wizard-mode-checkbox').is(':checked'))){
                            // ping the checker to see if we should redirect now
                            checkInstallationComplete();
                        }
                    }, 1000);

                    setStepState('ai_linking', 'done',  { desc: 'AI Linking Complete!', pct: 100});

                    // update the credit counters on completion
                    if(response.success.ai_credits !== undefined || response.success.estimated_credit_cost !== undefined){
                        var finalAvail = response.success.ai_credits !== undefined
                            ? response.success.ai_credits
                            : $('.wpil-setup-wizard-credit-container .ai-credits-available').first().text();

                        var finalNeed = response.success.estimated_credit_cost !== undefined
                            ? response.success.estimated_credit_cost
                            : 0;

                        wpilUpdateCreditsUI(finalAvail, finalNeed);
                    }
                    // update the loading bar one last time
                    //$('.wpil-wizard-ai-linking-progress-loader .progress_count').css({'width': '100%'}).html('');
                    //$('.wpil-wizard-ai-linking-progress-loader .wpil-loading-status').text('100%');
                }
            }
        });
    }

    function iconPending(){
        return `
            <div class="w-8 h-8 bg-white border-2 border-gray-200 rounded-full flex items-center justify-center">
                <span class="w-2 h-2 bg-gray-300 rounded-full"></span>
            </div>
        `;
    }

    function iconPaused(){
        return `
            <div class="relative flex items-center justify-center">
            <div class="absolute w-8 h-8 rounded-full animate-pulse-ring-amber"></div>

            <div class="w-8 h-8 lw-pause-bg rounded-full
                        flex items-center justify-center
                        shadow-lg z-10">
                <svg xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="w-4 h-4 text-white">
                <path d="M6 4a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1zm8 0a1 1 0 011 1v10a1 1 0 11-2 0V5a1 1 0 011-1z"/>
                </svg>
            </div>
            </div>
            <div class="h-full w-0.5 lw-pause-line my-2"></div>
        `;
    }

    function iconStopped(){
        return `
            <div class="relative flex items-center justify-center">
                <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none" class="w-4 h-4 text-white">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </div>
            </div>
            <div class="h-full w-0.5 bg-red-200 my-2"></div>
        `;
    }

    function iconInactive(){
        return `
            <div class="relative flex items-center justify-center">
                <div class="w-8 h-8 bg-slate-100 border border-slate-200 rounded-full flex items-center justify-center shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" fill="none" class="w-4 h-4 text-slate-500">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M9 9V5.75A1.75 1.75 0 0110.75 4h2.5A1.75 1.75 0 0115 5.75V9m-7 0h8m-8 0v5.25A1.75 1.75 0 009.75 16h4.5A1.75 1.75 0 0016 14.25V9"></path>
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 19L19 5"></path>
                    </svg>
                </div>
            </div>
            <div class="h-full w-0.5 bg-slate-200 my-2"></div>
        `;
    }

    function iconRunning(){
        return `
            <div class="relative flex items-center justify-center">
                <div class="animate-pulse-ring absolute w-8 h-8 rounded-full"></div>
                <div class="w-8 h-8 lw-gradient-bg rounded-full flex items-center justify-center shadow-lg z-10">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4 text-white animate-spin">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                </div>
            </div>
            <div class="h-full w-0.5 bg-gray-200 my-2"></div>
        `;
    }

    function iconDone(){
        return `
            <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-200">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
            </div>
            <div class="h-full w-0.5 bg-green-200 my-2"></div>
        `;
    }

    function setStepState(stepKey, state, opts){
        opts = opts || {};
        var root = document.querySelector('[data-step="' + stepKey + '"]');
        if(!root) return;

        var icon = root.querySelector('[data-role="icon"]');
        var title = root.querySelector('[data-role="title"]');
        var pct   = root.querySelector('[data-role="pct"]');
        var desc  = root.querySelector('[data-role="desc"]');
        var barWrap = root.querySelector('[data-role="bar"]');
        var barFill = root.querySelector('[data-role="bar-fill"]');

        if(state === 'pending'){
            if(icon) icon.innerHTML = iconPending();
            if(title) { title.classList.remove('text-[#7F5AF0]'); title.classList.add('text-gray-400'); }
            if(pct) { pct.textContent = 'Pending'; pct.className = 'text-sm font-bold text-gray-300'; }
            if(desc) desc.textContent = opts.desc || 'Waiting to start.';
            if(barWrap) barWrap.classList.add('hidden');
        }

        if(state === 'paused'){
            if(icon) icon.innerHTML = iconPaused();
            if(title){
                title.classList.remove('text-[#7F5AF0]', 'text-gray-400');
                title.classList.add('lw-pause-text');
            }
            if(pct){
                pct.textContent = 'Paused';
                pct.className = 'text-sm font-bold lw-pause-text';
            }
            if(desc){
                desc.textContent = opts.desc || 'Paused. Add credits to continue.';
            }
            if(barWrap) barWrap.classList.add('hidden');
        }


        if(state === 'running'){
            if(icon) icon.innerHTML = iconRunning();
            if(title) { title.classList.remove('text-gray-400'); title.classList.add('text-[#7F5AF0]'); }
            if(pct) {
                pct.textContent = (typeof opts.pct === 'number') ? (opts.pct + '%') : 'Running';
                pct.className = 'text-sm font-bold text-[#7F5AF0]';
            }
            if(desc) desc.textContent = opts.desc || 'Working…';
            if(barWrap) barWrap.classList.remove('hidden');
            if(barFill && typeof opts.pct === 'number') barFill.style.width = opts.pct + '%';
        }

        if(state === 'disabled'){
            if(icon) icon.innerHTML = iconPending();
            if(title) { title.classList.remove('text-[#7F5AF0]'); title.classList.add('text-gray-500'); }
            if(pct) { pct.textContent = 'Off'; pct.className = 'text-sm font-bold text-gray-400'; }
            if(desc) desc.textContent = opts.desc || 'Linking Disabled.';
            if(barWrap) barWrap.classList.add('hidden');
        }

        if(state === 'inactive'){
            if(icon) icon.innerHTML = iconInactive();
            if(title) {
                title.classList.remove('text-[#7F5AF0]', 'text-gray-400', 'text-red-600');
                title.classList.add('text-slate-600');
            }
            if(pct) {
                pct.textContent = opts.label || 'Inactive';
                pct.className = 'text-sm font-bold text-slate-500';
            }
            if(desc) desc.textContent = opts.desc || 'This step is waiting for AI to be connected.';
            if(barWrap) barWrap.classList.add('hidden');
        }

        if(state === 'stopped'){
            if(icon) icon.innerHTML = iconStopped();
            if(title) { title.classList.remove('text-[#7F5AF0]', 'text-gray-400'); title.classList.add('text-red-600'); }
            if(pct) { pct.textContent = 'Stopped'; pct.className = 'text-sm font-bold text-red-600'; }
            if(desc) desc.textContent = opts.desc || 'Stopped due to an error.';
            if(barWrap) barWrap.classList.add('hidden');
        }

        if(state === 'done'){
            if(icon) icon.innerHTML = iconDone();
            if(title) { title.classList.remove('text-[#7F5AF0]', 'text-gray-400'); title.classList.add('text-gray-800'); }
            if(pct) { pct.textContent = '100%'; pct.className = 'text-sm font-bold text-green-600'; }
            if(desc) desc.textContent = opts.desc || 'Complete.';
            if(barWrap) barWrap.classList.add('hidden');
        }
    }

    function isAutoLinkingEnabled(){
        return $('#wpil-link-mode').val() === 'auto' || $('#wpil-wizard-approve-all').val() > 0;
    }

    function isAiLinkingEnabled(){
        return false;
    }

    function syncAiLinkingEnabledState(){
        $('#wpil-ai-linking-enabled').val(isAiLinkingEnabled() ? '1' : '0');
    }

    function refreshWizardCreditEstimate(refreshCredits, callback){
        if(aiFatalError || aiScanStopped){
            if(typeof callback === 'function'){
                callback();
            }
            return;
        }

        if(!isWizardAiServiceConnected()){
            setCreditsUiDisabled(true);
            if(typeof callback === 'function'){
                callback();
            }
            return;
        }

        var nonce = $('#wpil-setup-wizard-ai-data').data('nonce');
        if(!nonce){
            if(typeof callback === 'function'){
                callback();
            }
            return;
        }

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_get_wizard_credit_estimate',
                ai_linking_enabled: isAiLinkingEnabled() ? 1 : 0,
                refresh_credits: refreshCredits ? 1 : 0,
                nonce: nonce,
            },
            success: function(response){
                var payload = response && (response.success || response.data || response);
                if(payload && (payload.ai_credits !== undefined || payload.estimated_credit_cost !== undefined)){
                    var currentAvail = payload.ai_credits !== undefined
                        ? payload.ai_credits
                        : $('.wpil-setup-wizard-credit-container .ai-credits-available').first().text();

                    var currentNeed = payload.estimated_credit_cost !== undefined
                        ? payload.estimated_credit_cost
                        : $('.wpil-setup-wizard-credit-container .ai-credits-needed').first().text();

                    wpilUpdateCreditsUI(currentAvail, currentNeed);
                }
                if(typeof callback === 'function'){
                    callback();
                }
            },
            error: function(){
                if(typeof callback === 'function'){
                    callback();
                }
            }
        });
    }

    $(document).on('click', '#wpil-out-of-credits-modal .lwoc-nope', function(){
        stopWizardAiProcessing('AI scanning was turned off. We will keep processing the rest of the site without AI.', 'inactive', 'Skipped');
    });

    function applyAiLinkingUiState(){
        if(aiFatalError){
            setStepState('ai_linking', 'stopped', { desc: 'Stopped due to an error.' });
            setManualReviewVisible(false);
            return;
        }
        if(!isAiLinkingEnabled()){
            processingStatus['runAILinking'] = true;
            setWizardReviewProcessState(false, false);
            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
            setManualReviewVisible(false);
            checkInstallationComplete();
            return;
        }

        // If enabled:
        if(aiScannPaused){
            setWizardReviewProcessState(true, false);
            setStepState('ai_linking', 'paused', { desc: 'Linking paused. Need more AI credits.' });
            setManualReviewVisible(false);
            return;
        }

        // prerequisites done -> run now, else wait
        if(processingStatus['runAIScan'] && processingStatus['runKeywordScan'] && processingStatus.runLinkScan){
            if(isAiLinkingEnabled()){
                setWizardReviewProcessState(true, false);
                // NOTE: Decoupling AI from One Click Scan (gated inside ajaxAILinkingRun)
                ajaxAILinkingRun();
                setStepState('ai_linking', 'running', { desc: 'Searching for linking opportunities…' });
                setManualReviewVisible(true);
            }else{
                processingStatus['runAILinking'] = true;
                setWizardReviewProcessState(false, false);
                setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
                checkInstallationComplete();
                setManualReviewVisible(false);
            }
        }else{
            setWizardReviewProcessState(true, false);
            setStepState('ai_linking', 'pending', { desc: 'Waiting for scans to finish before linking.' });
            setManualReviewVisible(true);
        }
    }

    $(document).on('change', '#wpil-ai-linking-toggle', function(){
        syncAiLinkingEnabledState();
        // NOTE: Decoupling AI from One Click Scan — only estimate credits when AI is requested
        if(aiLinkingRequested){
            refreshWizardCreditEstimate();
        }
        // If user turns OFF: treat linking as “complete” so wizard can finish without it.
        if(!isAiLinkingEnabled()){
            processingStatus['runAILinking'] = true;
            resetAiLinkingQueueResetState();
            applyAiLinkingUiState();
            checkInstallationComplete();
            return;
        }

        // If user turns ON again:
        processingStatus['runAILinking'] = false;
        resetAiLinkingQueueResetState();
        applyAiLinkingUiState();
    });

    function setManualReviewVisible(isVisible){
        var $wrap = $('#wpil-manual-review-section');
        if(!$wrap.length) return;
        var $reviewButtonContainer = $('.wpil-wizard-linking-mode-buttons');
        var $reviewButton = $('#wpil-review-open');
        var $modeInputs = $('input[name="wpil-ai-linking-mode"]');
        var $modal = $('#wpil-review-modal');

        if(isVisible){
            var mode = $('#wpil-link-mode').val() || 'auto';
            if(mode === 'review'){
                $wrap.removeClass('hidden');
            }
            if($reviewButton.length){
                $reviewButton.prop('disabled', false).removeClass('opacity-50 cursor-not-allowed');
            }
            if($modeInputs.length){
                $modeInputs.prop('disabled', false);
            }
            if($reviewButtonContainer.length){
                $reviewButtonContainer.removeClass('hidden');
            }
        }else{
            $wrap.addClass('hidden');
            if($reviewButton.length){
                $reviewButton.prop('disabled', true).addClass('opacity-50 cursor-not-allowed');
            }
            if($modeInputs.length){
                $modeInputs.prop('disabled', true);
            }
            if($modal.length && !$modal.hasClass('hidden')){
                $modal.addClass('hidden').attr('aria-hidden', 'true');
                $('body').removeClass('wpil-review-open');
            }
            if($reviewButtonContainer.length){
                $reviewButtonContainer.addClass('hidden');
            }
        }
    }

    var funCycle = null;
    function animateFunFacts(){
        clearInterval(funCycle);
        funCycle = setInterval(cycleFunFacts, (1000 * 10));
    }

    var timeList = [];    
    function processReportReset(nonce = null, loopCount = 0, clearData = false){
        if(!nonce){
            return;
        }

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'reset_report_data',
                nonce: nonce,
                loop_count: loopCount,
                clear_data: clearData,
            },
            error: function (jqXHR, textStatus) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
            },
            success: function(response){
                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error', 'links_to_process_count', 'data_setup_complete', 'loop_count', 'loading_screen', 'nonce', 'time']);
                }

                // if there was an error
                if(response.error){
                    wpil_swal(response.error.title, response.error.text, 'error');
                    return;
                }
                
                // if we've been around a couple times without processing links, there must have been an error
                if(!response.links_to_process_count && response.loop_count > 5){
                    wpil_swal('Data Reset Error', 'Link Whisper has tried a number of times to reset the report data, and it hasn\'t been able to complete the action.', 'error');
                    return;
                }

                // if the data has been successfully reset
                if(response.data_setup_complete){
                    // set the loading screen now that the data setup is complete
                    if(response.loading_screen){
                        $('.wpil-wizard-process-subtext').css({'display': 'none'});
                        $('.wpil-wizard-process-subtext.scan-post-links').css({'display': 'inline-block'});
                    }
                    // set the time
                    timeList.push(response.time);
                    // and call the data processing function to handle the data
                    processReportData(response.nonce, 0, 0, 0);
                }else{
                    // if we're not done processing links, go around again
                    processReportReset(response.nonce, (response.loop_count + 1), true);
                }
            }
        });
    }
    /**
     * Keeps track of the loop's progress in a global context so the scan is less susceptible to minor errors like timeouts
     **/
    var globalScan = {
        'nonce': '', 						// nonce
        'loop': 0, 							// loop count
        'link_posts_to_process_count': 0, 	// posts/cats to process count
        'processed': 0, 					// how many have been processed so far
        'link_posts_to_process_diff': 0,	// the difference between the number of posts to process and the ones that have been processed
        'meta_filled': false, 				// if the meta processing is complete
        'links_filled': false,				// if the link processing is complete
        'error_count': 0,					// the number of times the scan has errored
        'loops_unchanged': 0				// the number of loops we've gone over without a change in the total number of processed posts
    };

    /**
     * Process runner that handles the report data generation process.
     * Loops around until all the site's links are inserted into the LW link table
     **/
    function processReportData(	nonce = null, 
                                loopCount = 0, 
                                linkPostsToProcessCount = 0, 
                                linkPostsProcessed = 0, 
                                linkPostProcessDiff = 0,
                                metaFilled = false, 
                                linksFilled = false,
                                loopsUnchanged = 0,
                                resumeScan = false)
    {
        if(!nonce){
            return;
        }

        // initialize the stage clock. // The clock is useful for debugging
        if(loopCount < 1){
            if(timeList.length > 0){
                var lastTime = timeList.pop();
                timeList = [lastTime];
            }else{
                timeList = [];
            }
        }

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'process_report_data',
                nonce: nonce,
                loop_count: loopCount,
                link_posts_to_process_count: linkPostsToProcessCount,
                link_posts_processed: linkPostsProcessed,
                link_posts_to_process_diff: linkPostProcessDiff,
                meta_filled: metaFilled,
                links_filled: linksFilled,
                loops_unchanged: loopsUnchanged,
                resume_scan: (resumeScan) ? 1: 0 
            },
            error: function (jqXHR, textStatus, errorThrown) {
                console.log('There has been an error during the scan!');
                console.log(globalScan);
                globalScan.error_count += 1;

                // if the scan has errored less than 5 times, try it again
                if(globalScan.error_count < 5){
                    processReportData(
                        globalScan.nonce,
                        globalScan.loop,
                        globalScan.link_posts_to_process_count,
                        globalScan.processed,
                        globalScan.link_posts_to_process_diff,
                        globalScan.meta_filled,
                        globalScan.links_filled,
                        globalScan.loops_unchanged
                    );
                }else{
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
                }
            },
            success: function(response){
                console.log(response);

                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, [
                        'error', 
                        'links_to_process_count', 
                        'data_setup_complete', 
                        'loop_count', 
                        'loading_screen',
                        'processed',
                        'meta_filled',
                        'links_filled',
                        'error_count',
                        'loops_unchanged',
                        'processing_complete',
                        'nonce', 
                        'time']);
                }

                // if there was an error
                if(response.error){
                    // output the error message
                    wpil_swal(response.error.title, response.error.text, 'error');
                    // and exit
                    return;
                }

                // log the time
                timeList.push(response.time);

                // update the global stats
                globalScan.nonce = response.nonce;
                globalScan.loop = 0;
                globalScan.link_posts_to_process_count = response.link_posts_to_process_count;
                globalScan.processed = response.link_posts_processed;
                globalScan.link_posts_to_process_diff = response.link_posts_to_process_diff;
                globalScan.meta_filled = response.meta_filled;
                globalScan.links_filled = response.links_filled;
                globalScan.error_count = 0;
                globalScan.loops_unchanged = response.loops_unchanged;

                // if the meta has been successfully processed
                if(response.processing_complete){
                    // if the processing is complete
                    // console.log the time if available
                    if(timeList > 1){
                        console.log('The post processing took: ' + (timeList[(timeList.length - 1)] - timeList[0]) + ' seconds.');
                    }

                    // update the loading bar one more time
                    animateTheReportLoadingBar(response, '.wpil-wizard-post-progress-loader', true);

                    // note the success in the status object
                    processingStatus['runLinkScan'] = true;

                    // ping the checker to see if we should redirect now
                    checkInstallationComplete();

                    // if we've also completed the keyword scan! And the AI scan!
                    if(processingStatus.runKeywordScan && processingStatus.runAIScan){
                        // check if we're doing ai linking
                        if(isAiLinkingEnabled()){
                            // fire off the AI linking!
                            // NOTE: Decoupling AI from One Click Scan (gated inside ajaxAILinkingRun)
                            ajaxAILinkingRun();
                            setStepState('ai_linking', 'running', { desc: 'Searching for linking opportunities…' });
                        }else{
                            processingStatus['runAILinking'] = true;
                            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
                            checkInstallationComplete();
                        }
                    }

                    // and exit since we're done here
                    return;
                } else if(response.link_processing_complete){
                    // if we've finished loading links into the link table
                    // show the post processing loading page
                    if(response.loading_screen){
                        $('.wpil-wizard-process-subtext').css({'display': 'none'});
                        $('.wpil-wizard-process-subtext.calc-post-links').css({'display': 'inline-block'});
                    }

                    // console.log the time if available
                    if(timeList > 1){
                        console.log('The link processing took: ' + (timeList[(timeList.length - 1)] - timeList[0]) + ' seconds.');
                    }

                    // re-call the function for the final round of processing
                    processReportData(  response.nonce,
                        0,
                        response.link_posts_to_process_count,
                        0,
                        response.link_posts_to_process_diff,
                        response.meta_filled,
                        response.links_filled,
                        response.loops_unchanged);

                } else if(response.meta_filled){
                    // show the link processing loading screen
                    if(response.loading_screen){
                        $('.wpil-wizard-process-subtext').css({'display': 'none'});
                        $('.wpil-wizard-process-subtext.scan-post-links').css({'display': 'inline-block'});
//                        $('#wpbody-content').html(response.loading_screen);
                    }
                    // console.log the time if available
                    if(timeList > 1){
                        console.log('The meta processing took: ' + (timeList[(timeList.length - 1)] - timeList[0]) + ' seconds.');
                    }

                    // update the loading bar
                    animateTheReportLoadingBar(response, '.wpil-wizard-post-progress-loader', response.processing_complete);

                    // and recall the function to begin the link processing (loading the site's links into the link table)
                    processReportData(  response.nonce,                         // nonce
                        0,                                      // loop count
                        response.link_posts_to_process_count,   // posts/cats to process count
                        0,                                      // how many have been processed so far
                        response.link_posts_to_process_diff,	// what's the difference between the posts processed and the ones coming up
                        response.meta_filled,                   // if the meta processing is complete
                        response.links_filled,					// if the link processing is complete
                        response.loops_unchanged);				// how many loops have we gone through without processing posts
                } else{
                    // update the loop count
                    globalScan.loop = (response.loop_count + 1);
                    // if we're not done processing, go around again
                    processReportData(  response.nonce, 
                                        (response.loop_count + 1), 
                                        response.link_posts_to_process_count, 
                                        response.link_posts_processed,
                                        response.link_posts_to_process_diff,
                                        response.meta_filled,
                                        response.links_filled,
                                        response.loops_unchanged);
                    
                    // if the meta has been processed
                    if(response.meta_filled){
                        // update the loading bar
                        animateTheReportLoadingBar(response, '.wpil-wizard-post-progress-loader', response.processing_complete);
                    }
                }
            }
        });
    }

    /**
     * Updates the loading bar length and the displayed completion status.
     * 
     * A possible improvement might be to progressively update the loading bar so its more interesting.
     * As it is now, the bar jumps every 60s, so it might be a bit dull and the user might wonder if it's working.
     **/
    function animateTheReportLoadingBar(response, targetSelector = '', complete = false){
        // get the loading display
        var loadingDisplay = $('#wpbody-content ' + targetSelector);
        // create some variable to update the display with
        var percentCompleted = Math.floor((response.link_posts_processed/response.link_posts_to_process_count) * 100);
        //var displayedStatus = percentCompleted + '%' + ((response.links_filled) ? (', ' + response.link_posts_processed + '/' + response.link_posts_to_process_count) : '') + ' ' + wpil_ajax.completed;
        var displayedStatus = percentCompleted + '%';

        if(complete || percentCompleted >= 100){
            displayedStatus = '100%';
            percentCompleted = 100;
            setStepState('links', 'done',  { desc: 'Link scanning complete! ' + response.link_posts_to_process_count + ' pages scanned.', pct: percentCompleted});
        }else{
            setStepState('links', 'running',  { desc: 'Scanning site\'s internal links…', pct: percentCompleted});
        }

        // update the display with the new info
        //loadingDisplay.find('.wpil-loading-status').text(displayedStatus);
        //loadingDisplay.find('.progress_count').css({'width': percentCompleted + '%'});
    }

    function wpil_report_next_step()
    {
        location.reload();
    }

    /**
     * Keeps track of the loop's progress in a global context so the scan is less susceptible to minor errors like timeouts
     **/
    var globalKeywordScan = {
        'count': 0,
        'total': 0,
        'error_count': 0
    };

    function wpil_target_keyword_reset_process(count, total, reset = false) {
        globalKeywordScan['count'] = count;
        globalKeywordScan['total'] = total;

        $.ajax({
            type: "POST",
            url: ajaxurl,
            data: {
                action: 'wpil_target_keyword_reset',
                nonce: $('.wpil-wizard-reset-target-keyword-nonce').val(),
                count: count,
                total: total,
                reset: reset,
            },
            error: function (jqXHR, textStatus, errorThrown) {
                globalKeywordScan.error_count += 1;

                // if the scan has errored less than 5 times, try it again
                if(globalKeywordScan.error_count < 5){
                    wpil_target_keyword_reset_process(
                        globalKeywordScan.count,
                        globalKeywordScan.total
                    );
                }else{
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(function(){
                        //location.reload();
                    });
                }
            },
            success: function(response){
                console.log(response);

                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error', 'state', 'keywords_found', 'count', 'total', 'finish', 'estimate']);
                }

                if (response.error) {
                    wpil_swal(response.error.title, response.error.text, 'error');
                    return;
                }

                var completion = Math.round(response.estimate.completed/response.estimate.total * 100);
                setStepState('keywords', 'running',  { desc: 'Importing keyword data…', pct: completion });
                //$('.wpil-wizard-target-keyword-progress-loader .progress_count').css({'width': completion + '%'}).html('');
                //$('.wpil-wizard-target-keyword-progress-loader .wpil-loading-status').text(completion + '%');

                if (response.finish) {
                    // update the status to show we're done
                    //$('.wpil-wizard-target-keyword-progress-loader .progress_count').css({'width': '100%'}).html('');
                    //$('.wpil-wizard-target-keyword-progress-loader .wpil-loading-status').text('100%');

                    setStepState('keywords', 'done',  { desc: 'Keyword import complete!', pct: 100 });

                    // note the success in the status object
                    processingStatus['runKeywordScan'] = true;

                    // ping the checker to see if we should redirect now
                    checkInstallationComplete();

                    // if we've also completed the AI scan! And the linking scan is complete!
                    if(processingStatus.runAIScan  && processingStatus.runLinkScan){
                        // check if we're doing ai linking
                        if(isAiLinkingEnabled()){
                            // fire off the AI linking!
                            // NOTE: Decoupling AI from One Click Scan (gated inside ajaxAILinkingRun)
                            ajaxAILinkingRun();
                            setStepState('ai_linking', 'running', { desc: 'Searching for linking opportunities…' });
                        }else{
                            processingStatus['runAILinking'] = true;
                            setStepState('ai_linking', 'disabled', { desc: 'Linking disabled. We’ll finish scanning without generating links.' });
                            checkInstallationComplete();
                        }
                    }
                } else {
                    wpil_target_keyword_reset_process(response.count, response.total)
                }
            }
        });
    }

    function cycleFunFacts(){
        var visibleFact = jQuery('.wpil-wizard-fun-fact:visible'),
            id = parseInt(visibleFact.data('wpil-wizard-fun-fact-id')),
            id = (id == 31) ? 1: (id + 1);

        visibleFact.fadeOut(750, function(){
            setTimeout(function(){
                jQuery('.wpil-wizard-fun-fact[data-wpil-wizard-fun-fact-id="' + id + '"]').fadeIn(750);
            }, 200);
        });
    }

    function setCompletionFlag(){
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_wizard_set_completion_flag'
            },
            success: function(response){
                console.log(response);
			},
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
            }
        });
    }

/*
     * Pillar Content editor
     * Requires these elements on the Pillar page:
     *  - #wpil-pillars-search
     *  - #wpil-pillars-results
     *  - #wpil_pillar_content_ids (hidden input, comma-separated pids)
     *  - #wpil-pillars-selected (container holding selected rows)
     *  - #wpil-pillars-save-next (save button, data-wpil-nonce, optional data-wpil-maintenance-link-id)
     */

    var pillarSearchTimer = false;

    $(document).on('click', '.wpil-pillars-remove', handlePillarRemove);
    function handlePillarRemove(e){
        e.preventDefault();
        e.stopPropagation();

        var row = $(this).closest('.wpil-toggle-row'),
            pid = String(row.data('pid') || '');

        if(!pid){
            return;
        }

        removePillarId(pid);
    }

    $(document).on('input', '#wpil-pillars-search', handlePillarSearchInput);
    function handlePillarSearchInput(){
        var term = $(this).val();
        term = term ? term.trim() : '';

        if(!term || term.length < 2){
            $('#wpil-pillars-results').addClass('hidden').html('');
            return;
        }

        if(pillarSearchTimer){
            clearTimeout(pillarSearchTimer);
        }

        pillarSearchTimer = setTimeout(function(){
            ajaxSearchPillarPosts(term);
        }, 250);
    }

    $(document).on('click', '.wpil-pillars-add', handlePillarAdd);
    function handlePillarAdd(e){
        e.preventDefault();
        e.stopPropagation();

        var button = $(this),
            pid = String(button.data('pid') || ''),
            id = parseInt(button.data('post-id'), 10);

        if(!pid || pillarHasPid(pid)){
            return;
        }

        // update the button immediately
        button.prop('disabled', true)
            .addClass('opacity-70 cursor-not-allowed')
            .html(
            '<span class="inline-flex items-center gap-2">' +
                '<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">' +
                '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25"></circle>' +
                '<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>' +
                '</svg>' +
                'Adding' +
            '</span>'
            );

        addPillarItem({
            id: id,
            pid: pid,
            title: button.data('title') || '(No title)',
            type: button.data('type') || '',
            realTypeName: button.data('real-type-name') || '',
            status: button.data('status') || '',
            edit: button.data('edit') || '#',
            view: button.data('view') || ''
        });

        var addedBadge = '<span class="text-sm font-semibold px-3 py-1.5 rounded-lg bg-green-50 border border-green-100 text-green-700">Added</span>';
        button.replaceWith(addedBadge);

        // refresh the search results so the button flips to "Added"
        //$('#wpil-pillars-search').trigger('input');
    }

    $(document).on('click', '#wpil-pillars-save-next', savePillarContent);
    function savePillarContent(e){
        e.preventDefault();

        var button = $(this),
            nonce = getPillarNonce(),
            ids = $('#wpil_pillar_content_ids').val() || '';

        setWizardButtonLoading(button, true, 'Saving…');

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_pillar_save_posts',
                nonce: nonce,
                ids: ids
            },
            success: function(response){
                console.log(response);

                // allow different response shapes
                var ok = false;
                if(response && response.success){
                    ok = true;
                }else if(response && response.status === 'success'){
                    ok = true;
                }else if(response && response.saved){
                    ok = true;
                }

                if(!ok){
                    setWizardButtonLoading(button, false);
                    alert('Could not save money pages.');
                    return;
                }

                // update the save button with a quick message!
                setWizardButtonLoading(button, true, 'Saved!');

                // if this button has a next page id, advance the wizard
                var pageId = button.data('wpil-wizard-link-id');
                if(pageId && pageId.length > 0){
                    changePage(pageId);
                }
            },
            error: function(jqXHR, textStatus, errorThrown){
                if(loader.length){
                    loader.css({'display': 'none'});
                }
                console.log({jqXHR, textStatus, errorThrown});
                alert('Could not save pillar content.');
            }
        });
    }

function setWizardButtonLoading($btn, isLoading, label){
  label = label || 'Saving…';

  if(isLoading){
    if(!$btn.data('orig-html')){
      $btn.data('orig-html', $btn.html());
    }

    $btn.prop('disabled', true)
      .addClass('opacity-80 cursor-not-allowed')
      .html(
        '<span class="inline-flex items-center gap-2">' +
          '<svg class="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">' +
            '<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25"></circle>' +
            '<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>' +
          '</svg>' +
          '<span>' + escapeHtml(label) + '</span>' +
        '</span>'
      );

    return;
  }

  var orig = $btn.data('orig-html');
  if(orig){
    $btn.html(orig);
  }
  $btn.prop('disabled', false)
    .removeClass('opacity-80 cursor-not-allowed');
}


    function ajaxSearchPillarPosts(term){
        var nonce = getPillarNonce(),
            results = $('#wpil-pillars-results');

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_pillar_search_posts',
                nonce: nonce,
                term: term
            },
            success: function(response){
                var items = [];

                if(response && response.success && response.data && response.data.items){
                    items = response.data.items;
                }else if(response && response.items){
                    items = response.items;
                }

                renderPillarSearchResults(items);
            },
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
                results.addClass('hidden').html('');
            }
        });
    }

    function renderPillarSearchResults(items){
        var results = $('#wpil-pillars-results');
        if(!results.length){
            return;
        }

        if(!items || !items.length){
            results.html('<div class="p-4 text-sm text-gray-500">No results.</div>').removeClass('hidden');
            return;
        }

        var html = '<ul class="divide-y divide-gray-100">';

        for(var i = 0; i < items.length; i++){
            var it = items[i],
            id = parseInt(it.id, 10),
            pid = it.pid ? String(it.pid) : '',
            title = it.title ? it.title : '(No title)',
            realTypeName = it.real_type_name ? String(it.real_type_name) : '',
            type = it.type ? String(it.type) : '',
            status = it.status ? String(it.status) : '',
            edit = it.edit ? it.edit : '#',
            view = it.view ? it.view : '#',
            alreadyAdded = pillarHasPid(pid);

            var metaType = realTypeName ? realTypeName : type;
            var meta = escapeHtml(metaType + (metaType && status ? ' | ' : '') + status);
            if(view && view !== '#'){
            meta += ' | <a href="' + escapeAttr(view) + '" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700 hover:underline">View</a>';
            }

            html += ''
            + '<li class="flex items-center justify-between px-4 py-3 hover:bg-gray-50">'
            +   '<div class="min-w-0 pr-4">'
            +     '<div class="text-gray-900 font-medium truncate">' + escapeHtml(title) + '</div>'
            +     '<div class="text-xs text-gray-500 mt-0.5">'
            +        meta
            +     '</div>'
            +   '</div>'
            +   '<div class="flex items-center gap-2 flex-shrink-0">';

            if(alreadyAdded){
            html += '<span class="text-sm font-semibold px-3 py-1.5 rounded-lg bg-green-50 border border-green-100 text-green-700">Added</span>';
            }else{
            html += ''
                + '<button type="button" class="wpil-pillars-add text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-white transition-colors"'
                + ' data-post-id="' + id + '"'
                + ' data-pid="' + escapeAttr(pid) + '"'
                + ' data-title="' + escapeAttr(title) + '"'
                + ' data-type="' + escapeAttr(it.type || '') + '"'
                + ' data-real-type-name="' + escapeAttr(it.real_type_name || '') + '"'
                + ' data-status="' + escapeAttr(it.status || '') + '"'
                + ' data-edit="' + escapeAttr(edit) + '"'
                + ' data-view="' + escapeAttr(view) + '"'
                + '>Add</button>';
            }

            html += ''
            +   '</div>'
            + '</li>';
        }

        html += '</ul>';

        results.html(html).removeClass('hidden');
    }

function addPillarItem(item){
  var selected = $('#wpil-pillars-selected');
  if(!selected.length){
    return;
  }

  var id = parseInt(item.id, 10),
      pid = String(item.pid || '');
  if(!pid || pillarHasPid(pid)){
    return;
  }

  var ids = getPillarPids();
  ids.push(pid);
  setPillarPids(ids);

  selected.find('.wpil-pillars-empty').remove();

  var title = item.title ? item.title : '(No title)',
      type = item.type ? String(item.type) : '',
      realTypeName = item.realTypeName ? String(item.realTypeName) : '',
      status = item.status ? String(item.status) : '',
      view = item.view ? String(item.view) : '';

  var selectedMetaType = realTypeName ? realTypeName : type;
  var selectedMeta = escapeHtml(selectedMetaType + (selectedMetaType && status ? ' | ' : '') + status);
  if(view){
    selectedMeta += ' | <a href="' + escapeAttr(view) + '" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-700 hover:underline">View</a>';
  }

  var rowHtml = ''
    + '<li class="wpil-toggle-row flex items-center justify-between p-4 bg-white border border-gray-100 rounded-xl hover:shadow-md transition-shadow group" data-post-id="' + id + '" data-pid="' + escapeAttr(pid) + '">'
    +   '<div class="flex items-center overflow-hidden mr-4 min-w-0">'
    +     '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6 text-gray-400 mr-3 flex-shrink-0">'
    +       '<path stroke-linecap="round" stroke-linejoin="round" d="M8.25 3.75h6l3.75 3.75V18a2.25 2.25 0 0 1-2.25 2.25h-7.5A2.25 2.25 0 0 1 6 18V6a2.25 2.25 0 0 1 2.25-2.25Z" />'
    +       '<path stroke-linecap="round" stroke-linejoin="round" d="M14.25 3.75V7.5A.75.75 0 0 0 15 8.25h3" />'
    +     '</svg>'
    +     '<div class="truncate min-w-0">'
    +       '<div class="text-gray-900 font-medium text-lg truncate">' + escapeHtml(title) + '</div>'
    +       '<div class="text-xs text-gray-500 mt-0.5 truncate">' + selectedMeta + '</div>'
    +     '</div>'
    +   '</div>'
    +   '<button type="button" class="wpil-pillars-remove text-gray-300 hover:text-red-500 p-2 rounded-full hover:bg-red-50 transition-colors focus:outline-none" title="Remove">'
    +     '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">'
    +       '<path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />'
    +     '</svg>'
    +   '</button>'
    + '</li>';

  selected.append(rowHtml);
  updatePillarCount();
}

    function removePillarId(pid){
        var ids = getPillarPids(),
            ind = ids.indexOf(pid);

        if(ind !== -1){
            ids.splice(ind, 1);
            setPillarPids(ids);
        }

        $('#wpil-pillars-selected').find('.wpil-toggle-row[data-pid="' + pid + '"]').remove();

        if(ids.length < 1){
            var selected = $('#wpil-pillars-selected');
            if(selected.length && selected.find('.wpil-pillars-empty').length < 1){
            selected.html('<li class="wpil-pillars-empty text-sm text-gray-500 bg-gray-50 border border-gray-100 rounded-xl p-4">No money pages selected yet. Use the search box above to add some.</li>');
            }
        }

        updatePillarCount();

        // refresh results so "Added" state updates
        $('#wpil-pillars-search').trigger('input');
    }

    function updatePillarCount(){
        var count = getPillarPids().length;
        $('[data-pillars-count]').text(count);
    }

    function pillarHasPid(pid){
        return getPillarPids().indexOf(pid) !== -1;
    }

    function getPillarPids(){
        var field = $('#wpil_pillar_content_ids');
        if(!field.length){
            return [];
        }

        var raw = (field.val() || '').trim();
        if(!raw){
            return [];
        }

        var parts = raw.split(','),
            ids = [];

        for(var i = 0; i < parts.length; i++){
            var val = String(parts[i] || '').trim();
            if(!val){
                continue;
            }

            if(/^\d+$/.test(val)){
                ids.push('post_' + val);
            }else{
                ids.push(val);
            }
        }

        return ids;
    }

    function setPillarPids(ids){
        $('#wpil_pillar_content_ids').val((ids || []).join(','));
    }

    function getPillarNonce(){
        var button = $('#wpil-pillars-save-next'),
            nonce = button.data('wpil-nonce');

        if(!nonce){
            nonce = button.attr('data-wpil-nonce');
        }

        return nonce || '';
    }

    function escapeHtml(str){
        if(str === undefined || str === null){
            return '';
        }
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function escapeAttr(str){
        // same as escapeHtml, but named separately to make intent clear
        return escapeHtml(str);
    }

    // Click outside closes results
    $(document).on('click', function(e){
        var results = $('#wpil-pillars-results');
        if(!results.length) return;

        var isInside = $(e.target).closest('#wpil-pillars-results, #wpil-pillars-search').length > 0;
        if(!isInside){
            results.addClass('hidden').html('');
        }
    });

    // Escape closes results
    $(document).on('keydown', function(e){
        if(e.key === 'Escape'){
            $('#wpil-pillars-results').addClass('hidden').html('');
        }
    });


    /**
     * Helper function to tell us if the user is about to enter a license key in a non-license key field
     **/
    function iSayOldBeanThatLooksLikeALicenseKey(str) {
        if (typeof str !== 'string') return false;

        const trimmed = str.trim();

        // 32 hex chars, case-insensitive
        return /^[a-f0-9]{32}$/i.test(trimmed);
    }
    

})(jQuery);

