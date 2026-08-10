"use strict";

(function ($) {
    $(document).on('click', '#wpil_error_edit_selected', wpil_get_edit_error_links);
    $(document).on('click', '#wpil_error_filter', wpil_error_codes_update);
    $(document).on('click', '#check_all_codes', wpil_toggle_available_codes);
    $(document).on('click', '#error_table_code_filter .item:first-of-type', wpil_error_codes_toggle);
//    $(document).on('click', '.wpil-error-report-url-edit-confirm', wpil_error_link_update);
    $(document).on('submit', '#wpil_error_reset_data_form', wpil_error_reset_data);

    $(document).click(function(e){
        if (!$(e.target).hasClass('.codes') && !$(e.target).parents('.codes').length) {
            $('#error_table_code_filter .codes').height(30);
            $(this).find('.dashicons-arrow-up').hide();
            $(this).find('.dashicons-arrow-down').show();
        }
    });

    function wpil_get_edit_error_links() {
        if($(this).hasClass('button-disabled')){
            return;
        }

        var links = wpil_get_checked_link_ids();
        $.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                links: links, 
                action: 'wpil_get_edit_error_links',
                nonce: $(this).data('nonce')
            },
            error: function (jqXHR, textStatus) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
            },
            success: function (response) {
                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error', 'success']);
                }

                if (response.error) {
                    wpil_swal(response.error.title, response.error.text, 'error');
                } else if (response.success) {
                    $('.wpil-activity-panel').empty().append(response.success.table);
                    $('.wpil-update-activity-items').addClass('active');
                    $('.wpil-edit-selected-activity-items').removeClass('inactive').addClass('active');
                }
            }
        });
    }

    function wpil_ignore_error_links() {
        if($(this).hasClass('button-disabled')){
            return;
        }

        var links = wpil_get_checked_link_ids();
        if(!links.length){
            return;
        }

        if (confirm("Are you sure you want to ignore the selected links?")) {
            $.ajax({
                type: 'POST',
                url: ajaxurl,
                data: {
                    links: links,
                    action: 'wpil_ignore_error_links',
                    nonce: $(this).data('nonce')
                },
                error: function (jqXHR, textStatus) {
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
                },
                success: function (response) {
                    if(!isJSON(response)){
                        response = extractAndValidateJSON(response, ['error', 'success']);
                    }

                    if (response.error) {
                        wpil_swal(response.error.title, response.error.text, 'error');
                    } else if (response.success) {
                        flushObjectCache();
                        location.reload();
                    }
                }
            });
        }
    }

    function wpil_snooze_error_links() {
        if($(this).hasClass('button-disabled')){
            return;
        }

        var links = wpil_get_checked_link_ids();
        if(!links.length){
            return;
        }

        if (confirm("Are you sure you want to snooze the selected links for 30 days?\n\nThis will remove them from the broken links report and Link Whisper will not scan them while they are snoozing.")) {
            $.ajax({
                type: 'POST',
                url: ajaxurl,
                data: {
                    links: links,
                    action: 'wpil_snooze_error_links',
                    nonce: $(this).data('nonce')
                },
                error: function (jqXHR, textStatus) {
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
                },
                success: function (response) {
                    if(!isJSON(response)){
                        response = extractAndValidateJSON(response, ['error', 'success']);
                    }

                    if (response.error) {
                        wpil_swal(response.error.title, response.error.text, 'error');
                    } else if (response.success) {
                        flushObjectCache();
                        location.reload();
                    }
                }
            });
        }
    }

    function wpil_get_checked_link_ids(){
        var links = [];
        $('#report_error table input[type="checkbox"]:checked').each(function () {
            if (parseInt($(this).data('id')) > 0) {
                links.push($(this).data('id'));
            }
        });

        return links;
    }

    function wpil_error_codes_update() {
        var codes = [];
        $('#error_table_code_filter input[type="checkbox"]:not(.check_all)').each(function(){
            if ($(this).prop('checked')) {
                codes.push($(this).data('code'));
            }
        });

        var post = '';
        var currentPost = parseInt($('#error_table_code_filter input[type="hidden"].current-post').val());
        if(currentPost){
            post = '&post_id=' + currentPost;
        }

        document.location.href = 'admin.php?page=link_whisper&type=error&codes='+codes.join(',')+post;
    }

    function wpil_toggle_available_codes(){
        var checked = $('#error_table_code_filter input.check_all').is(':checked');
        $('#error_table_code_filter input[type="checkbox"]:not(.check_all)').each(function(){
            if(checked){
                $(this).prop('checked', true);
            }else{
                $(this).prop('checked', false);
            }
        });
    }

    function wpil_error_codes_toggle() {
        var block = $('#error_table_code_filter .codes');
        if ($(this).hasClass('closed')) {
            $(this).find('.dashicons-arrow-down').hide();
            $(this).find('.dashicons-arrow-up').css('display', 'inline-block');
            block.css('height', 'auto');
            $(this).removeClass('closed');
            $(this).addClass('open');
        } else {
            $(this).find('.dashicons-arrow-up').hide();
            $(this).find('.dashicons-arrow-down').show();
            block.css('height', 30);
            $(this).removeClass('open');
            $(this).addClass('closed');
        }
    }

    //send request to proceed broken links search
    var globalErrorCount = 0;
    function wpil_error_process()
    {
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_error_process',
            },
            error: function (jqXHR, textStatus) {
                globalErrorCount++;

                if(globalErrorCount < 10){
                    wpil_error_process();
                    return;
                }

                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
            },
            success: function(response){

                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error', 'finish']);
                }

                // if there was an error
                if(response.error){
                    wpil_swal(response.error.title, response.error.text, 'error');
                    return;
                }

                // if there was no error, reset the error counter
                globalErrorCount = 0;

                $('.progress_count:first').css('width', response.percents + '%');
                $('.wpil-loading-status:first').text(response.status);
    
                if(response.finish){
                    wpil_swal('Success!', 'Synchronization has been completed.', 'success').then(function(){
                        location.reload();
                    });
                }else{
                    wpil_error_process();
                }
            }
        });
    }

    //send request to reset data about broken links
    function wpil_error_reset_data(e){
        e.preventDefault();
        var nonce = $(this).find('input[name="nonce"]').val();

        $(this).attr('disabled', true);
        $(this).find('button.button-primary').addClass('wpil_button_is_active');

        $.post(ajaxurl, {
            action: 'wpil_error_reset_data',
            nonce: nonce
        }, function(response){
            if(!isJSON(response)){
                response = extractAndValidateJSON(response, ['error', 'template']);
            }
            
            if (typeof response.error != 'undefined') {
                wpil_swal(response.error.title, response.error.text, 'error');
                return;
            } else if (typeof response.template != 'undefined') {
                $('#wpbody-content').html(response.template);
                wpil_error_process();
            }
        }, 'json');
    }

    //show progress bar and send search request if user interrupted the search
    if (typeof error_reset_run != 'undefined' && error_reset_run) {
        $.post(ajaxurl, {
            action: 'wpil_error_process',
            get_status: 1
        }, function(response){
            console.log(response);

            if(!isJSON(response)){
                response = extractAndValidateJSON(response, ['percents', 'status']);
            }

            $('.progress_count:first').css('width', response.percents + '%');
            $('.wpil-loading-status:first').text(response.status);
            wpil_error_process();
        });
    }

    $(document).on('change', '#wpil_error_table_post_filter select', wpil_report_filter);
    $(document).on('click', '#wpil_error_table_post_filter .wpil_error_table_filter_submit', wpil_report_filter_submit);

    function wpil_report_filter() {
        var block = $('#wpil_error_table_post_filter');

        var post_type = block.find('select[name="post_type"]').val();

        $('.wpil_filter_post_type:not(.' + post_type + ')').css({'display': 'none'});
        $('.wpil_filter_post_type.' + post_type).css({'display': 'block'});

        if($(this).attr('name') === 'post_type'){
            block.find('select[name="category"]').val(0);
        }
    }
    wpil_report_filter();

    function wpil_report_filter_submit() {
        var block = $(this).closest('div');
        var post_type = block.find('select[name="post_type"]').val();
        var category = block.find('select[name="category"]').val();
        var urlParams = parseURLParams(location.href);
        var codes = (urlParams.codes) ? 'codes=' + encodeURIComponent(urlParams.codes[0]) : '';
        var url = wpil_admin_url + 'admin.php?page=link_whisper&type=error&' + codes + '&post_type=' + post_type + '&category=' + category;

        location.href = url;
    }

    /**
     * Helper function that parses urls to get their query vars.
     **/
    function parseURLParams(url) {
        var queryStart = url.indexOf("?") + 1,
            queryEnd   = url.indexOf("#") + 1 || url.length + 1,
            query = url.slice(queryStart, queryEnd - 1),
            pairs = query.replace(/\+/g, " ").split("&"),
            parms = {}, i, n, v, nv;
    
        if (query === url || query === "") return;
    
        for (i = 0; i < pairs.length; i++) {
            nv = pairs[i].split("=", 2);
            n = decodeURIComponent(nv[0]);
            v = decodeURIComponent(nv[1]);
    
            if (!parms.hasOwnProperty(n)) parms[n] = [];
            parms[n].push(nv.length === 2 ? v : null);
        }
        return parms;
    }

})(jQuery);
