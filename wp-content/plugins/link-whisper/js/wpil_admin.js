"use strict";

(function ($)
{

    var reloadGutenberg = false;

    /////////// preloading
    function getSuggestions(manualActivate = false){
        var active = $('.wpil-suggestion-processing').length; // keep track of how many we have running at teh same teime

        $('[data-wpil-ajax-container]').not('.wpil-suggestion-processing').not('.wpil-suggestion-processed').each(function(k, el){
            if(active > 4){
                $(el).find('.progress_count').text('Waiting to Start...');
                return;
            }
            var $el = $(el);
            var url = $el.attr('data-wpil-ajax-container-url');
            var count = 0;
            var urlParams = parseURLParams(url);

            // don't load the suggestions automatically if the user has selected manual activation
            if($el.data('wpil-manual-suggestions') == 1 && !manualActivate){
                return
            }

            if(url.length < 1 || !urlParams){
                $el.addClass('wpil-suggestion-processed');
                return;
            }else{
                $el.addClass('wpil-suggestion-processing');
            }

            $el.css({'display': 'block'});
            $('.wpil-get-manual-suggestions-container').css({'display': 'none'});

			if(urlParams.type && 'outbound_suggestions_ajax' === urlParams.type[0]){
				ajaxGetSuggestionsOutbound($el, url, count);
			}

            active++;

            setupProcessingError();
        });
    }

    getSuggestions();

    var debounceSuggestions = null;
    $(document).on('click', '#wpil-get-manual-suggestions', function(e){e.preventDefault(); clearTimeout(debounceSuggestions); debounceSuggestions = setTimeout(function(){ getSuggestions(true); }, 100); });

    var globalSuggestionProgressTracker = {
        errorCount: 0
    };

	function ajaxGetSuggestionsOutbound($el, url, count, post_count = 0, key = null)
	{
        // if there isn't a key set, make one
        if(!key){
            while(true){
                key = Math.round(Math.random() * 1000000000);
                if(key > 999999){break;}
            }
        }

        var urlParams = parseURLParams(url);
        var post_id = (urlParams.post_id) ? urlParams.post_id[0] : null;
        var term_id = (urlParams.term_id) ? urlParams.term_id[0] : null;
        var keywords = (urlParams.keywords) ? urlParams.keywords[0] : '';
        var linkOrphaned = (urlParams.link_orphaned) ? urlParams.link_orphaned[0] : null;
        var sameParent = (urlParams.same_parent) ? urlParams.same_parent[0] : null;
        var sameCategory = (urlParams.same_category) ? urlParams.same_category[0] : '';
        var selectedCategory = (urlParams.selected_category) ? urlParams.selected_category[0].split(',') : '';
        var sameTag = (urlParams.same_tag) ? urlParams.same_tag[0] : '';
        var selectedTag = (urlParams.selected_tag) ? urlParams.selected_tag[0].split(',') : '';
        var linkToCategoryPages = (urlParams.link_to_category_pages) ? urlParams.link_to_category_pages[0] : '';
        var selectPostTypes = (urlParams.select_post_types) ? urlParams.select_post_types[0] : '';
        var selectedPostTypes = (urlParams.selected_post_types) ? urlParams.selected_post_types[0].split(',') : '';
        var aiRelatednessThreshold = (urlParams.ai_relatedness_threshold) ? urlParams.ai_relatedness_threshold[0]: '';
        var ignoreMaxLinkLimit = (urlParams.ignore_max_link_limit) ? urlParams.ignore_max_link_limit[0] : '';
        var nonce = (urlParams.nonce) ? urlParams.nonce[0]: '';

        if(!nonce){
            return;
        }

        // start the clock on the error notice
        setupProcessingError();

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'get_post_suggestions',
                nonce: nonce,
                count: count,
                post_count: (post_count) ? parseInt(post_count): 0,
                post_id: post_id,
                term_id: term_id,
                link_orphaned: linkOrphaned,
                same_parent: sameParent,
                same_category: sameCategory,
                selected_category: selectedCategory,
                same_tag: sameTag,
                selected_tag: selectedTag,
                link_to_category_pages: linkToCategoryPages,
                select_post_types: selectPostTypes,
                selected_post_types: selectedPostTypes,
                ai_relatedness_threshold: aiRelatednessThreshold,
                ignore_max_link_limit: ignoreMaxLinkLimit,
                type: 'outbound_suggestions',
                key: key,
            },
            success: function(response){
                globalSuggestionProgressTracker.errorCount = 0;
                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error', 'info', 'message', 'batch_size', 'post_count', 'finish']);
                }

                // stop the error clock and hide any visible message
                setupProcessingError(true);
                hideProcessingError();

                // if there was an error
                if(response.error){
                    // output the error message
                    wpil_swal(response.error.title, response.error.text, 'error');
                    // and exit
                    return;
                }

                // if there was a notice
                if(response.info){
                    // output the notice message
                    wpil_swal(response.info.title, response.info.text, 'info');
                    // and exit
                    return;
                }

                $el.find('.progress_count').html(response.message);
                var forceFinish = (undefined !== response.finish && response.finish === true);

				if((count * response.batch_size) < response.post_count && !forceFinish){
					ajaxGetSuggestionsOutbound($el, url, response.count, response.post_count, key);
				}else if( (sameCategory || sameTag || linkToCategoryPages) || (0 == wpil_ajax.site_linking_enabled) ){
					if(undefined !== response.ai_score && response.ai_score){
						return ajaxPerformAiSuggestionScoring($el, url, 'outbound_suggestions', key);
					}else{
						// if we're doing same tag or cat matching, skip the external sites.
						return updateSuggestionDisplay(
                            post_id, 
                            term_id, 
                            nonce, 
                            $el, 
                            'outbound_suggestions', 
                            linkOrphaned, 
                            sameParent, 
                            sameCategory, 
                            key, 
                            selectedCategory, 
                            sameTag, 
                            selectedTag, 
                            linkToCategoryPages,
                            null,
                            selectPostTypes, 
                            selectedPostTypes, 
                            aiRelatednessThreshold,
                            keywords
                        );
					}
				}else{
					// if we're doing same tag or cat matching, skip the external sites.
					return updateSuggestionDisplay(post_id, term_id, nonce, $el, 'outbound_suggestions', linkOrphaned, sameParent, sameCategory, key, selectedCategory, sameTag, selectedTag, linkToCategoryPages, null, selectPostTypes, selectedPostTypes, aiRelatednessThreshold, keywords);
				}
			},
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
                globalSuggestionProgressTracker.errorCount++;
                // if we haven't errored more than 5 times
                if(globalSuggestionProgressTracker.errorCount < 5){
                    // go around again after a short wait
                    setTimeout(function(){
                        console.log('trying to go around again...');
                        ajaxGetSuggestionsOutbound($el, url, count, post_count, key);
                    }, 10000);
                }
//				setupProcessingError(true);
            }
        });
    }

	function updateSuggestionDisplay(postId, termId, nonce, $el, type = 'outbound_suggestions', linkOrphaned, sameParent, sameCategory = '', key = null, selectedCategory, sameTag, selectedTag, linkToCategoryPages = '', linkFromCategoryPages = '', selectPostTypes, selectedPostTypes, aiRelatednessThreshold, keywords = ''){
                                    
        
        jQuery.ajax({
			type: 'POST',
			url: ajaxurl,
			data: {
				action: 'update_suggestion_display',
                nonce: nonce,
                post_id: postId,
                term_id: termId,
                key: key,
                type: type,
                link_orphaned: linkOrphaned,
                same_parent: sameParent,
                same_category: sameCategory,
                selected_category: selectedCategory,
                same_tag: sameTag,
                selected_tag: selectedTag,
                link_to_category_pages: linkToCategoryPages,
                link_from_category_pages: linkFromCategoryPages,
                select_post_types: selectPostTypes,
                selected_post_types: selectedPostTypes
            },
            success: function(response){
                // if there was an error
                if(response.error){
                    // output the error message
                    wpil_swal(response.error.title, response.error.text, 'error');
                    // and exit
                    return;
                }

                // update the suggestion report
				$el.html(response);
			}
		});
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

	$(document).on('click', '.sentence a', function (e) {
		e.preventDefault();
	});

    var same_category_loading = false;

    $(document).on('click', '#wpil-regenerate-suggestions', function(){
        if (!same_category_loading) {
            same_category_loading = true;
            var container = $(this).closest('[data-wpil-ajax-container]');
            var url = container.attr('data-wpil-ajax-container-url');
            var urlParams = parseURLParams(url);
            var linkOrphaned = container.find('#field_link_orphaned').prop('checked');
            var linkToCategoryPages = container.find('#field_link_to_category_pages').prop('checked');
            var sameParent = container.find('#field_same_parent').prop('checked');
            var linkFromCategoryPages = container.find('#field_link_from_category_pages').prop('checked');
            var sameCategory = container.find('#field_same_category').prop('checked');
            var selectedCategories = container.find('select[name="wpil_selected_category"]').val();
            var sameTag = container.find('#field_same_tag').prop('checked');
            var selectedTags = container.find('select[name="wpil_selected_tag"').val();
            var category_checked = '';
            var tag_checked = '';
            var post_id = (urlParams.post_id) ? urlParams.post_id[0] : 0;
            var postTypeSelect = container.find('#field_select_post_types').prop('checked');
            var postTypes = container.find('select[name="selected_post_types"]').val();
            var keywords = container.find('textarea[name="keywords"]').val();

            // remove any active filtering settings
            url = url.replace(new RegExp("(&link_orphaned[^&]*)|(&link_to_category_pages[^&]*)|(&same_parent[^&]*)|(&link_from_category_pages[^&]*)|(&same_category[^&]*)|(&same_tag[^&]*)|(&select_post_types[^&]*)|(&selected_category[^&]*)|(&selected_tag[^&]*)|(&selected_post_types[^&]*)|(&keywords[^&]*)", 'ig'), '');

            //link to orphaned
            if (linkOrphaned) {
                url += "&link_orphaned=true";
            }

            // only link to category pages
            if (linkToCategoryPages) {
                url += "&link_to_category_pages=true";
            }

            //same parent
            if (sameParent) {
                url += "&same_parent=true";
            }

            //only link from category pages
            if (linkFromCategoryPages) {
                url += "&link_from_category_pages=true";
            }

            //category
            if (sameCategory) {
                url += "&same_category=true";
                url += "&selected_category=" + selectedCategories.join(',');
                category_checked = 'checked="checked"';
            }

            //tag
            if (sameTag) {
                url += "&same_tag=true";
                url += "&selected_tag=" + selectedTags.join(',');
                tag_checked = 'checked="checked"';
            }

            // selected post types
            if(postTypeSelect && postTypes){
                url += "&select_post_types=true";
                url += "&selected_post_types=" + postTypes.join(',');
            }

            if(keywords){
                url += "&keywords=" + encodeURIComponent(keywords.replaceAll("\n", ';'));
            }

            if(urlParams.wpil_no_preload && '1' === urlParams.wpil_no_preload[0]){
                var checkAndButton = '<div style="margin-bottom: 30px;">' +
                        '<input style="margin-bottom: -5px;" type="checkbox" name="same_category" id="field_same_category_page" ' + category_checked + '>' +
                        '<label for="field_same_category_page">Only Link in This Post\'s Categories</label> <br>' +
                        '<input style="margin-bottom: -5px;" type="checkbox" name="same_tag" id="field_same_tag_page" ' + tag_checked + '>' +
                        '<label for="field_same_category_page">Only Suggest Posts with the Same Tags</label> <br>' +
                    '</div>' +
                    '<button id="inbound_suggestions_button" class="sync_linking_keywords_list button-primary" data-id="' + post_id + '" data-type="inbound_suggestions_page_container" data-page="inbound">Custom links</button>';
                container.html(checkAndButton);
            }else{
                container.html('<div class="progress_panel loader"><div class="progress_count" style="width: 100%"></div></div>');
            }

            if(urlParams.type && 'outbound_suggestions_ajax' === urlParams.type[0]){
                ajaxGetSuggestionsOutbound(container, url, 0);
            }

            same_category_loading = false;
        }
    });

    $(document).on('change', '#field_link_orphaned, #field_link_to_category_pages, #field_same_parent, #field_link_from_category_pages, #field_same_category, #field_same_tag, #field_select_post_types, select[name="wpil_selected_category"], select[name="wpil_selected_tag"], select[name="selected_post_types"], .wpil-suggestions-can-be-regenerated, #wpil_use_ai_suggestions', function(){
        var inputs = $('.wpil-suggestion-input');
        var changed = false;
        inputs.each(function(index, element){
            var el = $(element);
            var initial = el.data('suggestion-input-initial-value');

            if(el.hasClass('wpil-suggestions-can-be-regenerated')){
                return;
            }

            if(el.is("input") && el.attr('type') === 'checkbox' && el.is(":checked") != initial){
                changed = true;
            }else if(el.is("input") && el.attr('type') === 'hidden' && el.val() !== initial){
                changed = true;
            }else if(el.is("select") && initial.toString() !== el.val().join(',')){
                changed = true;
            }
        });

        if(changed){
            $('#wpil-regenerate-suggestions').removeClass('disabled').prop('disabled', false);
        }else{
            $('#wpil-regenerate-suggestions').addClass('disabled').prop('disabled', true);
        }
    });

    $(document).on('change', '#field_select_post_types,#field_same_tag,#field_same_category', function(){
        var name = $(this).attr('name');
		if($(this).is(":checked")){
			$('.wpil_styles .' + name + '-aux .select2, .' + name + '-aux').css({'display': 'inline-block'});
		}else{
			$('.wpil_styles .' + name + '-aux .select2, .' + name + '-aux').css({'display': 'none'});
		}
    });

    $(document).on('input change', 'input[name="wpil_sitemap_embedding_relatedness_threshold"],input[name="ai_relatedness_threshold"],input[name="wpil_suggestion_relatedness_threshold"],input[name="wpil_ai_auto_insert_relatedness_threshold"]', function(){
        var level = $(this).val();
        $(this).parent().find('.wpil-embedding-relatedness-threshold').text((parseFloat((level) * 100).toPrecision(3)) + '%');
    });

    var aiSuggestionsWait = false;
    $(document).on('change', '.ai-powered-suggestion-container #wpil_use_ai_suggestions', function(){
        clearTimeout(aiSuggestionsWait);
        aiSuggestionsWait = setTimeout(ajaxUpdateAiSuggestionsUse, 200);
    });

    function ajaxUpdateAiSuggestionsUse(){
        $.ajax({
            url: ajaxurl,
            dataType: 'json',
            data: {
                'action': 'wpil_set_use_ai_suggestions',
                'status': ($('#wpil_use_ai_suggestions').is(':checked') ? 1: 0),
                'nonce': $('#wpil_use_ai_suggestions').data('nonce')
            },
            method: 'post',
            error: function (jqXHR, textStatus, errorThrown) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});

                $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').removeClass('ajax_loader');
            },
            success: function (data) {

            }
        })
    }
    
    /*
    $(document).on('change', '#field_same_category_page', function(){
        var url = document.URL;
        if ($(this).prop('checked')) {
            url += "&same_category=true";
        } else {
            url = url.replace('/&same_category=true/g', '');
        }

        location.href = url;
    });
*/

    var suggestionInsertTracker = 0; // tracks suggestion insert processses
    $(document).on('click', '.sync_linking_keywords_list', function (e) {
        e.preventDefault();

        $('.wpil-top-insert-button').each(function(){
            var page = $(this).data('page');
            var links = [];
            var data = [];
            var button = $(this);
            var rows = [];

            if(page == 'inbound'){
                $(this).closest('form').find('.wpil-inbound-links').find('[wpil-link-new][type=checkbox]:checked').each(function() {
                    rows.push($(this).closest('tr'));
                    var item = {};
                    item.id = $(this).closest('tr').find('.sentence').data('id');
                    item.type = $(this).closest('tr').find('.sentence').data('type');
                    item.links = [{
                        'sentence': $(this).closest('tr').find('.sentence').find('[name="sentence"]').val(),
                        'sentence_with_anchor': $(this).closest('tr').find('.wpil_sentence_with_anchor').html(),
                        'custom_sentence': $(this).closest('tr').find('input[name="custom_sentence"]').val()
                    }];
                    data.push(item);
                });

            }else{
                $(this).closest('div:not(#wpil-inbound-suggestions-head-controls)').find('[wpil-link-new][type=checkbox]:checked').each(function() {
                    rows.push($(this).closest('tr'));
                    if ($(this).closest('tr').find('input[type="radio"]:checked').length) {
                        var id =  $(this).closest('tr').find('input[type="radio"]:checked').data('id');
                        var type = $(this).closest('tr').find('input[type="radio"]:checked').data('type');
                        var custom_link = $(this).closest('tr').find('input[type="radio"]:checked').data('custom');
                        var post_origin = $(this).closest('tr').find('input[type="radio"]:checked').data('post-origin');
                        var site_url = $(this).closest('tr').find('input[type="radio"]:checked').data('site-url');
                    } else {
                        var id =  $(this).closest('tr').find('.suggestion').data('id');
                        var type =  $(this).closest('tr').find('.suggestion').data('type');
                        var custom_link =  $(this).closest('tr').find('.suggestion').data('custom');
                        var post_origin = $(this).closest('tr').find('.suggestion').data('post-origin');
                        var site_url = $(this).closest('tr').find('.suggestion').data('site-url');
                    }

                    links.push({
                        id: id,
                        type: type,
                        custom_link: custom_link,
                        post_origin: post_origin,
                        site_url: site_url,
                        sentence: $(this).closest('div').find('[name="sentence"]').val(),
                        sentence_with_anchor: $(this).closest('div').find('.wpil_sentence_with_anchor').html(),
                        custom_sentence: $(this).closest('.sentence').find('input[name="custom_sentence"]').val()
                    });
                });
            }

            if(links.length < 1 && data.length < 1){
                return;
            }

            if (page == 'outbound') {
                data.push({'links': links});
            }else{
                button.addClass('wpil_button_is_active');
            }

            var data_post = {
                "id": $(this).data('id'),
                "type": $(this).data('type'),
                "page": $(this).data('page'),
                "action": 'wpil_save_linking_references',
                'data': data,
                'gutenberg' : $('.block-editor-page').length ? true : false
            };

            // if we're inserting links on the Links Report
            if($('.wpil-link-report').length > 0){
                data_post['from_links_report'] = 1;
                $('.wpil-activity-panel .wpil-activity-panel-suggestions').addClass('ajax_loader');
            }else{
                $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').not('.linkingstats').addClass('ajax_loader');
            }

            suggestionInsertTracker++;

            $.ajax({
                url: ajaxurl + '?action=wpil_save_linking_references',
                method: 'POST',
                data: JSON.stringify(data_post),
                contentType: 'application/json; charset=UTF-8',
                dataType: 'json',
                processData: false,
                timeout: 90000,
                error: function (jqXHR, textStatus, errorThrown) {
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});

                    $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').removeClass('ajax_loader');
                },
                success: function (data) {
                    suggestionInsertTracker--;
                    if(!isJSON(data)){
                        data = extractAndValidateJSON(data, ['err_msg', 'further_processing', 'data', 'affected_items']);
                    }

                    if (data.err_msg) {
                        wpil_swal('Error', data.err_msg, 'error');
                        button.removeClass('wpil_button_is_active');
                        $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').removeClass('ajax_loader');
                    } else if(isLinksReportRefreshActive()){
                        storeReportRefreshItems(button, data.affected_items);
                    }

                    if (data.err_msg) {
                        return;
                    } else if(undefined != data.further_processing && data.further_processing){
                        continueInsertingInboundLinks(button, data.data);
                    }else {
                        var reportRefreshItems = mergeReportRefreshItems(data.affected_items, getStoredReportRefreshItems(button));

                        if (page == 'outbound' && !isLinksReportRefreshActive()) {
                            if ($('.editor-post-save-draft').length) {
                                $('.editor-post-save-draft').click();
                            } else if ($('#save-post').length) {
                                $('#save-post').click();
                            } else if ($('.editor-post-publish-button').length) {
                                $('.editor-post-publish-button').click();
                            } else if ($('#publish').length) {
                                $('#publish').click();
                            } else if ($('.edit-tag-actions').length) {
                                $('.edit-tag-actions input[type="submit"]').click();
                            }

                            // set the flag so we know that the editor needs to be reloaded
                            reloadGutenberg = true;
                        } else if(!isLinksReportRefreshActive()){
                            location.reload();
                        }

                        for(var i in rows){
                            $(rows[i]).fadeOut(300, function(){ $(this).remove(); });
                        }

                        if(isLinksReportRefreshActive()){
                            refreshReportAfterMutation(reportRefreshItems);
                            clearStoredReportRefreshItems(button);
                        }

                        button.removeClass('wpil_button_is_active');
                        $('.ajax_loader').removeClass('ajax_loader');
                    }
                }
            });

        });
    });

    function continueInsertingInboundLinks(button, data){
        if(!button || !data){
            return;
        }

        // go over all the datas that have been given to us and remove any Inbound Internal Suggestion Rows that are checked and not on the list
        $('.chk-keywords:checked').each(function(index, element){
            var row = $(element).parents('tr.wpil-inbound-sentence');
            var postData = row.find('div.suggestion');

            if(postData.length > 0){
                var type = postData.data('type'); // saving sanity
                var id = postData.data('id');

                if(undefined != data[type] && undefined == data[type][id]){
                    row.fadeOut(300, function(){ $(this).remove(); });
                }
            }
        });

        var ajaxData = {
            "action": 'wpil_continue_inbound_saving_process',
            "target_id": button.data('id'),
            "target_type": button.data('type'),
            'data': data,
            'affected_items': getStoredReportRefreshItems(button)
        };

        $.ajax({
            url: ajaxurl,
            dataType: 'json',
            data: ajaxData,
            method: 'post',
            error: function (jqXHR, textStatus, errorThrown) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});

                $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').removeClass('ajax_loader');
            },
            success: function (response) {
                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['err_msg', 'further_processing', 'data', 'affected_items']);
                }

                if (response.err_msg) {
                    wpil_swal('Error', response.err_msg, 'error');
                    button.removeClass('wpil_button_is_active');
                    $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').removeClass('ajax_loader');
                } else if(undefined != response.further_processing && response.further_processing){
                    if(isLinksReportRefreshActive()){
                        storeReportRefreshItems(button, response.affected_items);
                    }
                    continueInsertingInboundLinks(button, response.data);
                } else{
                    button.removeClass('wpil_button_is_active');
                    $('.wpil_keywords_list, .tbl-link-reports .wp-list-table').removeClass('ajax_loader');
                    if(isLinksReportRefreshActive()){
                        refreshReportAfterMutation(mergeReportRefreshItems(response.affected_items, getStoredReportRefreshItems(button)));
                        clearStoredReportRefreshItems(button);
                    }else if($('.linkingstats').length < 1){
                        location.reload();
                    }
                }
            }
        })
    }

    function isLinksReportRefreshActive(){
        return ($('.wpil-link-report').length > 0 && $('#wpil-refresh-link-report-nonce').length > 0);
    }

    function getCurrentLinkReportSubType(){
        var type = $('#wpil-report-sub-type').val();
        return (type && type.length) ? type: 'links';
    }

    function getReportRefreshItemKey(id, type){
        return ((type === 'term') ? 'term': 'post') + '_' + parseInt(id, 10);
    }

    function normalizeReportRefreshItems(items){
        var normalized = [],
            seen = {};

        if(!$.isArray(items)){
            return normalized;
        }

        $.each(items, function(index, item){
            if(!item || undefined === item.id){
                return;
            }

            var id = parseInt(item.id, 10),
                type = (item.type === 'term') ? 'term': 'post';

            if(!id){
                return;
            }

            var key = getReportRefreshItemKey(id, type);
            if(seen[key]){
                return;
            }

            seen[key] = true;
            normalized.push({
                id: id,
                type: type,
                key: key
            });
        });

        return normalized;
    }

    function mergeReportRefreshItems(existingItems, newItems){
        return normalizeReportRefreshItems([].concat($.isArray(existingItems) ? existingItems: [], $.isArray(newItems) ? newItems: []));
    }

    function storeReportRefreshItems(target, items){
        if(!target || !target.length){
            return;
        }

        var existing = target.data('wpilReportAffectedItems');
        target.data('wpilReportAffectedItems', mergeReportRefreshItems(existing, items));
    }

    function getStoredReportRefreshItems(target){
        if(!target || !target.length){
            return [];
        }

        return normalizeReportRefreshItems(target.data('wpilReportAffectedItems'));
    }

    function clearStoredReportRefreshItems(target){
        if(target && target.length){
            target.removeData('wpilReportAffectedItems');
        }
    }

    function getVisibleReportRefreshItems(items){
        var visibleItems = [];

        $.each(normalizeReportRefreshItems(items), function(index, item){
            if(
                $('.tbl-link-reports tr[data-wpil-report-item-key="' + item.key + '"]').length > 0 ||
                $('.wpil-activity-panel .wpil-activity-panel-suggestions[data-wpil-report-item-key="' + item.key + '"]').length > 0
            ){
                visibleItems.push({
                    id: item.id,
                    type: item.type
                });
            }
        });

        return visibleItems;
    }

    function shouldDismissReportSuggestionArea(panel, state){
        if(!panel || !panel.length || !state){
            return false;
        }

        var reportSubType = getCurrentLinkReportSubType(),
            direction = (panel.data('wpilSuggestionDirection') === 'inbound') ? 'inbound': 'outbound';

        switch(reportSubType){
            case 'orphaned':
                return !state.is_orphaned;
            case 'link_density':
                return (direction === 'inbound') ? !state.needs_inbound_links: !state.needs_outbound_links;
            case 'link_relation':
                return !state.needs_link_quality_fix;
            default:
                return false;
        }
    }

    function maybeCloseEmptyReportActivityPanel(hadSuggestionAreas){
        if(!hadSuggestionAreas){
            return;
        }

        if($('.wpil-activity-panel .wpil-activity-panel-suggestions').length < 1){
            if(typeof closeActivityPanel === 'function'){
                closeActivityPanel();
            }else if(typeof closePanel === 'function'){
                closePanel();
            }
        }
    }

    function refreshReportSuggestionAreas(refreshedItems){
        var hadSuggestionAreas = ($('.wpil-activity-panel .wpil-activity-panel-suggestions').length > 0);

        $('.wpil-activity-panel .wpil-activity-panel-suggestions[data-wpil-report-item-key]').each(function(){
            var panel = $(this),
                key = panel.data('wpilReportItemKey'),
                item = (refreshedItems && undefined !== refreshedItems[key]) ? refreshedItems[key]: null;

            if(!item || !item.state){
                return;
            }

            if(shouldDismissReportSuggestionArea(panel, item.state)){
                panel.fadeOut(300, function(){
                    $(this).remove();
                });
            }
        });

        setTimeout(function(){
            maybeCloseEmptyReportActivityPanel(hadSuggestionAreas);
        }, 350);
    }

    function refreshReportAfterMutation(items){
        if(!isLinksReportRefreshActive()){
            return;
        }

        var refreshItems = getVisibleReportRefreshItems(items),
            nonce = $('#wpil-refresh-link-report-nonce').val();

        if(!refreshItems.length || !nonce){
            return;
        }

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: {
                action: 'wpil_refresh_link_report_rows',
                nonce: nonce,
                report_sub_type: getCurrentLinkReportSubType(),
                current_url: window.location.href,
                items: refreshItems,
            },
            success: function(response){
                console.log(response);

                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error', 'success']);
                }

                if(response.error){
                    wpil_swal(response.error.title, response.error.text, 'error');
                    return;
                }

                if(!response.success || !response.success.items){
                    return;
                }

                $.each(response.success.items, function(key, item){
                    var row = $('.tbl-link-reports tr[data-wpil-report-item-key="' + key + '"]');

                    if(item.state && item.state.remove_row && row.length > 0){
                        row.fadeOut(300, function(){
                            $(this).remove();
                        });
                        return;
                    }

                    if(row.length > 0 && item.cells){
                        $.each(item.cells, function(columnName, html){
                            var cell = row.find('.column-' + columnName);
                            if(cell.length){
                                cell.html(html);
                            }
                        });
                    }
                });

                runStandardTippy();
                refreshReportSuggestionAreas(response.success.items);
            }
        });
    }

    $(document).on('change', '#suggestion_filter_field', filterSuggestionsWaiter);
    $(document).on('keyup', '#suggestion_filter_field', filterSuggestionsWaiter);

    var filterSuggestionsWait = false;
    function filterSuggestionsWaiter(){
        clearTimeout(filterSuggestionsWait);
        filterSuggestionsWait = setTimeout(filterSuggestions, 500);
    }

    var filteringSuggestions = false;
    function filterSuggestions(){
        var keywords = $('#suggestion_filter_field').val();
        var inbound = ($('.wpil-inbound-links').length > 0) ? true: false;

        // exit if the suggestion table isn't currently being filtered for keywords and there are no keywords
        if(!filteringSuggestions && '' === keywords){
            return;
        }

        filteringSuggestions = true;

        // close any open editors
        var editors = $('[id^="wp-wpil_editor"][id$="-wrap"]');
        editors.each(function(index, element){
            var block = $(element).closest('.sentence');
            if(block.length > 0){
                wpil_editor_remove(block);
            }
        });

        // if there are no keywords, show all suggestions and close the dropdowns
        if(keywords === '' || keywords.trim() === ''){
            $('.wpil-active').removeClass('wpil-active');
            $('.hidden-suggestion').removeClass('hidden-suggestion');
            $('.wpil-content').css({'display':'none'});
            filteringSuggestions = false;
            return;
        }else if(keywords.length > 0){
            keywords = keywords.trim().toLowerCase().split("\n");
        }

        // go over each suggestion
        $('.wpil-inbound-links tr:not(.wpil-suggestion-table-heading), .wpil-outbound-links tr:not(.wpil-suggestion-table-heading)').each(function(index, element){
            var wrapper = $(element).find('.wpil-collapsible-wrapper');
            var visibleCount = 0;

            // if the suggested post has a dropdown selector
            if(wrapper.length > 0){
                // go over each suggestion and hide the ones without the filter words
                $(element).find('.wpil-content li').each(function(index, element2){
                    if(inbound){
                        var text = $(element2).find('.wpil_sentence_with_anchor').text().trim().toLowerCase();
                    }else{
                        var text = $(element2).find('.suggested-post-title').text().trim().toLowerCase();
                    }
                    var hasKeyword = false;
                    var hasNegativeKeyword = false;
                    var doingKeywordSearch = false;
                    var doingNegativeMatch = false;
    
                    for(var i in keywords){
                        // check if the a negative char is used
                        var negativeMatch = keywords[i].length > 1 && keywords[i].charAt(0) === '-';
    
                        if(!hasKeyword && false === negativeMatch && -1 !== text.indexOf(keywords[i])){ // if the suggestion has the keyword somewhere
                            hasKeyword = true;
                        }else if(!hasNegativeKeyword && true === negativeMatch && -1 !== text.indexOf(keywords[i].slice(1))){ // if the suggestion has a keyword the user doesn't want
                            hasNegativeKeyword = true;
                        }
    
                        if(negativeMatch){
                            doingNegativeMatch = true;
                        }else{
                            doingKeywordSearch = true;
                        }
                    }
    
                    if(	(!hasKeyword && !doingNegativeMatch) || 
                        (hasNegativeKeyword) || 
                        (doingKeywordSearch && doingNegativeMatch && !hasNegativeKeyword && !hasKeyword))
                    {
                        $(element2).addClass('hidden-suggestion');
                    }else{
                        $(element2).removeClass('hidden-suggestion');
                        visibleCount++;
                    }
                });

                var containers = $(element).find('.wpil-collapsible-wrapper, .wpil-collapsible');
                if(visibleCount === 0){
                    if($(containers[0]).hasClass('wpil-active')){ $(containers[0]).removeClass('wpil-active'); }
                    if($(containers[1]).hasClass('wpil-active')){ $(containers[1]).removeClass('wpil-active'); }
                    $(element).find('.wpil-content').css({'display':'none'});
                    $(element).addClass('hidden-suggestion');
                }else{
                    if(!$(containers[0]).hasClass('wpil-active')){ $(containers[0]).addClass('wpil-active'); }
                    if(!$(containers[1]).hasClass('wpil-active')){ $(containers[1]).addClass('wpil-active'); }
                    $(element).removeClass('hidden-suggestion');
                    $(element).find('.wpil-content').css({'display':'block'});

                    // select the top sentence and set it to be the top_level_sentence
                    if(!$(element).find('.chk-keywords').is(':checked')){
                        var firstVisible = $(element).find('.wpil-content li:not(.hidden-suggestion) input').first();
                        var id = $(firstVisible).data('id');
                        var data = $(firstVisible).closest('li').find('.data').html();

                        if(inbound){
                            $(firstVisible).closest('ul').find('input').prop('checked', false);
                            $(firstVisible).prop('checked', true);
                            $(firstVisible).closest('.wpil-collapsible-wrapper').find('.sentence').html(data + '<span class="wpil_edit_sentence">| <a href="javascript:void(0)">Edit Sentence</a></span>');
                            $(firstVisible).closest('tr').find('input[type="checkbox"]').prop('checked', false);
                            $(firstVisible).closest('tr').find('.raw_html').hide();
                            $(firstVisible).closest('tr').find('.raw_html[data-id="' + id + '"]').show();
                        }else{
                            var type = $(firstVisible).data('type');
                            var suggestion = $(firstVisible).data('suggestion');
                            var origin = $(firstVisible).data('post-origin');
                            var siteUrl = $(firstVisible).data('site-url');

                            $(firstVisible).closest('ul').find('input').prop('checked', false);

                            $(firstVisible).prop('checked', true);
                            $(firstVisible).closest('.wpil-collapsible-wrapper').find('.wpil-collapsible-static').html('<div data-id="' + id + '" data-type="' + type + '" data-post-origin="' + origin + '" data-site-url="' + siteUrl + '">' + data + '<span class="add_custom_link_button link-form-button"> | <a href="javascript:void(0)"><span class="dashicons dashicons-edit"></span></a></span><span class="wpil_add_link_to_ignore link-form-button"> | <a href="javascript:void(0)">Ignore Suggested Page</a></span></div>');
                            $(firstVisible).closest('tr').find('input[type="checkbox"]').prop('checked', false);
                            $(firstVisible).closest('tr').find('input[type="checkbox"]').val(suggestion + ',' + id);

                            if (!$(firstVisible).closest('tr').find('input[data-wpil-custom-anchor]').length && $(firstVisible).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').length) {
                                $(firstVisible).closest('tr').find('.sentences > div').hide();
                                $(firstVisible).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').show();
                            }
                        };
                    }
                }
            }else{
                if(inbound){
                    var text = $(element).find('.wpil_sentence_with_anchor').text().trim().toLowerCase();
                }else{
                    var text = $(element).find('.suggested-post-title').text().trim().toLowerCase();
                }
                var hasKeyword = false;
                var hasNegativeKeyword = false;
                var doingKeywordSearch = false;
                var doingNegativeMatch = false;

                for(var i in keywords){
                    // check if the a negative char is used
                    var negativeMatch = keywords[i].length > 1 && keywords[i].charAt(0) === '-';

                    if(!hasKeyword && false === negativeMatch && -1 !== text.indexOf(keywords[i])){ // if the suggestion has the keyword somewhere
                        hasKeyword = true;
                    }else if(!hasNegativeKeyword && true === negativeMatch && -1 !== text.indexOf(keywords[i].slice(1))){ // if the suggestion has a keyword the user doesn't want
                        hasNegativeKeyword = true;
                    }

                    if(negativeMatch){
                        doingNegativeMatch = true;
                    }else{
                        doingKeywordSearch = true;
                    }
                }

                if(	(!hasKeyword && !doingNegativeMatch) || 
                    (hasNegativeKeyword) || 
                    (doingKeywordSearch && doingNegativeMatch && !hasNegativeKeyword && !hasKeyword))
                {
                    $(element).addClass('hidden-suggestion');
                }else{
                    $(element).removeClass('hidden-suggestion');
                }
            }
        });
    }

    $(document).on('change', '#field_ai_relatedness_threshold', filterSuggestionsAiRelatedWaiter);
    $(document).on('keyup', '#field_ai_relatedness_threshold', filterSuggestionsAiRelatedWaiter);

    var filterSuggestionsAiRelatedWait = false;
    function filterSuggestionsAiRelatedWaiter(){
        clearTimeout(filterSuggestionsAiRelatedWait);
        filterSuggestionsAiRelatedWait = setTimeout(filterSuggestionsAiRelated, 500);
    }

    var filteringSuggestions = false;
    function filterSuggestionsAiRelated(){
        var relatedness = $('#field_ai_relatedness_threshold').val();
        var inbound = ($('.wpil-inbound-links').length > 0) ? true: false;
        var initial = $('#field_ai_relatedness_threshold').data('suggestion-input-initial-value');

        if(inbound){
            var sortType = 'ai_post_relatedness_score'; // TODO: Add sentence based sorting when we have that working
            //var sortType = 'ai_relatedness_score';
        }else{
            var sortType = ($('#wpil-outbound-suggestions-sorting-select').val() === 'wpil-ai-post-relatedness-score') ? 'wpil-ai-post-relatedness-score': 'wpil-ai-sentence-relatedness-score';
            //var sortType = 'wpil-ai-relatedness-score'; // TODO: 
        }

        // exit if the suggestion table isn't currently being filtered for keywords and there are no keywords
        if(!filteringSuggestions && '0' === relatedness){
            return;
        }

        filteringSuggestions = true;

        // close any open editors
        var editors = $('[id^="wp-wpil_editor"][id$="-wrap"]');
        editors.each(function(index, element){
            var block = $(element).closest('.sentence');
            if(block.length > 0){
                wpil_editor_remove(block);
            }
        });

        // if there are no keywords, show all suggestions and close the dropdowns
        if(relatedness === '0' || initial == relatedness){
            $('.wpil-active').removeClass('wpil-active');
            $('.hidden-suggestion').removeClass('hidden-suggestion');
            $('.wpil-content').css({'display':'none'});
            filteringSuggestions = false;
            return;
        }

        // go over each suggestion
        $('.wpil-inbound-links tr:not(.wpil-suggestion-table-heading), .wpil-outbound-links tr:not(.wpil-suggestion-table-heading)').each(function(index, element){
            var wrapper = $(element).find('.wpil-collapsible-wrapper');
            var visibleCount = 0;

            // if the suggested post has a dropdown selector
            if(wrapper.length > 0){
                // go over each suggestion and hide the ones that aren't related enough
                $(element).find('.wpil-content li').each(function(index, element2){
                    if(inbound){
                        var elementRelatedness = $(element2).find('[name="' + sortType + '"]').val();
                    }else{
                        var elementRelatedness = $(element2).data(sortType);
                    }
    
                    if(elementRelatedness < relatedness)
                    {
                        $(element2).addClass('hidden-suggestion');
                    }else{
                        $(element2).removeClass('hidden-suggestion');
                        visibleCount++;
                    }
                });

                var containers = $(element).find('.wpil-collapsible-wrapper, .wpil-collapsible');
                if(visibleCount === 0){
                    if($(containers[0]).hasClass('wpil-active')){ $(containers[0]).removeClass('wpil-active'); }
                    if($(containers[1]).hasClass('wpil-active')){ $(containers[1]).removeClass('wpil-active'); }
                    $(element).find('.wpil-content').css({'display':'none'});
                    $(element).addClass('hidden-suggestion');
                }else{
                    if(!$(containers[0]).hasClass('wpil-active')){ $(containers[0]).addClass('wpil-active'); }
                    if(!$(containers[1]).hasClass('wpil-active')){ $(containers[1]).addClass('wpil-active'); }
                    $(element).removeClass('hidden-suggestion');
                    $(element).find('.wpil-content').css({'display':'block'});

                    // select the top sentence and set it to be the top_level_sentence
                    if(!$(element).find('.chk-keywords').is(':checked')){
                        var firstVisible = $(element).find('.wpil-content li:not(.hidden-suggestion) input').first();
                        var id = $(firstVisible).data('id');
                        var data = $(firstVisible).closest('li').find('.data').html();

                        if(inbound){
                            $(firstVisible).closest('ul').find('input').prop('checked', false);
                            $(firstVisible).prop('checked', true);
                            $(firstVisible).closest('.wpil-collapsible-wrapper').find('.sentence').html(data + '<span class="wpil_edit_sentence">| <a href="javascript:void(0)">Edit Sentence</a></span>');
                            $(firstVisible).closest('tr').find('input[type="checkbox"]').prop('checked', false);
                            $(firstVisible).closest('tr').find('.raw_html').hide();
                            $(firstVisible).closest('tr').find('.raw_html[data-id="' + id + '"]').show();
                        }else{
                            var type = $(firstVisible).data('type');
                            var suggestion = $(firstVisible).data('suggestion');
                            var origin = $(firstVisible).data('post-origin');
                            var siteUrl = $(firstVisible).data('site-url');

                            $(firstVisible).closest('ul').find('input').prop('checked', false);

                            $(firstVisible).prop('checked', true);
                            $(firstVisible).closest('.wpil-collapsible-wrapper').find('.wpil-collapsible-static').html('<div data-id="' + id + '" data-type="' + type + '" data-post-origin="' + origin + '" data-site-url="' + siteUrl + '">' + data + '<span class="add_custom_link_button link-form-button"> | <a href="javascript:void(0)"><span class="dashicons dashicons-edit"></span></a></span><span class="wpil_add_link_to_ignore link-form-button"> | <a href="javascript:void(0)">Ignore Suggested Page</a></span></div>');
                            $(firstVisible).closest('tr').find('input[type="checkbox"]').prop('checked', false);
                            $(firstVisible).closest('tr').find('input[type="checkbox"]').val(suggestion + ',' + id);

                            if (!$(firstVisible).closest('tr').find('input[data-wpil-custom-anchor]').length && $(firstVisible).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').length) {
                                $(firstVisible).closest('tr').find('.sentences > div').hide();
                                $(firstVisible).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').show();
                            }
                        };
                    }
                }
            }else{
                if(inbound){
                    var elementRelatedness = $(element).find('[name="' + sortType + '"]').val();
                }else{
                    var elementRelatedness = $(element).find('.dated-outbound-suggestion').data(sortType);
                }

                if(elementRelatedness < relatedness)
                {
                    $(element).addClass('hidden-suggestion');
                }else{
                    $(element).removeClass('hidden-suggestion');
                }
            }
        });
    }

    /** Related Posts Widget Controls */
    $(document).on('keyup', '#link-whisper-related-posts-search', searchForRelatedPosts);
    var relatedPostSearchWait;
    function searchForRelatedPosts(e){
        clearTimeout(relatedPostSearchWait);
        var search = $(e.target).val();
        if(search.length > 3){
            relatedPostSearchWait = setTimeout(function(){
                ajaxSearchRelatedPosts();
            }, 750);
        }else{
            $('#link-whisper-related-posts-search-results').empty();
            $('#link-whisper-related-posts-add-posts, #link-whisper-related-posts-search-results-title').css({'display': 'none'});
            $('#link-whisper-related-posts-search-container').removeClass('searching');
        }
    }

    /**
     * Makes the request for posts and updates the related post metabox with the results
     **/
    function ajaxSearchRelatedPosts(){
        var search = $('#link-whisper-related-posts-search').val(),
            selected = $('#link-whisper-related-posts-link-list .link-whisper-related-posts-item input:checked'),
            selectedIds = [],
            nonce = $('#link-whisper-related-posts-nonce').val();

        // hide the "add posts" button when we start searching
        $('#link-whisper-related-posts-add-posts, #link-whisper-related-posts-search-results-title').css({'display': 'none'});
        // show the loader
        $('#link-whisper-related-posts-search-container').addClass('searching');

        selected.each(function(index, element){
            selectedIds.push($(element).data('post-id'));
        });

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_search_related_posts',
                search: search,
                selected_ids: selectedIds,
                nonce: nonce,
            },
            error: function (jqXHR, textStatus) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
            },
            success: function(response){

                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['success', 'error']);
                }

                // if there was an error
                if(response.error){
                    wpil_swal(response.error.title, response.error.text, 'error');
                    return;
                }
                
                if(response.success){
                    $('#link-whisper-related-posts-search-results').empty().html(response.success.content);
                    if(response.success.found > 0){
                        $('#link-whisper-related-posts-add-posts, #link-whisper-related-posts-search-results-title').css({'display': 'block'});
                    }else{
                        $('#link-whisper-related-posts-add-posts, #link-whisper-related-posts-search-results-title').css({'display': 'none'});
                    }
                }
            },
            complete: function(){
                // hide the loading animation when the search is ended
                $('#link-whisper-related-posts-search-container').removeClass('searching');
            }
        });
    }

    $(document).on('click', '#link-whisper-related-posts-add-posts', addSelectedRelatedPosts);
    function addSelectedRelatedPosts(){
        var related = $('#link-whisper-related-posts-search-results-container .link-whisper-related-posts-item input:checked').parents('li');
        if(related.length < 1){
            return;
        }

        $('#link-whisper-related-posts-link-list').append(related.detach());
        $('#link-whisper-related-posts-add-posts').addClass('disabled');
        activateSaveRelatedPostsButton();
    }

    $(document).on('change', '#link-whisper-related-posts-enable', toggleRelatedPostsActive);
    function toggleRelatedPostsActive(e){
        if($(e.target).is(':checked')){
            $('#link-whisper-related-posts-content-container').removeClass('wpil-section-disabled').removeClass('hidden');
            $('.wpil-related-posts-enable-helptext.unchecked').addClass('hidden');
            $('.wpil-related-posts-enable-helptext.checked').removeClass('hidden');
        }else{
            $('#link-whisper-related-posts-content-container').addClass('wpil-section-disabled');
            $('.wpil-related-posts-enable-helptext.checked').addClass('hidden');
            $('.wpil-related-posts-enable-helptext.unchecked').removeClass('hidden');
        }

        activateSaveRelatedPostsButton();
    }

    $(document).on('change', '#link-whisper-related-posts-search-results input:checked', toggleAddItemButton);
    function toggleAddItemButton(){
        var items = $('#link-whisper-related-posts-search-results input:checked');
        if(items.length > 0){
            $('#link-whisper-related-posts-add-posts').removeClass('disabled');
        }else{
            $('#link-whisper-related-posts-add-posts').addClass('disabled');
        }
    }

    $(document).on('change', '#link-whisper-related-posts-link-list input', activateSaveRelatedPostsButton);
    function activateSaveRelatedPostsButton(){
        $('#link-whisper-related-posts-save').removeClass('disabled');
    }

    function disableSaveRelatedPostsButton(){
        $('#link-whisper-related-posts-save').addClass('disabled');
    }

    $(document).on('click', '#link-whisper-related-posts-save', saveSelectedRelatedPosts);
    function saveSelectedRelatedPosts(){
        var	active = $('#link-whisper-related-posts-enable').is(':checked'),
            selected = $('#link-whisper-related-posts-link-list .link-whisper-related-posts-item input:checked'),
            selectedIds = [],
            postId = $('#link-whisper-related-posts-current-post').val(),
            nonce = $('#link-whisper-related-posts-nonce').val();

        selected.each(function(index, element){
            selectedIds.push($(element).data('post-id'));
        });

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            data: {
                action: 'wpil_save_related_posts',
                active: active,
                post_id: postId,
                selected_ids: selectedIds,
                nonce: nonce,
            },
            error: function (jqXHR, textStatus) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(wpil_report_next_step());
            },
            success: function(response){
                if(!isJSON(response)){
                    response = extractAndValidateJSON(response, ['error']);
                }

                // if there was an error
                if(response.error){
                    wpil_swal(response.error.title, response.error.text, 'error');
                    return;
                }

                // remove any unchecked posts from the Related Posts box
                $('#link-whisper-related-posts-link-list .link-whisper-related-posts-item input').not(':checked').parents('li.link-whisper-related-posts-item').remove();
                // deactivate the save button
                disableSaveRelatedPostsButton();
            }
        });
    }



    /** /Related Posts Widget Controls */


    function stristr(haystack, needle, bool)
    {
        // http://jsphp.co/jsphp/fn/view/stristr
        // +   original by: Kevin van Zonneveld (http://kevin.vanzonneveld.net)
        // +   bugfxied by: Onno Marsman
        // *     example 1: stristr('Kevin van Zonneveld', 'Van');
        // *     returns 1: 'van Zonneveld'
        // *     example 2: stristr('Kevin van Zonneveld', 'VAN', true);
        // *     returns 2: 'Kevin '
        var pos = 0;

        haystack += '';
        pos = haystack.toLowerCase().indexOf((needle + '').toLowerCase());

        if (pos == -1) {
            return false;
        } else {
            if (bool) {
                return haystack.substr(0, pos);
            } else {
                return haystack.slice(pos);
            }
        }
    }

    function wpil_handle_errors(resp)
    {
        if (stristr(resp, "520") && stristr(resp, "unknown error") && stristr(resp, "Cloudflare")) {
            wpil_swal('Error', "It seems you are using CloudFlare and CloudFlare is hiding some error message. Please temporary disable CloudFlare, open reporting page again, look if it has any new errors and send it to us", 'error')
                .then(wpil_report_next_step);
            return true;
        }

        if (stristr(resp, "504") && stristr(resp, "gateway")) {
            wpil_swal('Error', "504 error: Gateway timeout - please ask your hosting support about this error", 'error')
                .then(wpil_report_next_step);
            return true;
        }

        return false;
    }

    function wpil_report_next_step()
    {
        location.reload();
    }

    /**
     * Makes the call to reset the report data when the user clicks on the "Reset Data" button.
     **/
    function resetReportData(e){
        e.preventDefault();
        var form = $(this);
        var nonce = form.find('[name="reset_data_nonce"]').val();
    
        if(!nonce || form.attr('disabled')){
            return;
        }
        
        // disable the reset button
        form.attr('disabled', true);
        // add a color change to the button indicate it's disabled
        form.find('button.button-primary').addClass('wpil_button_is_active');
        processReportReset(nonce, 0, true);
    }

    /**
     * Makes the call to reset the report data when the user clicks on the "Reset Data" button.
     **/
    function resumeReportData(e){
        e.preventDefault();

        var form = $(this).parents('form');
        var nonce = form.find('[name="reset_data_nonce"]').val();

        if(!nonce || form.attr('disabled')){
            return;
        }

        // disable the reset button
        form.attr('disabled', true);
        // add a color change to the button indicate it's disabled
        $(this).addClass('wpil_button_is_active');
        // and hide the "New Link Scan" button
        form.find('button.button-primary').css({'opacity': '0.3'});
        processReportData(nonce, 0, 0, 0, 0, false, false, 0, true);
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
                var resp = jqXHR.responseText;

                if (wpil_handle_errors(resp)) {
                    wpil_report_next_step();
                    return;
                }

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
                        $('#wpbody-content').html(response.loading_screen);
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

    // listen for clicks on the "Reset Data" button
    $('#wpil_report_reset_data_form').on('submit', resetReportData);

    // also listen for when the user wants to resume an existing scan
    $('#wpil_report_reset_data_form .wpil-resume-link-scan').on('click', resumeReportData);

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
                    var resp = jqXHR.responseText;
                    if (wpil_handle_errors(resp)) {
                        wpil_report_next_step();
                        return;
                    }

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
                    animateTheReportLoadingBar(response);

					// and show the user a success message!
					wpil_swal('Success!', 'The Link Scan is complete!', 'success').then(wpil_report_next_step);
					return;
				} else if(response.link_processing_complete){
					// if we've finished loading links into the link table
					// show the post processing loading page
					if(response.loading_screen){
						$('#wpbody-content').html(response.loading_screen);
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
                        $('#wpbody-content').html(response.loading_screen);
                    }
                    // console.log the time if available
                    if(timeList > 1){
                        console.log('The meta processing took: ' + (timeList[(timeList.length - 1)] - timeList[0]) + ' seconds.');
                    }

                    // update the loading bar
                    animateTheReportLoadingBar(response);

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
                        animateTheReportLoadingBar(response);
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
    function animateTheReportLoadingBar(response){
        // get the loading display
        var loadingDisplay = $('#wpbody-content .wpil-loading-screen');
        // create some variable to update the display with
        var percentCompleted = Math.floor((response.link_posts_processed/response.link_posts_to_process_count) * 100);
        var displayedStatus = percentCompleted + '%' + ((response.links_filled) ? (', ' + response.link_posts_processed + '/' + response.link_posts_to_process_count) : '') + ' ' + wpil_ajax.completed;

        // update the display with the new info
        loadingDisplay.find('.wpil-loading-status').text(displayedStatus);
        loadingDisplay.find('.progress_count').css({'width': percentCompleted + '%'});
    }

    /**
     * Runs Tippy and generates the standard tooltips for a page
     **/
    function runStandardTippy(){
        var toTip = $('.wpil-tippy-tooltipped');
        if(toTip.length < 1){
            return;
        }

        toTip.each(function(index, element){
            var el = $(element);
            if(el.data('wpilTooltipContent')){
                var args = {
                    content: el.data('wpilTooltipContent'),
                    onShow(instance){
                        var target = $(instance.reference);
                        if(target.attr('data-wpil-tooltip-theme') === 'delete-post'){
                            target.parents('span.delete').css({'display': 'inline-block', 'margin-right': '4px'});
                        }
                    }
                };

                if(el.data('wpilTooltipPlacement')){
                    args['placement'] = el.data('wpilTooltipPlacement');
                }

                if(el.data('wpilTooltipInteractive')){
                    args['interactive'] = true;
                }

                if(el.data('wpilTooltipAllowhtml')){
                    args['allowHTML'] = true;
                }

                if(el.data('wpilTooltipMaxwidth')){
                    args['maxWidth'] = parseInt(el.data('wpilTooltipMaxwidth'));
                }

                if(el.data('wpilTooltipTheme')){
                    args['theme'] = el.data('wpilTooltipTheme');
                }

                var tip = tippy(element, args);

                if(el.data('wpilShowAfterDelay')){
                    setTimeout(function(){
                        tip.show();
                    }, el.data('wpilShowAfterDelay') * 1000);
                    
                }
            }
        });
    }
    $(document).on('click', '#wpil-tippy-tooltip-target', runStandardTippy);

    $(document).on('click', '.wpil-collapsible', function (e) {
        if ($(this).hasClass('wpil-no-action') ||
            $(e.target).hasClass('wpil_word') || 
            $(e.target).hasClass('add-internal-links') ||
            $(e.target).hasClass('add-outbound-internal-links') ||
            $(e.target).hasClass('add_custom_link_button') ||
            $(e.target).hasClass('add_custom_link') || 
            $(e.target).parents('.add_custom_link').length || 
            $(this).find('.custom-link-wrapper').length > 0 || 
            $(this).find('.wp-editor-wrap').length > 0 ||
            $(e.target).hasClass('wpil-reload-sentence-with-anchor') ||
            $(e.target).hasClass('button-primary') ||
            $(e.target).hasClass('button-secondary') ||
            $(e.target).parent().hasClass('wpil_edit_sentence') ||
            $(e.target).parents('a').hasClass('add-internal-links') ||
            $(e.target).parents('a').hasClass('add-outbound-internal-links')
        ) 
        {
            return;
        }

        // exit if the user clicked the "Add" button in the link report
        if($(e.srcElement).hasClass('add-internal-links') || $(e.srcElement).hasClass('add-outbound-internal-links')){
            return;
        }
        e.preventDefault();

        var $el = $(this);
        var $content = $el.closest('.wpil-collapsible-wrapper').find('.wpil-content');
        var cl_active = 'wpil-active';
        var wrapper = $el.parents('.wpil-collapsible-wrapper');

        if ($el.hasClass(cl_active)) {
            $el.removeClass(cl_active);
            wrapper.removeClass(cl_active);
            $content.hide();
        } else {
            // if this is the link report or target keyword report or autolink table or the domains table
            if($('.tbl-link-reports').length || $('#wpil_target_keyword_table').length || $('#wpil_keywords_table').length || $('#report_domains').length){
                // hide any open dropdowns in the same row
                $(this).closest('tr').find('td .wpil-collapsible').removeClass('wpil-active');
                $(this).closest('tr').find('td .wpil-collapsible-wrapper').removeClass('wpil-active');
                $(this).closest('tr').find('td .wpil-collapsible-wrapper').find('.wpil-content').hide();
                if(!$(this).parents('.wpil-collapsible-wrapper').hasClass('wpil-secondary-collapsible')){
                    $(this).closest('tr').find('.wpil-quick-links-button').removeClass('wpil-active');
                }
            }
            $el.addClass(cl_active);
            wrapper.addClass(cl_active);
            $content.show();
        }
    });

    $(document).on('click', '#select_all', function () {
        if ($(this).prop('checked')) {
            if ($('.best_keywords').hasClass('outbound')) {
                $(this).closest('table').find('.sentence:visible input[type="checkbox"].chk-keywords:visible').prop('checked', true);
            } else {
                $(this).closest('table').find('input[type="checkbox"].chk-keywords:visible').prop('checked', true);
            }

            $('.suggestion-select-all').prop('checked', true);
        } else {
            $(this).closest('table').find('input[type="checkbox"].chk-keywords').prop('checked', false);
            $('.suggestion-select-all').prop('checked', false);
        }
    });

    $(document).on('click', '.best_keywords.outbound .wpil-collapsible-wrapper input[type="radio"]', function () {
        var id = $(this).data('id');
        var data = $(this).closest('li').find('.data').html();
        var type = $(this).data('type');
        var suggestion = $(this).data('suggestion');
        var origin = $(this).data('post-origin');
        var siteUrl = $(this).data('site-url');

        var additionalData = [
            'data-wpil-post-published-date="' + $(this).data('wpil-post-published-date') + '"',
            'data-wpil-suggestion-score="' + $(this).data('wpil-suggestion-score') + '"',
            'data-wpil-inbound-internal-links="' + $(this).data('wpil-inbound-internal-links') + '"',
            'data-wpil-outbound-internal-links="' + $(this).data('wpil-outbound-internal-links') + '"',
            'data-wpil-outbound-external-links="' + $(this).data('wpil-outbound-external-links') + '"',
            'data-wpil-ai-post-relatedness-score="' + $(this).data('wpil-ai-post-relatedness-score') + '"',
            'data-wpil-ai-sentence-relatedness-score="' + $(this).data('wpil-ai-sentence-relatedness-score') + '"',
        ];

        $(this).closest('ul').find('input').prop('checked', false);

        $(this).prop('checked', true);
        $(this).closest('tr').find('input[type="checkbox"]').prop('checked', false);
        $(this).closest('tr').find('input[type="checkbox"]').val(suggestion + ',' + id);

        if (!$(this).closest('tr').find('input[data-wpil-custom-anchor]').length && $(this).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').length) {
            $(this).closest('tr').find('.sentences > div').hide();
            $(this).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').show();
        }
    });

    /**
     * Asks the user if they want to consign a post to the trash when they click the "Trash Post" button
     **/
    $(document).on('click', '.wpil-trash-post-link', function (e) {
        e.preventDefault();

        var rowItem = $(this),
            trashLink = rowItem.attr('href');

        if(trashLink.length < 1){
            return;
        }

        if ((wpil_ajax.dismissed_popups && wpil_ajax.dismissed_popups['link_report_trash_post'] !== 1)) {
            var popupWrapper = document.createElement('div');
            $(popupWrapper).append('Please confirm that you want to put this page in the trash. This will remove the page from your site and put it in the trash, not just remove it from the report. <br><br> <input type="checkbox" id="wpil-perma-dismiss-popup" data-wpil-popup-name="link_report_trash_post"><span style="font-size: 12px;">(Don\'t show this again)</span>');
            wpil_swal({
                'title': 'Notice:', 
                content: popupWrapper, 
                'icon': 'info',
                buttons: {
                    cancel: true,
                    confirm: true,
                }
            }).then((trash) => {
                if (trash) {
                    rowItem.closest('tr').css({'opacity': 0.4});
                    $.post(trashLink, function(){
                        rowItem.closest('tr').fadeOut(300);
                    });
                }

                var checkbox = $('#wpil-perma-dismiss-popup');
                if(checkbox.is(':checked') && wpil_ajax.dismiss_popup_nonce){
                    $.ajax({
                        type: 'POST',
                        url: ajaxurl,
                        data: {
                            action: 'wpil_dismiss_popup_notice',
                            popup_name: checkbox.data('wpil-popup-name'),
                            nonce: wpil_ajax.dismiss_popup_nonce,
                        },
                        complete: function (data) {
                            console.log('ignoring complete!');
                            wpil_ajax.dismissed_popups['link_report_trash_post'] = 1;
                        }
                    })
                }
            });
        }else{
            rowItem.closest('tr').css({'opacity': 0.4});
            $.post(trashLink, function(){
                rowItem.closest('tr').fadeOut(300);
            });
        }
    });

	$(document).ready(function(){
		var saving = false;
        runStandardTippy();

		$(document).on('click', '#select_all', function () {
			if ($(this).prop('checked')) {
				$(this).closest('table').find('input[type="checkbox"]').prop('checked', true);
			} else {
				$(this).closest('table').find('input[type="checkbox"]').prop('checked', false);
			}
		});

		$(document).on('click', '.best_keywords .wpil-collapsible-wrapper input[type="radio"]', function(){
			var data = $(this).closest('li').find('.data').html();
			var id = $(this).data('id');
			var type = $(this).data('type');
			var suggestion = $(this).data('suggestion');
			$(this).closest('ul').find('input').prop('checked', false);

			$(this).prop('checked', true);
			$(this).closest('.wpil-collapsible-wrapper').find('.wpil-collapsible-static').html('<div data-id="' + id + '" data-type="' + type + '">' + data + '</div>');
			$(this).closest('tr').find('input[type="checkbox"]').prop('checked', false);
			$(this).closest('tr').find('input[type="checkbox"]').val(suggestion + ',' + id);

			if (!$(this).closest('tr').find('input[data-wpil-custom-anchor]').length && $(this).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').length) {
				$(this).closest('tr').find('.sentences > div').hide();
				$(this).closest('tr').find('.sentence[data-id="'+id+'"][data-type="'+type+'"]').show();
			}
		});

		$(document).on('click', '.link_copy', function(){
			$(this).blur();
			var row = $(this).closest('tr');
			var link = row.find('.post-slug:first').attr('href');


			copyTextToClipboard(link);

			// if Classic or Gutenberg are visible, show the success panel that allows scrolling to the text
			if( $('#wp-content-wrap:visible').length || (wp.blockEditor && $('.block-editor-block-list__layout.is-root-container:visible').length) ){
				wpil_swal({
					title: 'Success!',
					text: 'Link copied successfully!',
					icon: 'success',
					buttons: ['OK', 'Scroll To Text'],
				}).then((scroll) => {
					if (scroll) {
						focusTextSelection(row);
					}
				});
			}else{
				// if the standard editors aren't available, show the old popup
				wpil_swal({
					title: 'Success!',
					text: 'Link copied successfully!',
					icon: 'success',
				});
			}
		});

		function fallbackCopyTextToClipboard(text) {
			var textArea = document.createElement("textarea");
			textArea.value = text;
			document.body.appendChild(textArea);
			textArea.focus();
			textArea.select();

			try {
				var successful = document.execCommand('copy');
				var msg = successful ? 'successful' : 'unsuccessful';
				console.log('Fallback: Copying text command was ' + msg);
			} catch (err) {
				console.error('Fallback: Oops, unable to copy', err);
			}

			document.body.removeChild(textArea);
		}

		function copyTextToClipboard(text) {
			if (!navigator.clipboard) {
				fallbackCopyTextToClipboard(text);
				return;
			}
			navigator.clipboard.writeText(text).then(function() {
				console.log('Async: Copying to clipboard was successful!');
			}, function(err) {
				console.error('Async: Could not copy text: ', err);
			});
		}

		function focusTextSelection(row){
			// get the sentence
			var sentence = decodeURIComponent(atob($(row.find('input[name="sentence"]')[0]).val()));

			// get the anchor text
			var anchorText = row.find('.sentence a').filter(':visible').text();

			// deselect any active selections
			$('#wpil-free-highlight').contents().unwrap();

			if($('#wp-content-wrap').length){ // Classic
				var tinyMCEVisible = $("#wp-content-wrap").hasClass("tmce-active");

				if(tinyMCEVisible){
					var element = $("#content_ifr").contents().find('*:contains("' + sentence + '"):last');

					// if we couldn't pull the sentence
					if(element.length < 1){
						// try pulling the suggested link
						var element = $("#content_ifr").contents().find('*:contains("' + anchorText + '"):last');
						sentence = anchorText;
					}

					// if we have the element that contains the sentence
					if(element.length){
						// obtain the element's inner html
						var elementContent = $(element[0]).html().toString();
						// create a new sentence that focuses on the anchor
						var newSentence = sentence.replace(anchorText, '<wpil-free-highlight id="wpil-free-highlight">' + anchorText + '</wpil-free-highlight>');
						// replace the old sentence with the new one
						elementContent = elementContent.replace(sentence, newSentence);
						// update the element's html with the new tags
						$(element[0]).html(elementContent);
						var newElement = $(element).find('#wpil-free-highlight').get();
						newElement = newElement[0];
						// remove the custom tags to create a text node with no tags
						$(newElement).contents().unwrap();
						// find the new text node
						var found = false;
						$(element).contents().each(function(index, node){
							if($(node).text() === anchorText){
								SelectText(node);
								scrollVisualModeToStartElement(window.tinymce.get( 'content' ), element);
								$("#content_ifr").focus();
								found = true;
							}
						});

						if(!found){
							$(element).contents().each(function(index, node){
								if($(node).text().indexOf(anchorText) > 0){
									var start = $(element[0]).text().indexOf(anchorText, $(element[0]).text().indexOf(sentence));
									node.setSelectionRange(start, start + anchorText.length);
									scrollVisualModeToStartElement(window.tinymce.get( 'content' ), element);
									$("#content_ifr").focus();
								}
							});
						}
					}
					
				}else{
					var element = $("#wp-content-editor-container textarea.wp-editor-area");

					if(element.length){
						var start = $(element[0]).text().indexOf(anchorText, $(element[0]).text().indexOf(sentence));
						element[0].setSelectionRange(start, start + anchorText.length);
						element[0].focus();
					}
				}

			}else if(wp.blockEditor && $('.block-editor-block-list__layout.is-root-container').length){ // Gutenberg
				var windowHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
				var element = $(".block-editor-block-list__layout.is-root-container").contents().find('*:contains("' + sentence + '"):last');
				var found = false;

				// if we couldn't find the block with the first check
				if(element.length < 1){
					// go over the elements a different way to try and find the block
					$(".block-editor-block-list__layout.is-root-container").contents().each(function(index, block){
							var sentenceCheck = $(block).html().toString().indexOf(sentence);
							if(!found && sentenceCheck !== -1){
								element = $(block);
								found = true;
							}
						}
					);
				}
				
				// if we have the element that contains the sentence
				if(element.length){
					// remove any pre-existing highlights
					$('#wpil-free-highlight').contents().unwrap();
					// obtain the element's inner html
					var elementContent = $(element[0]).html().toString();
					// create a new sentence that focuses on the anchor
					var newSentence = sentence.replace(anchorText, '<wpil-free-highlight id="wpil-free-highlight">' + anchorText + '</wpil-free-highlight>');
					// replace the old sentence with the new one
					elementContent = elementContent.replace(sentence, newSentence);
					// update the element's html with the new tags
					$(element[0]).html(elementContent);
					// select the new element
					var newElement = $(element).find('#wpil-free-highlight').get();
					// establish the point that we'll be scrolling to
					var scrollPoint = $('.edit-post-visual-editor').offset().top - $(newElement[0]).offset().top;
					scrollPoint = scrollPoint - 61 + (windowHeight / 2);
					// scroll to the point
					$('.interface-interface-skeleton__content').animate( {
						scrollTop: Math.abs(parseInt(scrollPoint))
					}, 1000 );
				}
			}
		}

		function SelectText(element) {
			var frame = document.getElementById("content_ifr"), 
				win = (frame) ? frame.contentWindow : window,
				doc = (frame) ? frame.contentWindow.document : document,
				range, 
				selection;    
			if (doc.body.createTextRange) {
				range = doc.body.createTextRange();
				range.moveToElementText(element);
				range.select();
			} else if (win.getSelection) {
				selection = win.getSelection();        
				range = doc.createRange();
				range.selectNodeContents(element);
				selection.removeAllRanges();
				selection.addRange(range);
			}
		}

		/**
		 * Scrolls the content to place the selected element in the center of the screen.
		 *
		 * Takes an element, that is usually the selection start element, selected in
		 * `focusHTMLBookmarkInVisualEditor()` and scrolls the screen so the element appears roughly
		 * in the middle of the screen.
		 *
		 * In order to achieve the proper positioning, the editor media bar and toolbar are subtracted
		 * from the window height, to get the proper viewport window, that the user sees.
		 *
		 * @param {Object} editor TinyMCE editor instance.
		 * @param {Object} element HTMLElement that should be scrolled into view.
		 */
		 function scrollVisualModeToStartElement( editor, element ) {
			var elementTop = editor.$( element ).offset().top,
				TinyMCEContentAreaTop = editor.$( editor.getContentAreaContainer() ).offset().top,

				toolbarHeight = getToolbarHeight( editor ),

				edTools = $( '#wp-content-editor-tools' ),
				edToolsHeight = 0,
				edToolsOffsetTop = 0,

				$scrollArea;

			if ( edTools.length ) {
				edToolsHeight = edTools.height();
				edToolsOffsetTop = edTools.offset().top;
			}

			var windowHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight,

				selectionPosition = TinyMCEContentAreaTop + elementTop,
				visibleAreaHeight = windowHeight - ( edToolsHeight + toolbarHeight );

			// There's no need to scroll if the selection is inside the visible area.
			if ( selectionPosition < visibleAreaHeight ) {
//				return;
			}

			/**
			 * The minimum scroll height should be to the top of the editor, to offer a consistent
			 * experience.
			 *
			 * In order to find the top of the editor, we calculate the offset of `#wp-content-editor-tools` and
			 * subtracting the height. This gives the scroll position where the top of the editor tools aligns with
			 * the top of the viewport (under the Master Bar)
			 */
			var adjustedScroll;
			if ( editor.settings.wp_autoresize_on) {
				$scrollArea = $( 'html,body' );
				adjustedScroll = selectionPosition - visibleAreaHeight / 2; //Math.max( selectionPosition - visibleAreaHeight / 2, edToolsOffsetTop - edToolsHeight );
			} else {
				$scrollArea = $( editor.contentDocument ).find( 'html,body' );
				adjustedScroll = elementTop;
			}

			$scrollArea.animate( {
				scrollTop: parseInt( adjustedScroll, 10 )
			}, 1000 );
		}

		/**
		 * Returns the height of the editor toolbar(s) in px.
		 *
		 * @since 3.9.0
		 *
		 * @param {Object} editor The TinyMCE editor.
		 * @return {number} If the height is between 10 and 200 return the height,
		 * else return 30.
		 */
		 function getToolbarHeight( editor ) {
		 	var $$ = window.tinymce.$;
			var node = $$( '.mce-toolbar-grp', editor.getContainer() )[0],
				height = node && node.clientHeight;

			if ( height && height > 10 && height < 200 ) {
				return parseInt( height, 10 );
			}

			return 30;
		}

		// remove any highlighted text on post save
		$(document).on('click', '.editor-post-publish-button, #wpil-free-highlight', function(){
			$('#wpil-free-highlight').contents().unwrap();
		});

		$(window).on('load', function(){
			if ($('#lw_banner').length) {
				// if the user has clicked on the "close" button on the "Upgrade to Premium" CTA in the Report screen
				$('#lw_banner .close').click(function(){
					// make an ajax call to permanently hide the CTA
					$.ajax({
						type: 'POST',
						url: wpil_ajax.ajax_url,
						data: {
							action: 'dismiss_premium_notice',
						},
						success: function(response){
							console.log(response);
							$('#lw_banner').remove();
						},
					});
				});
			}
		});
	});

    /**
     * Asks the user if they want to consign multiple posts to the trash when they click the bulk "Trash Post" button
     **/
    $(document).on('click', '#wpil_links_trash_selected', function () {
        if($('.tbl-link-reports #the-list .checkall input.wpil-report-post-checkbox:checked').length < 1){
            return;
        }

        if ((wpil_ajax.dismissed_popups && wpil_ajax.dismissed_popups['link_report_trash_post'] !== 1)) {
            var popupWrapper = document.createElement('div');
            $(popupWrapper).append('Please confirm that you want to put these pages in the trash. This will remove them from your site and put it in the trash, not just remove them from the report. <br><br> <input type="checkbox" id="wpil-perma-dismiss-popup" data-wpil-popup-name="link_report_trash_post"><span style="font-size: 12px;">(Don\'t show this again)</span>');
            wpil_swal({
                'title': 'Notice:', 
                content: popupWrapper, 
                'icon': 'info',
                buttons: {
                    cancel: true,
                    confirm: true,
                }
            }).then((trash) => {
                if (trash) {
                    $('.tbl-link-reports #the-list .checkall input.wpil-report-post-checkbox:checked').each(function () {
                        var parent = $(this).parents('tr'),
                            trashLink = parent.find('.wpil-trash-post-link').attr('href');
                        parent.css({'opacity': 0.4});
                        $.post(trashLink, function(){
                            parent.fadeOut(300);
                        });
                    });
                }

                var checkbox = $('#wpil-perma-dismiss-popup');
                if(checkbox.is(':checked') && wpil_ajax.dismiss_popup_nonce){
                    $.ajax({
                        type: 'POST',
                        url: ajaxurl,
                        data: {
                            action: 'wpil_dismiss_popup_notice',
                            popup_name: checkbox.data('wpil-popup-name'),
                            nonce: wpil_ajax.dismiss_popup_nonce,
                        },
                        complete: function (data) {
                            console.log('ignoring complete!');
                            wpil_ajax.dismissed_popups['link_report_trash_post'] = 1;
                        }
                    })
                }
            });
        }else{
            $('.tbl-link-reports #the-list .checkall input.wpil-report-post-checkbox:checked').each(function () {
                var parent = $(this).parents('tr'),
                    trashLink = parent.find('.wpil-trash-post-link').attr('href');
                parent.css({'opacity': 0.4});
                $.post(trashLink, function(){
                    parent.fadeOut(300);
                });
            });
        }
    });

    $(document).on('click', '#wpil_links_ignore_orphaned_selected', function () {
        if($('.tbl-link-reports #the-list .checkall input.wpil-report-post-checkbox:checked').length < 1){
            return;
        }

        var data = {
            action: 'wpil_ignore_orphaned_post',
            post_ids: [],
            nonce: $(this).data('nonce')
        };

        $('.tbl-link-reports #the-list .checkall input.wpil-report-post-checkbox:checked').each(function () {
            var check = $(this);
            data.post_ids.push(check.data('post-id'));
        });

        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: data,
            error: function (jqXHR, textStatus, errorThrown) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});
            },
            success: function(response){
                $('.tbl-link-reports #the-list .checkall input.wpil-report-post-checkbox:checked').parents('tr').fadeOut(300);
            }
        });
    });

    //ignore link in error reports // old table version
    /*$(document).on('click', '.column-url .row-actions .wpil_ignore_link', function () {
        var el = $(this);
        var parent = el.parents('.column-url');
        var data = {
            url: el.data('url'),
            anchor: el.data('anchor'),
            post_id: el.data('post_id'),
            post_type: el.data('post_type'),
            link_id: typeof el.data('link_id') !== 'undefined' ? el.data('link_id') : ''
        };

        if (el.hasClass('wpil_ignore_link')) {
            var rowParent = el.closest('tr');
        } else {
            var rowParent = el.closest('li');
        }

        parent.html('<div style="margin-left: calc(50% - 16px);" class="la-ball-clip-rotate la-md"><div></div></div>');

        $.post('admin.php?page=link_whisper&type=ignore_link', data, function(){
            rowParent.fadeOut(300);
        });
    });*/

    //ignore link in error reports 
    $(document).on('click', '.wpil_ignore_link', function () {
        var el = $(this);
        var parent = el.parents('.column-url');
        var data = {
            url: el.data('url'),
            anchor: el.data('anchor'),
            post_id: el.data('post_id'),
            post_type: el.data('post_type'),
            link_id: typeof el.data('link_id') !== 'undefined' ? el.data('link_id') : ''
        };

        if (el.hasClass('wpil_ignore_link')) {
            var rowParent = $('td.checkbox [data-broken-link-id="' + data.link_id + '"]').closest('tr');
        } else {
            var rowParent = el.closest('li');
        }

        parent.html('<div style="margin-left: calc(50% - 16px);" class="la-ball-clip-rotate la-md"><div></div></div>');

        $.post('admin.php?page=link_whisper&type=ignore_link', data, function(){
            rowParent.fadeOut(300);
        });
    });

    $(document).on('click', '.wpil-action-panel-button.wpil_edit_link', function (e) {
        e.preventDefault();
        var links = [$(this).data('broken-link-id')];

        $('.wpil-activity-panel').empty();
        closeActionPanel();
        animateActivityPanel($(this).data('activity-panel-title'));

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
                    toggleActivitySelectedDeleteButton();
                }
            }
        });
    });

    $(document).on('click', '.wpil_stop_ignore_link', function () {
        var el = $(this);
        var parent = el.parents('.column-url');
        var data = {
            url: el.data('url'),
            anchor: el.data('anchor'),
            post_id: el.data('post_id'),
            post_type: el.data('post_type'),
            link_id: typeof el.data('link_id') !== 'undefined' ? el.data('link_id') : ''
        };

        if (el.hasClass('wpil_stop_ignore_link')) {
            var rowParent = $('td.checkbox [data-broken-link-id="' + data.link_id + '"]').closest('tr');
        } else {
            var rowParent = el.closest('li');
        }

        parent.html('<div style="margin-left: calc(50% - 16px);" class="la-ball-clip-rotate la-md"><div></div></div>');

        $.post('admin.php?page=link_whisper&type=stop_ignore_link', data, function(){
            rowParent.fadeOut(300);
        });
    });

    function getReportPage(){
        if($('#report_domains').length > 0){
            return 'domain_report';
        }else if ($('.tbl-link-reports').length > 0){
            return ($('#wpil-report-sub-type').length > 0) ? $('#wpil-report-sub-type').val(): 'link_report';
        }else if ($('#report_clicks').length > 0){
            return 'click_report';
        }else if ($('#report_sitemaps').length > 0){
            return 'sitemap_report';
        }else if ($('#report_error').length > 0){
            return 'error_report';
        }else{
            return 'unknown_report';
        }
    }

    // ignore an orphaned post from the link report
    $(document).on('click', '.wpil-ignore-orphaned-post', function (e) {
        e.preventDefault();
        var el = $(this);

        if (confirm("Are you sure you want to ignore this post on the Orphaned Posts view? It will still be visible on the Internal Links Report and you can re-add the post to the Orphaned Posts from the settings.")) {
            var el = $(this);
            var data = {
                action: 'wpil_ignore_orphaned_post',
                post_ids: [el.data('post-id')],
                nonce: el.data('nonce')
            };
            jQuery.ajax({
                type: 'POST',
                url: ajaxurl,
                dataType: 'json',
                data: data,
                error: function (jqXHR, textStatus, errorThrown) {
                    var wrapper = document.createElement('div');
                    $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                    $(wrapper).append(jqXHR.responseText);
                    wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});
                },
                success: function(response){

                    if(!isJSON(response)){
                        response = extractAndValidateJSON(response, ['error', 'success']);
                    }

                    if(response.success){
                        if (el.hasClass('wpil-ignore-orphaned-post')) {
                            el.closest('tr').fadeOut(300);
                        } else {
                            el.closest('li').fadeOut(300);
                        }
                    }else if(response.error){
                        wpil_swal(response.error.title, response.error.text, 'error');
                    }
                }
            });
        }
    });

    $(document).ready(function(){
        runStandardTippy();
        var saving = false;

        if (typeof wp.data != 'undefined' && typeof wp.data.select('core/editor') != 'undefined') {
            wp.data.subscribe(function () {
                if (document.body.classList.contains( 'block-editor-page' ) && !saving && reloadGutenberg) {
                    saving = true;
                    setTimeout(function(){
                        $.post( ajaxurl, {action: 'wpil_editor_reload', post_id: $('#post_ID').val()}, function(data) {
                            if (data == 'reload') {
                                location.reload();
                            }

                            saving = false;
                            reloadGutenberg = false;
                        });
                    }, 3000);
                }
            });
        }

        $('.wpil-hamburger-filter-option').each(function() {
            var option = $(this);
            var fields = option.find('.wpil-hamburger-filter-fields');

            option.on('mouseenter', function() {
                fields.css('max-height', fields.prop('scrollHeight') + 'px');
            });

            option.on('mouseleave', function() {
                fields.css('max-height', '0');
            });
        });

        if ($('#post_ID').length) {
            return;
            $.post( ajaxurl, {action: 'wpil_is_outbound_links_added', id: $('#post_ID').val(), type: 'post'}, function(data) {
                if (data == 'success' && (wpil_ajax.dismissed_popups && wpil_ajax.dismissed_popups['suggestions'] !== 1)) {
                    var wrapper = document.createElement('div');
                    $(wrapper).append('Links have been added successfully! <br><br> <input type="checkbox" id="wpil-perma-dismiss-popup" data-wpil-popup-name="suggestions"><span style="font-size: 12px;">(Don\'t show this again)</span>');
                    wpil_swal({'title': 'Success', content: wrapper, 'icon': 'success'}).then(() => {
                        var checkbox = $('#wpil-perma-dismiss-popup');
                        var nonce = (checkbox.data('wpil-popup-name') === 'suggestion') ? $('div[data-wpil-ajax-container=""]').data('wpil-suggestion-nonce'): '';
                        if(checkbox.is(':checked') && nonce){
                            $.ajax({
                                type: 'POST',
                                url: ajaxurl,
                                data: {
                                    action: 'wpil_dismiss_popup_notice',
                                    popup_name: checkbox.data('wpil-popup-name'),
                                    nonce: nonce,
                                },
                                complete: function (data) {
                                    console.log('ignoring complete!');
                                }
                            })
                        }
                    });
                }
            });
        }

        if ($('#inbound_suggestions_page').length) {
            var id  = $('#inbound_suggestions_page').data('id');
            var type  = $('#inbound_suggestions_page').data('type');

            $.post( ajaxurl, {action: 'wpil_is_inbound_links_added', id: id, type: type}, function(data) {
                if (data == 'success' && (!wpil_ajax.dismissed_popups || (wpil_ajax.dismissed_popups && wpil_ajax.dismissed_popups['suggestions'] === undefined || wpil_ajax.dismissed_popups['suggestions'] !== 1))) {
                    var popupWrapper = document.createElement('div');
                    $(popupWrapper).append('Links have been added successfully! <br><br> <input type="checkbox" id="wpil-perma-dismiss-popup" data-wpil-popup-name="suggestions"><span style="font-size: 12px;">(Don\'t show this again)</span>');
                    wpil_swal({'title': 'Success', content: popupWrapper, 'icon': 'success'}).then(() => {
                        var checkbox = $('#wpil-perma-dismiss-popup');
                        var nonce = wpil_ajax.dismiss_popup_nonce;
                        if(checkbox.is(':checked') && nonce){
                            $.ajax({
                                type: 'POST',
                                url: ajaxurl,
                                data: {
                                    action: 'wpil_dismiss_popup_notice',
                                    popup_name: checkbox.data('wpil-popup-name'),
                                    nonce: nonce,
                                },
                                complete: function (data) {
                                    console.log('ignoring complete!');
                                }
                            })
                        }
                    });
                }
            });
        }

        /** Animating the Dashboard loading **/
        var globalDashboardUpdate = {
            error_count: 0
        };

        if($('.wpil-wizard-loading-dashboard').length > 0){
            function loadDashboardDuringScan(){
                // obtain the dashboard data via ajax
                $.ajax({
                    type: "POST",
                    url: ajaxurl,
                    data: {
                        action: 'wpil_get_dashboard_scan_loading_data',
                        nonce: $('.wpil-wizard-loading-dashboard-nonce').val()
                    },
                    error: function (jqXHR, textStatus, errorThrown) {
                        globalDashboardUpdate.error_count += 1;
        
                        // if the scan has errored less than 5 times, try it again
                        if(globalDashboardUpdate.error_count < 5){
                            loadDashboardDuringScan();
                        }else{
                            var wrapper = document.createElement('div');
                            $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                            $(wrapper).append(jqXHR.responseText);
                            wpil_swal({"title": "Error", "content": wrapper, "icon": "error"}).then(function(){
                                location.reload();
                            });
                        }
                    },
                    success: function(response){
                        console.log(response);

                        if(response.data){
                            // reset the error counter
                            globalDashboardUpdate.error_count = 0;
                            // if we have post scanning data
                            if(response.data.post_scanning){
                                $('.wpil-report-stats-posts-crawled').html(response.data.post_scanning.posts_crawled);
                                $('.wpil-report-stats-link-coverage').html(response.data.post_scanning.link_coverage);
                                $('.wpil-report-stats-relation-score').html(response.data.post_scanning.link_relation_score);
                                $('.wpil-report-stats-external-focus').html(response.data.post_scanning.external_site_focus);
                                $('.wpil-report-stats-anchor-quality').html(response.data.post_scanning.anchor_quality);

                                $('.wpil-report-stats-links-found').html(response.data.post_scanning.links_found);
//                                $('.wpil-report-stats-internal-links').html(response.data.post_scanning.internal_links);
/*
                                var topDomainsWidget = $('#report_dashboard_domains');
                                var topDomainContent = '';
                                if(response.data.post_scanning.top_domains && response.data.post_scanning.top_domains.length){
                                    var topCount = response.data.post_scanning.top_domains[0].link_count;
                                    for(var i in response.data.post_scanning.top_domains){
                                        var domain = response.data.post_scanning.top_domains[i];
                                        topDomainContent += '\
                                            <div>\
                                                <div class="count">' + domain.link_count + '</div>\
                                                <div class="host">' + domain.host + '</div>\
                                            </div>\
                                            <div class="line line'+i+'"><span style="width: '+ ((domain.link_count/topCount)*100) + '%"></span></div>';
                                    }
                                }

                                if(topDomainContent.length > 0){
                                    topDomainsWidget.html(topDomainContent);
                                }*/
/*
                                var anim = $('#wpil_links_chart').jqChart('option', 'animation'),
                                    data = $('#wpil_links_chart').jqChart('option', 'series');

                                // if the chart hasn't loaded with data yet
                                if(!internal && !external){
                                    // set the data variables so that on the next go around we can disable the animation
                                    internal = response.data.post_scanning.internal_links; // these
                                    external = response.data.post_scanning.external_links;
                                }else{
                                    anim['enabled'] = false;
                                }
                                data[0].data[0][1] = response.data.post_scanning.internal_links;
                                data[0].data[1][1] = response.data.post_scanning.external_links;
                                $('#wpil_links_chart').jqChart('update');*/
                            }

                            // determine what is the longest running process and what percent of completion it has
                            var longestTime = null,
                                longestProcess = null,
                                notCompleted = [],
                                notCompletedDisplay = [];
                            for(var j in response.data){
                                var dat = response.data[j];
                                console.log(dat);
                                if(dat.estimated_completion_time > 0 || undefined === dat.percent_complete){
                                    notCompleted.push(j);
                                    notCompletedDisplay.push(dat.display_name);
                                }

                                if(dat.estimated_completion_time > 0 && dat.estimated_completion_time > longestTime){
                                    longestTime = dat.estimated_completion_time;
                                    longestProcess = j;
                                }
                            }

                            if(undefined !== response.data.link_scanning && response.data.link_scanning.percent_complete){
                                if(response.data.link_scanning.percent_complete < 100){
                                    $('.wpil-report-download-banner .progress_count').css({'width': response.data.link_scanning.percent_complete + '%'});
                                    createDashboardCountdownClock(response.data.link_scanning.estimated_completion_time);
                                }else{
                                    if(longestTime){
                                        $('.wpil-report-download-banner .progress_count').css({'width': response.data[longestProcess].percent_complete + '%'});
                                        createDashboardCountdownClock(longestTime);
                                    }
                                }
                            }

                            // if there aren't any more processes to run
                            if(notCompleted.length < 1 || response.data.finished || response.data.running_autolinks){
                                // stop the loader 
                                clearInterval(interval);
                                // update the loading bar to 100%
                                $('.wpil-report-download-banner .progress_count').css({'width': '100%'});
                                // update the clock
                                createDashboardCountdownClock(0);

                                // hide the tooltips if they are active
                                $('#wpil-help-overlay-controls .close-overlay').trigger('click');
                                // otherwise, show the completion popup
                                var wrapper = document.createElement('div');
                                $(wrapper).append('Link Whisper is fully setup and ready for you!');
                                wpil_swal({'title': 'Success', content: wrapper, 'icon': 'success'}).then(() => {
                                    var pageUrl = new URL(window.location.href);
                                    if (pageUrl.searchParams.has('loading')) {
                                        // remove the loading parameter
                                        pageUrl.searchParams.delete('loading');
                                        // update the URL in the address bar without reloading
                                        window.history.pushState({}, '', pageUrl);
                                    }
                                    // and reload the page
                                    window.location.reload();
                                });
                            }else{
                                $('.wpil-report-download-banner .wpil-dashboard-processing-message').html(notCompletedDisplay[Math.floor(Math.random() * notCompletedDisplay.length)]);
                            }
                        }
                    }
                });
            }

            var interval = setInterval(loadDashboardDuringScan, 5000);
        }

        var clock,
            clockTarget = null;
        function createDashboardCountdownClock(secondsFromNow = 0){
            clockTarget = new Date().getTime() + (secondsFromNow * 1000);

            clearInterval(clock);
            clock = setInterval(function() {

                // Get today's date and time
                var now = new Date().getTime();

                // Find the distance between now and the count down date
                var distance = clockTarget - now;
              
                // Time calculations for days, hours, minutes and seconds
                var days = Math.floor(distance / (1000 * 60 * 60 * 24));
                var hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                var minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                var seconds = Math.floor((distance % (1000 * 60)) / 1000);
              
                if(hours < 10){
                    hours = ("0" + hours);
                }

                if(minutes < 10){
                    minutes = ("0" + minutes);
                }

                if(seconds < 10){
                    seconds = ("0" + seconds);
                }

                $('.wpil-dashboard-processing-time-remaining').html('Estimated Time Remaining');
                $('.wpil-dashboard-processing-clock').html(hours + ":" + minutes + ":" + seconds);
              
                // If the count down is finished, write some text
                if (distance < 0) {
                  clearInterval(clock);
                  $('.wpil-dashboard-processing-clock').html('00 00:00');
                }
              }, 1000);
        }

        //show links chart in dashboard
        if ($('#wpil_links_chart').length) {
            var internal = $('input[name="internal_links_count"]').val();
            var external = $('input[name="total_links_count"]').val() - $('input[name="internal_links_count"]').val();

            $('#wpil_links_chart').jqChart({
                title: { text: '' },
                legend: {
                    title: '',
                    font: '15px sans-serif',
                    location: 'top',
                    border: {visible: false}
                },
                border: { visible: false },
                animation: { duration: 1 },
                shadows: {
                    enabled: true
                },
                series: [
                    {
                        type: 'pie',
                        fillStyles: ['#33c7fd', '#7646b0'],
                        labels: {
                            stringFormat: '%d',
                            valueType: 'dataValue',
                            font: 'bold 15px sans-serif',
                            fillStyle: 'white',
                            fontWeight: 'bold'
                        },
                        explodedRadius: 8,
                        explodedSlices: [1],
                        data: [['Internal', internal], ['External', external]],
                        labelsPosition: 'inside', // inside, outside
                        labelsAlign: 'circle', // circle, column
                        labelsExtend: 20,
                        leaderLineWidth: 1,
                        leaderLineStrokeStyle: 'black'
                    }
                ]
            });
        }

        //show links chart in dashboard
        if ($('#wpil_links_domain_chart').length) {
            var linezero = $('.mltdcount-0').text();
            var lineone = $('.mltdcount-1').text();
            var linetwo = $('.mltdcount-2').text();
            var linethree = $('.mltdcount-3').text();
            var linefour = $('.mltdcount-4').text();
            var linevalzero = $('.mltdval-0').text();
            var linevalone = $('.mltdval-1').text();
            var linevaltwo = $('.mltdval-2').text();
            var linevalthree = $('.mltdval-3').text();
            var linevalfour = $('.mltdval-4').text();

            $('#wpil_links_domain_chart').jqChart({
                title: { text: '' },
                legend: {
                    title: '',
                    font: '15px sans-serif',
                    location: 'top',
                    border: {visible: false},
                    visible: false
                },
                border: { visible: false },
                animation: { duration: 1 },
                shadows: {
                    enabled: true
                },
                series: [
                    {
                        type: 'pie',
                        animationEnabled: true,
                        fillStyles: ['#4272fd', '#A0A0A0', '#B8B8B8', '#C8C8C8', '#D3D3D3'],
                        labels: {
                            stringFormat: '%d%',
                            valueType: 'percentage', //dataValue
                            font: '15px sans-serif',
                            fillStyle: 'black',
                            fontWeight: 'bold'
                        },
                        explodedRadius: 8,
                        explodedSlices: [0],
                        data: [[linevalzero, linezero], [linevalone, lineone], [linevaltwo, linetwo], [linevalthree, linethree], [linevalfour, linefour]],
                        labelsPosition: 'outside', // inside, outside
                        labelsAlign: 'column', // circle, column
                        labelsExtend: 20,
                        leaderLineWidth: 1,
                        leaderLineStrokeStyle: 'black'
                    }
                ]
            });
        }

        /**/
        // After the jqChart initialization
        let legendHtml = '<div id="wpil_chart_legend" style="display: flex; flex-wrap: wrap; gap: 10px; margin-top: -20px;">';
        const colors = ['#4272fd', '#A0A0A0', '#B8B8B8', '#C8C8C8', '#D3D3D3'];
        const labels = [linezero, lineone, linetwo, linethree, linefour];
        const values = [linevalzero, linevalone, linevaltwo, linevalthree, linevalfour];
        for (let i = 0; i < labels.length; i++) {
            legendHtml += `
                <div style="display: flex; align-items: center; font-size: 14px;">
                    <div style="width: 12px; height: 12px; background-color: ${colors[i]}; margin-right: 6px; border-radius: 2px;"></div>
                    (${values[i]})
                </div>
            `;
        }
        legendHtml += '</div>';
        $('#wpil_links_domain_chart').after(legendHtml);
        /**/

        //show links click chart in detailed click report
        if ($('#link-click-detail-chart').length) {
            
            var clickData	= JSON.parse($('input#link-click-detail-data').val());
            var range		= JSON.parse($('input#link-click-detail-data-range').val());
            var dateFormat = $('input#link-click-detail-data-format').val();
            var clickCount = 0;
            var dateRange = getAllDays(range.start, range.end);
            var displayData = [];

            if(clickData !== ''){
                for(var i in dateRange){
                    var date = dateRange[i];
                    if(clickData[date] !== undefined){
                        displayData.push([date, clickData[date]]);
                        clickCount += clickData[date];
                    }else{
                        displayData.push([date, 0]);
                    }
                }
            }

            $('#link-click-detail-chart').jqChart({
                title: { text: 'Clicks per day' },
                legend: {
                    title: '',
                    font: '15px sans-serif',
                    location: 'top',
                    border: {visible: false},
                    visible: false
                },
                border: { visible: false },
                animation: { duration: 1 },
                shadows: {
                    enabled: true
                },
                axes: [
                    {
                        type: 'linear',
                        location: 'left',
                        minimum: 0,
                    },
                    {
                        location: 'bottom',
                        labels: {
                            resolveOverlappingMode: 'hide'
                        },
                        majorTickMarks: {
                        },
                        minorTickMarks: {
                        }
                    },
                    {
                        location: 'bottom',
                        title: {
                            text: 'Total Clicks for Selected Range: ' + clickCount,
                            font: '16px sans-serif',
                            fillStyle: '#282828',
                        },
                        strokeStyle: '#ffffff	',
                        labels: {
                            resolveOverlappingMode: 'hide'
                        },
                        majorTickMarks: {
                        },
                        minorTickMarks: {
                        }
                    },
                ],
                series: [
                    {
                        type: 'area',
                        title: '',
                        shadows: {
                            enabled: true
                        },
//						fillStyles: ['#33c7fd', '#7646b0'],
                        lineWidth : 2,
                        fillStyle: 'transparent',
                        strokeStyle:'#6b3da7',
                        markers: { 
                            size: 8, 
                            type: 'circle',
                            strokeStyle: 'black', 
                            fillStyle : '#6b3da7', 
                            lineWidth: 1 
                        },
                        labels: {
                            visible: false,
                            stringFormat: '%d',
                            valueType: 'dataValue',
                            font: 'bold 15px sans-serif',
                            fillStyle: 'transparent',
                            fontWeight: 'bold'
                        },
                        data: displayData,
                        leaderLineWidth: 1,
                        leaderLineStrokeStyle: 'black'
                    }
                ]
            });
        }

        function getAllDays(start, end) {
            var s = new Date(start);
            var e = new Date(end);
            var a = [];
        
            while(s < e) {
                a.push(moment(s).format(wpil_ajax.wpil_timepicker_format));
                s = new Date(s.setDate(
                    s.getDate() + 1
                ))
            }
        
            // add an extra day because the date range counter cuts the last day off.
            a.push(moment(s).format(wpil_ajax.wpil_timepicker_format));

            return a;
        };

    });

    $(document).on('click', '.add_custom_link_button', function(e){
        $(this).closest('div').append('<div class="custom-link-wrapper">' + 
                '<div class="add_custom_link">' +
                    '<input type="text" placeholder="Paste URL or type to search">' +
                    '<div class="links_list"></div>' +
                    '<span class="button-primary">' +
                        '<i class="mce-ico mce-i-dashicon dashicons-editor-break"></i>' +
                    '</span>' +
                '</div>' +
                '<div class="cancel_custom_link">' +
                    '<span class="button-primary">' +
                        '<i class="mce-ico mce-i-dashicon dashicons-no"></i>' +
                    '</span>' +
                '</div>' +
            '</div>');
        $(this).closest('.suggestion').find('.link-form-button').hide();
        $(this).closest('.wpil-collapsible-wrapper').find('.link-form-button').hide();
    });

    $(document).on('keyup', '.add_custom_link input[type="text"]', wpil_link_autocomplete);
    $(document).on('click', '.add_custom_link .links_list .item', wpil_link_choose);

    var wpil_link_autocomplete_timeout = null;
    var wpil_link_number = 0;
    function wpil_link_autocomplete(e) {
        var list = $(this).closest('div').find('.links_list');

        //choose variant with keyboard
        if ((e.which == 38 || e.which == 40 || e.which == 13) && list.css('display') !== 'none') {
            switch (e.which) {
                case 38:
                    wpil_link_number--;
                    if (wpil_link_number > 0) {
                        list.find('.item').removeClass('active');
                        list.find('.item:nth-child(' + wpil_link_number + ')').addClass('active')
                    }
                    break;
                case 40:
                    wpil_link_number++;
                    if (wpil_link_number <= list.find('.item').length) {
                        list.find('.item').removeClass('active');
                        list.find('.item:nth-child(' + wpil_link_number + ')').addClass('active')
                    }
                    break;
                case 13:
                    if (list.find('.item.active').length) {
                        var url = list.find('.item.active').data('url');
                        list.closest('.add_custom_link').find('input[type="text"]').val(url);
                        list.html('').hide();
                        wpil_link_number = 0;
                    }
                    break;
            }
        } else {
            //search posts
            var search = $(this).val();
            if ($('#_ajax_linking_nonce').length && search.length) {
                var nonce = $('#_ajax_linking_nonce').val();
                clearTimeout(wpil_link_autocomplete_timeout);
                wpil_link_autocomplete_timeout = setTimeout(function(){
                    $.post(ajaxurl, {
                        page: 1,
                        search: search,
                        action: 'wp-link-ajax',
                        _ajax_linking_nonce: nonce,
                        'wpil_custom_link_search': 1
                    }, function (response) {
                        list.html('');
                        response = jQuery.parseJSON(response);
                        for (var item of response) {
                            list.append('<div class="item" data-url="' + item.permalink + '"><div class="title">' + item.title + '</div><div class="date">' + item.info + '</div></div>');
                        }
                        list.show();
                        wpil_link_number = 0;
                    });
                }, 500);
            }
        }
    }

    function wpil_link_choose() {
        var url = $(this).data('url');
        $(this).closest('.add_custom_link').find('input[type="text"]').val(url);
        $(this).closest('.links_list').html('').hide();
    }

    $(document).on('click', '.add_custom_link span', function(){
        var el = $(this),
            link = el.parents('.add_custom_link').find('input').val(),
            nonce = $('[data-wpil-ajax-container]').data('wpil-suggestion-nonce');

        if (link) {
            $.post(
                ajaxurl, 
                {
                    action: 'wpil_get_link_title',
                    link: link,
                    nonce: nonce
                }, function (response) {
                    if(!isJSON(response)){
                        response = extractAndValidateJSON(response, ['error', 'title', 'id', 'type', 'link']);
                    }

                    if(response && undefined !== response.error){
                        wpil_swal(response.error.title, response.error.text, 'error');
                        return;
                    }

                    if (!el.parents('.wpil-collapsible-wrapper').length) {
                        var suggestion = el.closest('.suggestion');
                        suggestion.html(response.title + '<br><a class="post-slug" target="_blank" href="'+link+'">'+response.link+'</a>' +
                            '<span class="add_custom_link_button link-form-button"> | <a href="javascript:void(0)"><span class="dashicons dashicons-edit"></span></a></span>');
                        suggestion.data('id', response.id);
                        suggestion.data('type', response.type);
                        suggestion.data('custom', response.link);
                    } else {
                        var wrapper = el.closest('.wpil-collapsible-wrapper');
                        wrapper.find('input[type="radio"]').prop('checked', false);
                        wrapper.find('.wpil-content ul').prepend('<li>' +
                            '<div>' +
                            '<input type="radio" checked="" data-id="'+response.id+'" data-type="'+response.type+'" data-suggestion="-1" data-custom="'+link+'" data-post-origin="internal" data-site-url="">' +
                            '<span class="data">' +
                            '<div class="suggested-post-data-container"><strong>Title:</strong> <span class="suggested-post-title">'+response.title+'</span></div>' +
                            '<div class="suggested-post-data-container"><strong>Published:</strong> '+response.date+'</div>' +
                            '<strong>URL:</strong> <a class="post-slug" target="_blank" href="'+link+'">'+response.link+'</a>\n' +
                            '</span>' +
                            '</div>' +
                            '</li>');
                        wrapper.find('input[type="radio"]')[0].click();
                        wrapper.find('.wpil-collapsible').addClass('wpil-active');
                        wrapper.find('.wpil-content').show();
                    }
            });
        } else {
            alert("The link is empty!");
        }
    });

    // if the user cancels the custom link
    $(document).on('click', '.cancel_custom_link span', function(){
        $(this).closest('.suggestion').find('.link-form-button').show();
        $(this).closest('.wpil-collapsible-wrapper').find('.link-form-button').show();
        $(this).closest('.custom-link-wrapper').remove();
    });

    //show edit sentence form
    $(document).on('click', '.wpil_edit_sentence', function(){
        var block = $(this).closest('.sentence');
        setTimeout(function(){openSentenceEditor(block);}, 300); // delay the opening so things can finish their processing
    });

    // listen for clicks to the "Allow multiple links" checkbox
    var multiLinkSet;
    $(document).on('click', '.wpil-sentence-allow-multiple-links', function(){
        var checkbox = $(this);
        clearTimeout(multiLinkSet);
        multiLinkSet = setTimeout(function(){
            ajaxSetMultiLinksInEditor(checkbox);
        }, 200);
    });

    function ajaxSetMultiLinksInEditor(checkbox){
        if(!checkbox){
            return;
        }

        var checked = checkbox.is(':checked') ? 1: 0;

        var data = {
            action: 'wpil_set_multi_link_in_sentence_editor',
            checked: checked,
            nonce: checkbox.data('nonce')
        };
        jQuery.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: data,
            error: function (jqXHR, textStatus, errorThrown) {
                var wrapper = document.createElement('div');
                $(wrapper).append('<strong>' + textStatus + '</strong><br>');
                $(wrapper).append(jqXHR.responseText);
                wpil_swal({"title": "Error", "content": wrapper, "icon": "error"});
            },
            success: function(response){
                if(response.success){
                    console.log(response.success.text);
                }
            },
            complete: function(){
                // regardless of the outcome, set all the other checkboxes to the same setting as this one
                if(checkbox.is(':checked')){
                    $('.wpil-sentence-allow-multiple-links').prop('checked', true);
                }else{
                    $('.wpil-sentence-allow-multiple-links').prop('checked', false);
                }
            }
        });

    }

    function openSentenceEditor(block){
        var form = block.find('.wpil_edit_sentence_form');
        var id = 'wpil_editor' + block.data('id');
        var sentence = form.find('.wpil_content').html();

        if($('.wpil-inbound-links.best_keywords.inbound').length && $('.wpil-inbound-links.best_keywords.inbound').data('wpil-inbound-internal-link').length){
            var link = $(block).closest('table.best_keywords').data('wpil-inbound-internal-link');
        }else if (typeof inbound_internal_link !== 'undefined') {
            var link = inbound_internal_link;
        } else {
            var link = $(block).closest('tr').find('.post-slug:first').attr('href');
        }

        sentence = sentence.replace('%view_link%', link);
        form.find('.wpil_content').attr('id', id).html(sentence).show();
        form.show();
        var textarea_height = form.find('.wpil_content').height() + 100;
        form.find('.wpil_content').height(textarea_height);
        if(undefined === wp.blockEditor){
            wp.editor.initialize(id, {
                tinymce: true,
                quicktags: true,
            });
        }else{
            wp.oldEditor.initialize(id, {
                tinymce: true,
                quicktags: true,
            });
        }

        tinyMCE.activeEditor.setContent(form.find('.wpil_content').text());
        block.find('input[type="checkbox"]:not(.wpil-sentence-allow-multiple-links), .wpil_sentence_with_anchor, .wpil_edit_sentence').hide();
        setTimeout(function(){ 
            block.find('.mce-tinymce').show(); 
            block.find('.wp-editor-tabs .switch-tmce').trigger('click');
            block.find('.mce-tinymce.mce-container.mce-panel').css({'display': 'block'});
            console.log('editor open!');
        }, 500);
        form.find('.wpil_content').hide();
        form.show();
    }

    // make sure the text area shows when the user clicks the "text" button
    $(document).on('click', '.wpil_edit_sentence_form .wp-editor-tabs .switch-html', function(){
        var textEditor = $(this).parents('.wp-editor-tools').find('textarea.wpil_content');
        if(!$(textEditor).is(':visible')){
            setTimeout(function(){
                $(textEditor).css({'display': 'inline-block'});
            }, 50);
        }
    });

    //Cancel button pressed
    $(document).on('click', '.wpil_edit_sentence_form .button-secondary', function(){
        var block = $(this).closest('.sentence');
        wpil_editor_remove(block);
    });

    //Save edited sentence
    $(document).on('click', '.wpil_edit_sentence_form .button-primary', function(){
        var block = $(this).closest('.sentence');
        var id = 'wpil_editor' + block.data('id');

        //get content from the editor
        var sentence;
        if ($('#' + id).css('display') == 'none') {
            var editor = tinyMCE.get(id);
            sentence = editor.getContent();
        } else {
            sentence = $('#' + id).val();
        }

        //remove multiple whitespaces and outer P tag
        if (sentence.substr(0,3) == '<p>') {
            sentence = sentence.substr(3);
        }
        if (sentence.substr(-4) == '</p>') {
            sentence = sentence.substr(0, sentence.length - 4);
        }
        var sentence_clear = sentence;

        // clear any click-disabling classes
        block.find('.wpil_sentence').removeClass('wpil-disable-word-click').prop('title', 'Double clicking a word will select it.');

        // update the text in the plain text version of the link content
        block.find('.wpil_edit_sentence_form').find('.wpil_content').text(sentence_clear);

        // if the user wants to allow multiple links in the suggestion text
        if(block.find('.wpil-sentence-allow-multiple-links').is(':checked')){
            // grab all the links and replace their text representations with placeholders
            var links = sentence.match(/<a[^>]+>/g);

            if (links[0] != null) {
                sentence = sentence.replace(/<a[^>]+\s*>/g, ' %link_start% ');
                sentence = sentence.replace(/\s*<\/a>/g, ' %link_end% ');

                // if there's more than one link
                if(links[1] != null){
                    // disable the sentence word clicking
                    block.find('.wpil_sentence').addClass('wpil-disable-word-click').prop('title', 'Word click-selecting disabled when multiple links present.');;
                }
            }
        }else{
            //put each word to span
            var link = sentence.match(/<a[^>]+>/);
            if (link[0] != null) {
                sentence = sentence.replace(/<a[^>]+\s*>/, ' %link_start% ');
                sentence = sentence.replace(/\s*<\/a>/, ' %link_end% ');
            }

            // check for a second link
            var secondLink = sentence.match(/<a[^>]+>/);
            if (secondLink != null && secondLink[0] != null) {
                // if there are more links, remove them
                sentence = sentence.replace(/<a[^>]+\s*>/g, '');
                sentence = sentence.replace(/\s*<\/a>/g, '');
                // and update the clear sentence so the additional links aren't present
                sentence_clear = sentence.replace(/%link_start%/g, link[0]);
                sentence_clear = sentence_clear.replace(/%link_end%/g, '</a>');
                block.find('.wpil_edit_sentence_form').find('.wpil_content').text(sentence_clear);
            }
        }

        sentence = sentence.replace(/\s+/g, ' ');
        sentence = sentence.replace(/ /g, '</span> <span class="wpil_word">');
        sentence = '<span class="wpil_word">' + sentence + '</span>';
        if (link && link[0] != null) {
            sentence = sentence.replace(/<span class="wpil_word">%link_start%<\/span>/g, link[0]);
            sentence = sentence.replace(/<span class="wpil_word">%link_end%<\/span>/g, '</a>');
        }else if(links && links[0] != null){
            for(var i in links){
                sentence = sentence.replace(/<span class="wpil_word">%link_start%<\/span>/, links[i]);
            }
            sentence = sentence.replace(/<span class="wpil_word">%link_end%<\/span>/g, '</a>');
        }

        block.find('.wpil_sentence').html(sentence);
        block.find('input[name="custom_sentence"]').val(btoa(unescape(encodeURIComponent(sentence_clear))));

        spaceSentenceWords(block.find('.wpil_sentence'));

        if(block.closest('.wp-list-table').hasClass('inbound')){
            if(block.closest('.wpil-collapsible').length > 0){ // if the sentence is the top-level sentence in a dropdown
                updateDropdownSentence(block.find('.wpil_sentence'));
            }
        }
        toggleSentenceReset(block.find('.wpil_sentence'));

        if (block.closest('tr').find('.raw_html').length) {
            sentence_clear = sentence_clear.replace(/</g, '&lt;');
            sentence_clear = sentence_clear.replace(/>/g, '&gt;');
            block.closest('tr').find('.raw_html').hide();
            block.closest('tr').find('.raw_html.custom-text').html(sentence_clear).show();
        }

        block.closest('tr').find('.chk-keywords, .wpil_link_select').filter(function(){
            if($(this).hasClass('chk-keywords')){
                return $(this).prop('checked', true);
            }else{
                $(this).closest('tr').find('.wpil_activate_edit_link').trigger('click');
            }
        });
        wpil_editor_remove(block);
        updateRowWordCounts($(block.find('.wpil_sentence')));
    });

    /**
     * Fires the WP editor at a target element to run through the initialization process
     **/
    function wpilEditorInitialize(){
        if(undefined === wp.blockEditor){
            wp.editor.initialize('wpil-editor-target', {
                tinymce: true,
                quicktags: true,
            });
            setTimeout(function(){
                wp.editor.remove('wpil-editor-target');
            }, 250);
        }else{
            wp.oldEditor.initialize('wpil-editor-target', {
                tinymce: true,
                quicktags: true,
            });
            setTimeout(function(){
                wp.oldEditor.remove('wpil-editor-target');
            }, 250);
        }
    }

    //Remove WP Editor after sentence editing
    function wpil_editor_remove(block) {
        var form = block.find('.wpil_edit_sentence_form');
        var textarea_height = form.find('.wpil_content').height() - 100;
        form.find('.wpil_content').height(textarea_height);
        form.hide();
        form.find('.wpil_content').attr('id', '').prependTo(form);
        if(undefined === wp.blockEditor){
            wp.editor.remove('wpil_editor' + block.data('id'));
        }else{
            wp.oldEditor.remove('wpil_editor' + block.data('id')); 
        }
        form.find('.wp-editor-wrap').remove();
        block.find('input[type="checkbox"], .wpil_sentence_with_anchor, .wpil_edit_sentence').show();
    }

    function customSentenceRefresh(el) {
        if(el.parents('.wpil-content').length){
            var input = el.closest('.data').find('input[name="custom_sentence"]');
            var sentence = el.html();
            var editorContent = el.closest('.data').find('.wpil_content');
        }else{
            var input = el.closest('.sentence').find('input[name="custom_sentence"]');
            var sentence = el.closest('.wpil_sentence').html();
            var editorContent = el.closest('.sentence').find('.wpil_content');
        }

        if(!sentence){
            return;
        }

        sentence = sentence.replace(/<span[^>]+wpil_suggestion_tag[^>]+>([a-zA-Z0-9=+]+)<\/span>/g, function (x) {
            x = x.replace(/<span[^>]+>/g, '');
            x = x.replace(/<\/span>/g, '');
            return atob(x);
        });
        sentence = sentence.replace(/<\/span> <\/a>/g, '<\/span><\/a> ');
        sentence = sentence.replace(/<span[^>]+>/g, '');
        sentence = sentence.replace(/<\/span>/g, '');
        editorContent.html(sentence);

        if (input.val() !== '') {
            input.val(btoa(unescape(encodeURIComponent(sentence))));
        }
    }

    /**
     * Updates the sentence and "custom_sentence" text of suggested sentences in dropdowns
     **/
    function updateDropdownSentence(sentence){
        var sentenceWithAnchor = sentence.closest('.wpil_sentence_with_anchor');
        var listItemId = sentenceWithAnchor.data('li-id');

        if(undefined !== listItemId){
            var itemData = $(sentence).closest('.wpil-collapsible-wrapper').find('.wpil-inbound-sentence-data-container[data-container-id="' + listItemId + '"] .data');

            itemData.find('.wpil_sentence').html(sentence.html());
            itemData.find('.wpil_content').html(sentenceWithAnchor.siblings('.wpil_edit_sentence_form').find('.wpil_content').html());
            itemData.find('[name="custom_sentence"]').val(sentenceWithAnchor.siblings('[name="custom_sentence"]').val());

            if(sentence.hasClass('wpil-disable-word-click')){
                itemData.find('.wpil_sentence').addClass('wpil-disable-word-click').prop('title', 'Word click-selecting disabled when multiple links present.');
            }else{
                itemData.find('.wpil_sentence').removeClass('wpil-disable-word-click').prop('title', 'Double clicking a word will select it.');
            }

            customSentenceRefresh(itemData.find('.wpil_sentence'));
        }
    }

    /**
     * Toggles the display of the "reset sentence" button.
     **/
    function toggleSentenceReset(sentence){
        var parent = sentence.closest('div');
        var listItemId = sentence.closest('.wpil_sentence_with_anchor').data('li-id');
        var currentSentence = sentence.html().toString().replace(new RegExp(' data-wpil-word-id="[0-9]*"', 'ig'), '').replace(new RegExp('[\\s]*</a>[\\s]*', 'ig'), '</a> ').trim();

        // get the current target link
        if (typeof inbound_internal_link !== 'undefined') {
            var link = inbound_internal_link;
        } else {
            var link = $(sentence).closest('tr').find('.post-slug:first').attr('href');
        }

        // if the target link is in the sentence
        if(currentSentence.indexOf(link) !== -1){
            // normalize the changed sentence so we can tell if it's basically the same as the original
            currentSentence = currentSentence.replace(link, '%view_link%')
                                                .replace(new RegExp('[\\s]*<a href="%view_link%">[\\s]*', 'ig'), ' <a href="%view_link%">')
                                                .replace(new RegExp('[\\s]*</a>[\\s]*', 'ig'), '</a> ')
                                                .replace(new RegExp('[\\s][\\s]*', 'ig'), ' ').trim();

            if(currentSentence.indexOf('<span class="wpil_word"></span> <a href="%view_link%">') === 0){
                currentSentence = currentSentence.replace('<span class="wpil_word"></span> <a href="%view_link%">', '<a href="%view_link%">');
            }

            if(currentSentence.indexOf('</span></a> <span class="wpil_word"></span>') + 43 === currentSentence.length){
                currentSentence = currentSentence.replace('</span></a> <span class="wpil_word"></span>', '</span></a>');
            }
        }

        // base64 the sentence
        currentSentence = Base64.encode(currentSentence);

        if(parent.find('[name="original_sentence_with_anchor"]').val() === currentSentence){
            parent.find('.wpil-reload-sentence-with-anchor').removeClass('wpil-reset-active');
        }else{
            parent.find('.wpil-reload-sentence-with-anchor').addClass('wpil-reset-active');
        }

        if(undefined !== listItemId){
            var itemData = $(sentence).closest('.wpil-collapsible-wrapper').find('.wpil-inbound-sentence-data-container[data-container-id="' + listItemId + '"] .data');

            if(itemData.find('[name="original_sentence_with_anchor"]').val() === currentSentence){
                itemData.find('.wpil-reload-sentence-with-anchor').removeClass('wpil-reset-active');
            }else{
                itemData.find('.wpil-reload-sentence-with-anchor').addClass('wpil-reset-active');
            }
        }

        if(parent.hasClass('data')){ // if this is a sentence in a dropdown
            // do the check on the active sentence
            var tLS = parent.closest('.wpil-collapsible-wrapper').find('.top-level-sentence');
            if(tLS.find('[name="original_sentence_with_anchor"]').val() === currentSentence){
                tLS.find('.wpil-reload-sentence-with-anchor').removeClass('wpil-reset-active');
            }else{
                tLS.find('.wpil-reload-sentence-with-anchor').addClass('wpil-reset-active');
            }
        }
    }

    /**
     * Resets modified suggestion texts back to their initial values when the user clicks the reset button.
     **/
    $(document).on('click', '.wpil-reload-sentence-with-anchor', function(){
        var parent = $(this).closest('div');
        var sentence = parent.find('.wpil_sentence');
        var originalSentence = Base64.decode(parent.find('[name="original_sentence_with_anchor"]').val());
        var dropdownWrapper = parent.closest('.wpil-collapsible-wrapper');

        sentence.html(originalSentence);
        sentence.removeClass('wpil-disable-word-click').prop('title', 'Double clicking a word will select it.');
        $(this).removeClass('wpil-reset-active');

        styleSentenceWords(sentence);
        customSentenceRefresh(parent.find('.wpil_sentence'));

        // if the user clicked the reset button in the top level sentence in a dropdown,
        // trigger the sentence refresh in the element in the dropdown
        if(dropdownWrapper.length > 0){
            if(parent.hasClass('top-level-sentence')){
                var listItemId = parent.find('.wpil_sentence_with_anchor').data('li-id');
                if(undefined !== listItemId){
                    var reset = dropdownWrapper.find('.wpil-inbound-sentence-data-container .wpil_sentence_with_anchor[data-li-id="' + listItemId + '"] .wpil-reload-sentence-with-anchor');
                    if(reset.hasClass('wpil-reset-active')){
                        reset.trigger('click');
                    }
                }
            }else{
                var listItemId = parent.closest('.wpil-inbound-sentence-data-container').data('container-id');
                if(undefined !== listItemId){
                    var activeSentence = dropdownWrapper.find('.sentence.top-level-sentence .wpil_sentence_with_anchor');
                    if(listItemId === activeSentence.data('li-id')){
                        var reset = activeSentence.find('.wpil-reload-sentence-with-anchor');
                        if(reset.hasClass('wpil-reset-active')){
                            reset.trigger('click');
                        }
                    }
                }
            }
        }
    });

    $(document).on('click', '.wpil_add_link_to_ignore', function(){
        if (confirm('You are about to add this link to your ignore list and it will not be suggested as a link in the future. However, you can reverse this decision on the settings page.')) {
            var block = $(this).closest('div');
            var id = block.data('id');
            var type = block.data('type');
            var postOrigin = block.data('post-origin');
            var siteUrl = block.data('site-url');

            $.post(ajaxurl, {
                id: id,
                type: type,
                post_origin: postOrigin,
                site_url: siteUrl,
                action: 'wpil_add_link_to_ignore'
            }, function (response) {
                response = $.parseJSON(response);
                if (response.error) {
                    wpil_swal('Error', response.error, 'error');
                } else {
                    if (block.closest('.suggestion').length) {
                        block.closest('tr').fadeOut(300, function(){
                            $(this).remove();
                        });
                    } else {
                        var id = block.data('id');
                        var type = block.data('type');
                        var wrapper = block.closest('.wpil-collapsible-wrapper');

                        wrapper.find('input[data-id="' +  id + '"][data-type="' +  type + '"]').closest('li').remove();
                        wrapper.find('li:first input').prop('checked', true).click();
                    }
                    wpil_swal('Success', 'Link was added to the ignored list successfully!', 'success');
                }
            });
        }
    });

    /**
     * Currently only supporting the inbound internal links
     **/
    $(document).on('click', '.wpil_add_multiple_link_to_ignore', function(){
        if (confirm('You are about to add these links to your ignore list and they will not be suggested in the future. You can stop ignoring the pages from the Link Whisper Settings.')) {
            
            var links = [];
            
            if($('.wpil-inbound-links').length > 0){
                var checked = $('.wpil-inbound-links .chk-keywords:checked');
                checked.each(function(ind, element){
                    var block = $(element).parents('tr').find('.wpil-inbound-suggestion-posts .suggestion:visible');
                    var id = block.data('id');
                    var type = block.data('type');
                    var postOrigin = block.data('post-origin');
                    var siteUrl = block.data('site-url');
                    
                    links.push({
                        id: id,
                        type: type,
                        post_origin: postOrigin,
                        site_url: siteUrl,
                    });
                });
            }else{
                var checked = $('.wpil-inbound-links .chk-keywords:checked');
                checked.each(function(ind, element){
                    var block = $(element).parents('tr').find('.wpil-inbound-suggestion-posts .suggestion:visible');
                    var id = block.data('id');
                    var type = block.data('type');
                    var postOrigin = block.data('post-origin');
                    var siteUrl = block.data('site-url');
                    
                    links.push({
                        id: id,
                        type: type,
                        post_origin: postOrigin,
                        site_url: siteUrl,
                    });
                });
            }

            $.post(ajaxurl, {
                multiple_links: links,
                action: 'wpil_add_link_to_ignore'
            }, function (response) {
                response = $.parseJSON(response);
                if (response.error) {
                    wpil_swal('Error', response.error, 'error');
                } else {
                    $('.wpil-inbound-links .chk-keywords:checked').fadeOut(300, function(){
                        $(this).remove();
                    });
                }
            });
        }
    });

    var updateWordsWait = null;
    function updateRowWordCounts(sentence){
        if(!sentence.hasClass('wpil_sentence') || $('.wpil-activity-panel').length < 1){
            return;
        }
        var parentRow = sentence.parents('tr');
        clearTimeout(updateWordsWait);
        updateWordsWait = setTimeout(function(){
            var sentenceWords = sentence.find('a .wpil_word').length;
            parentRow.find('.wpil-activity-panel-word-count').text(sentenceWords);
        }, 500);
    };
            

    $(document).on('click', '#wpil_show_expanded_details', function(){
        if($(this).is(':checked')){
            $('.wpil-suggestion-peripheral').addClass('peripheral-visible');
            ajax_update_expanded_details(true);
        }else{
            $('.wpil-suggestion-peripheral').removeClass('peripheral-visible');
            ajax_update_expanded_details(false);
        }
    });

    function ajax_update_expanded_details(status){
        $.post(ajaxurl, {
            action: 'wpil_update_expanded_details_toggle',
            status: (status) ? 1: 0
        }, function (response) {});
    }

    var mouseExit;
    $(document).on('mouseover', '.wpil_help i, .wpil_help div', function(){
        clearTimeout(mouseExit);
        $('.wpil_help div').hide();
        $(this).parent().children('div').show();
    });

    $(document).on('mouseout', '.wpil_help i, .wpil_help div', function(){
        var element = this;
        mouseExit = setTimeout(function(){
            $(element).parent().children('div').hide();
        }, 250);
        
    });

    $(document).on('click', '.csv_button', function(){
        if($(this).hasClass('file-downloadable')){
            return;
        }

        $(this).addClass('wpil_button_is_active');
        var type = $(this).data('type');
        var data = null;
        if(type === 'error'){ data = $(this).data('codes'); }
        wpil_csv_request(type, 1, data);
    });

    function wpil_csv_request(type, count, data = null, id = 0) {
        $.post(ajaxurl, {
            count: count,
            type: type,
            action: 'wpil_csv_export',
            export_data: data,
            id: id
        }, function (response) {
            if(!isJSON(response)){
                response = extractAndValidateJSON(response, ['error', 'filename', 'fileExists', 'type', 'count', 'id']);
            }

            if (response.error) {
                wpil_swal(response.error.title, response.error.text, 'error');
            } else {
                console.log(response);
                if (response.filename) {
                    if(undefined !== response.fileExists && !response.fileExists){
                        wpil_swal('File Not Creatable', 'Unfortunately, it wasn\'t possible to create the export file. It is most likely caused by server settings preventing Link Whisper from writing in it\'s current directory', 'error');
                        $('#wpil_report_reset_data_form .csv_button').removeClass('wpil_button_is_active');
                        return;
                    }

                    // get the current button and remove the loading from it
                    var currentButton = $('.csv_button[data-type="'+type+'"]');
                    currentButton.removeClass('wpil_button_is_active');

                    // create our download link and try downloading the file
                    var link = document.createElement('a');
                    link.href = response.filename;
                    link.download = currentButton.data('file-name');
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    // as a backup, convert the csv button the user clicked into a download button
                    currentButton.addClass('file-downloadable');
                    var text = 'Download ' + currentButton.first().text();
                    currentButton.text(text);
                    currentButton.attr('download', currentButton.data('file-name'));
                    currentButton.attr('href', response.filename);

//					location.href = response.filename;
                } else {
                    wpil_csv_request(response.type, ++response.count, data, response.id);
                }
            }
        });
    }

    $(document).on('click', '.return_to_report', function(e){
        e.preventDefault();

        // if a link is specified
        if(undefined !== this.href){
            // parse the url
            var params = parseURLParams(this.href);
            // if the url is back to an edit page
            if(	undefined !== typeof params &&
                ( (undefined !== params.action && undefined !== params.post && 'edit' === params.action[0]) || params.direct_return || true) // NOTE: if we make it to 2.2.8 without issues, make the checks a little neater. I'm seeing about doing away with the JS report redirect thing to save some system resources for customers.
            ){
                if(params.ret_url && params.ret_url[0]){
                    var link = atob(decodeURI(params.ret_url[0]));
                }else{
                    var link = this.href;
                }

                // redirect back to the page
                location.href = link;
                return;
            }
        }
    });

    $(document).on('click', '.wpil-export-suggestions', function(e){
        e.preventDefault();

        var links = [];
        var data = [];
        var suggestions = $('#tbl_keywords').find('[wpil-link-new][type=checkbox]:checked');
        var suggestionType = $(this).data('suggestion-type');
        if(suggestions.length === 0){
            suggestions = $('#tbl_keywords').find('[wpil-link-new][type=checkbox]');
        }

        suggestions.each(function() {
            if (suggestionType == 'inbound') {
                var dropdownData = $(this).closest('tr').find('.sentences .wpil-content');
                var item = {};
                var id = $(this).closest('tr').find('.sentence').data('id');
                var type = $(this).closest('tr').find('.sentence').data('type');
                if(dropdownData.length > 0){
                    item.links = [];
                    $(dropdownData).find('.data').each(function(index, element){
                        item.links.push({
                            'id': id,
                            'type': type,
                            'sentence': $(element).find('[name="sentence"]').val(),
                            'sentence_with_anchor': $(element).find('.wpil_sentence_with_anchor').html(),
                            'custom_sentence': $(element).find('input[name="custom_sentence"]').val()
                        });
                    });
                }else{
                    item.links = [{
                        'id': id,
                        'type': type,
                        'sentence': $(this).closest('tr').find('.sentence').find('[name="sentence"]').val(),
                        'sentence_with_anchor': $(this).closest('tr').find('.wpil_sentence_with_anchor').html(),
                        'custom_sentence': $(this).closest('tr').find('input[name="custom_sentence"]').val()
                    }];
                }

                data.push(item);
            } else {
                if ($(this).closest('tr').find('input[type="radio"]:checked').length) {
                    var id =  $(this).closest('tr').find('input[type="radio"]:checked').data('id');
                    var type = $(this).closest('tr').find('input[type="radio"]:checked').data('type');
                    var custom_link = $(this).closest('tr').find('input[type="radio"]:checked').data('custom');
                    var post_origin = $(this).closest('tr').find('input[type="radio"]:checked').data('post-origin');
                    var site_url = $(this).closest('tr').find('input[type="radio"]:checked').data('site-url');
                } else {
                    var id =  $(this).closest('tr').find('.suggestion').data('id');
                    var type =  $(this).closest('tr').find('.suggestion').data('type');
                    var custom_link =  $(this).closest('tr').find('.suggestion').data('custom');
                    var post_origin = $(this).closest('tr').find('.suggestion').data('post-origin');
                    var site_url = $(this).closest('tr').find('.suggestion').data('site-url');
                }

                links.push({
                    id: id,
                    type: type,
                    custom_link: custom_link,
                    post_origin: post_origin,
                    site_url: site_url,
                    sentence: $(this).closest('div').find('[name="sentence"]').val(),
                    sentence_with_anchor: $(this).closest('div').find('.wpil_sentence_with_anchor').html(),
                    custom_sentence: $(this).closest('.sentence').find('input[name="custom_sentence"]').val()
                });
            }
        });

        if (suggestionType == 'outbound') {
            data.push({'links': links});
        }

        var exportData = {
            "id": $(this).data('id'),
            "type": $(this).data('type'),
            "suggestion_type": suggestionType,
            'export_type': $(this).data('export-type'),
            'data': JSON.stringify(data)
        };

        $.post(ajaxurl, {
            action: 'wpil_export_suggestion_data',
            export_data: exportData,
            nonce: $(this).data('nonce'),
        }, function (response) {
            if(!isJSON(response)){
                response = extractAndValidateJSON(response, ['error', 'filename', 'nicename']);
            }

            if (response.error) {
                wpil_swal(response.error.title, response.error.text, 'error');
            } else {
                if (response.filename) {
                    var link = document.createElement('a');
                    link.href = response.filename;
                    link.download = response.nicename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
//					location.href = response.filename;
                }
            }
        });
    });

    $(document).on('click', '.wpil_gsc_switch_app', function(){
        if($(this).hasClass('enter-custom')){
            $('.wpil_gsc_app_inputs').hide();
            $('.wpil_gsc_custom_app_inputs').show();
        }else{
            $('.wpil_gsc_app_inputs').show();
            $('.wpil_gsc_custom_app_inputs').hide();
        }
    });

    /*$(document).on('click', '.wpil-get-gsc-access-token', function(){
        $('.wpil_gsc_get_authorize').show();
        $(this).hide();
    });*/

    $(document).on('click', '.wpil_gsc_enter_app_creds', function(){
        $('#frmSaveSettings').trigger('submit');
    });

    $(document).on('click', '.wpil_gsc_clear_app_creds', function(){
        $.post(ajaxurl, {
            action: 'wpil_clear_gsc_app_credentials',
            nonce: $(this).data('nonce')
        }, function (response) {
            location.reload();
        });
    });

    $(document).on('click', '.wpil-gsc-deactivate-app', function(){
        $.post(ajaxurl, {
            action: 'wpil_gsc_deactivate_app',
            nonce: $(this).data('nonce')
        }, function (response) {
            location.reload();
        });
    });

    $(document).on('click', '#wpil-disconnect-ai-subscription', function(e){
        e.preventDefault();

        var button = $(this);

        if(button.hasClass('wpil_button_is_active')){
            return;
        }

        button.addClass('wpil_button_is_active');

        $.post(ajaxurl, {
            action: 'wpil_disconnect_from_ai_subscription',
            nonce: button.data('nonce')
        }, function (response) {
            location.reload();
        }).fail(function(){
            button.removeClass('wpil_button_is_active');
        });
    });
    
    /** Showing processing errors **/
    var processingError;
    // sets up a notice that will display if it's not cleared
    function setupProcessingError(clear = false){
        clearTimeout(processingError);
        if(!clear){
            processingError = setTimeout(function(){
                $('.wpil-process-loading-error-message').css({'display': 'inline-block'});
            }, 180 * 1000); // the max processing time for a LW process _should_ be 90 seconds, but this allows more breathing room
        }
    }

    // hides the error message in case it's showing
    function hideProcessingError(){
        $('.wpil-process-loading-error-message').css({'display': 'none'});
    }
    /** /Showing processing errors **/

    /** Sticky Header **/
    // Makes the thead sticky to the top of the screen when scrolled down far enough
    if($('.wpil_styles .wp-list-table:not(.sticky-ignore)').length){
        var theadTop = $('.wpil_styles .wp-list-table:not(.sticky-ignore)').offset().top;
        var adminBarHeight = parseInt(document.getElementById('wpadminbar').offsetHeight);
        var scrollLine = (theadTop - adminBarHeight);
        var sticky = false;

        // duplicate the footer and insert in the table head
        $('.wpil_styles .wp-list-table:not(.sticky-ignore) tfoot tr').clone().addClass('wpil-sticky-header').css({'display': 'none', 'top': adminBarHeight + 'px'}).appendTo('.wp-list-table thead');

        // resizes the header elements
        function sizeHeaderElements(){
            // get the width of the normal header
            var headerWidth = $('.wpil_styles .wp-list-table:not(.sticky-ignore) thead tr').width();

            // adjust for any change in the admin bar
            adminBarHeight = parseInt(document.getElementById('wpadminbar').offsetHeight);
            $('.wpil-sticky-header').css({'top': adminBarHeight + 'px', 'width': headerWidth});

            // adjust the size of the header columns
            var elements = $('.wpil-sticky-header').find('th');
            $('.wpil_styles .wp-list-table:not(.sticky-ignore) thead tr').not('.wpil-sticky-header').find('th').each(function(index, element){
                //var width = getComputedStyle(element).width;
                var width = $(element).get(0).scrollWidth - (parseInt(getComputedStyle(element).paddingLeft) + parseInt(getComputedStyle(element).paddingRight));
                $(elements[index]).attr('style', 'width:' + width + "px !important;");
            });
        }
        sizeHeaderElements();

        function resetScrollLinePositions(){
            if($('.wpil_styles .wp-list-table:not(.sticky-ignore)').length < 1){
                return;
            }
            theadTop = $('.wpil_styles .wp-list-table:not(.sticky-ignore)').offset().top;
            adminBarHeight = parseInt(document.getElementById('wpadminbar').offsetHeight);
            scrollLine = (theadTop - adminBarHeight);
        }

        $(window).on('scroll', function(e){
            var scroll = parseInt(document.documentElement.scrollTop);

            // if we've passed the scroll line and the head is not sticky
            if(scroll > scrollLine && !sticky){
                // sticky the header
                $('.wpil-sticky-header').css({'display': 'table-row'});
                sticky = true;
            }else if(scroll < scrollLine && sticky){
                // if we're above the scroll line and the header is sticky, unsticky it
                $('.wpil-sticky-header').css({'display': 'none'});
                sticky = false;
            }
        });

        var wait;
        $(window).on('resize', function(){
            clearTimeout(wait);
            setTimeout(function(){ 
                sizeHeaderElements(); 
                resetScrollLinePositions();
            }, 150);
        });

        setTimeout(function(){ 
            resetScrollLinePositions();
        }, 1500);
    }
    /** /Sticky Header **/

    /** General Items **/
    $(document).on('keyup', '.wpil_styles #current-page-selector', maybeChangePage);
    function maybeChangePage(e){
        if(!e || !e.target || e.keyCode !== 13){
            return;
        }

        // if the selector isn't in a form
        if($(e.target).parents('form').length < 1){
            // manually perform the page updating
            var page = parseInt($(e.target).val());

            if(page > 1){
                if(-1 !== window.location.href.indexOf('paged')){
                    window.location.href = window.location.href.replace(/paged=([0-9]*)/, 'paged=' + page);
                }else{
                    window.location.href += '&paged=' + page;
                }
            }else if(-1 !== window.location.href.indexOf('paged')){
                window.location.href = window.location.href.replace(/paged=([0-9]*)/, '');
            }
        }
    }
    /** /General Items */
	/** Lazyload the dropdowns */
//    $(document).on('click', 'td .wpil-collapsible-wrapper', maybeAjaxDownloadData);

	/**
     * Checks to see if the clicked dropdown has all of its data.
     * If the dropdown doesn't, this downloads the remaining data and adds it to the dropdown
     **/
    var globalDownloadTracker = [];
    function maybeAjaxDownloadData(e){
        var wrap = $(e.target).parents('td').find('.wpil-collapsible-wrapper'),
            count = parseInt(wrap.find('.wpil-links-count .wpil_ul').text()),
            current = wrap.find('.report_links li').length,
            type = wrap.find('.wpil-collapsible').data('wpil-report-type'),
            postId = wrap.data('wpil-report-post-id'),
            postType = wrap.data('wpil-report-post-type'),
            nonce = wrap.data('wpil-collapsible-nonce'),
            processId = postId + '_' + postType;

        // first check if there's all the data
        if(count <= current){
            // if there is, exit
            return;
        }

        // also make sure there isn't a download for the data already running
        if(undefined !== this && -1 !== globalDownloadTracker.indexOf(processId)){
            // if there is, exit
            return;
        }

        if(-1 === globalDownloadTracker.indexOf(processId)){
            globalDownloadTracker.push(processId);
        }

        // start calling for the remaining links
        $.ajax({
			type: 'POST',
			url: ajaxurl,
			data: {
				action: 'get_link_report_dropdown_data',
                dropdown_type: type,
                post_id: postId,
                post_type: postType,
                nonce: nonce,
                item_count: current,
			},
			success: function(response){
                // if there was an error
                if(response.error){
                    // output the error message
                    wpil_swal(response.error.title, response.error.text, 'error');
                    // and exit
                    return;
                }

                // if there was a notice
                if(response.info){
                    // output the notice message
                    wpil_swal(response.info.title, response.info.text, 'info');
                    // and exit
                    return;
                }

                // 
                if(response.success){
                    // 
                    if(undefined !== response.success.item_data && '' !== response.success.item_data){
                        wrap.find('.report_links').append(response.success.item_data);
                    }

                    if(undefined !== response.success.item_count && response.success.item_count > 0){
                        // go for another trip!
                        maybeAjaxDownloadData(e);
                    }
                    // and exit
                    return;
                }
			},
            error: function(jqXHR, textStatus, errorThrown){
                console.log({jqXHR, textStatus, errorThrown});
            }
		});
    }


	/** /Lazyload the dropdowns */

    /** Ajax saving for Screen Options **/
    var savingScreenOptions = false;
    $(document).on('submit', '#adv-settings', ajaxSaveScreenOptions);
    function ajaxSaveScreenOptions(e){
        // exit if this is not a Link Whisper page
        if($('body').find('.wpil_styles').length < 1 || savingScreenOptions){
            return;
        }
        // stop the form submit
        e.preventDefault();

        // get the form
        var form = $(this);

        // get the values from the screen options
        var saveOptions = {};

        $(this).find('input').each(function(index, element){
            if(!element.id){
                return;
            }

            var el = $(element);
            if(el.attr('type') === 'checkbox'){
                saveOptions[element.id] = el.is(':checked') ? 'on': 'off';
            }else{
                saveOptions[element.id] = $(element).val();
            }
        });

        if(Object.keys(saveOptions).length > 0){
            $.ajax({
                type: "POST",
                url: ajaxurl,
                data: {
                    action: 'wpil_save_screen_options',
                    nonce: $(this).find('#screenoptionnonce').val(),
                    options: saveOptions,
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log(textStatus);
                },
                success: function(response){
                    if(!isJSON(response)){
                        response = extractAndValidateJSON(response, ['success']);
                    }

                    if(response.success){
                        window.location.reload();
                    }else{
                        savingScreenOptions = true;
                        form.submit();
                    }
                    console.log(response);
                }
            });
        }
    }

    /** /Ajax saving for Screen Options **/


    /** Report page actions and activity **/
    $(document).on('click', '.column-wpil-report-actions .dashicons-plus', animateActionPanel);

    function animateActionPanel(){
        var button = $(this),
            panel = button.parents('.column-wpil-report-actions').find('.wpil-report-action-panel-wrapper');
        
        if(panel.hasClass('open')){
            panel.animate({'right': '-600px'}, 500, function(){
                panel.removeClass('active-1');
                panel.removeClass('open');
            });
        }else{
            closeActionPanel(); // clase any active panels
            panel.addClass('active-1');
            panel.animate({'right': '0px'}, 500, function(){
                panel.addClass('open');
            });
        }
    }

    $(document).on('click', function(e){
        if($('.wpil-report-action-panel-wrapper.open').length > 0 && $(e.target).closest('.wpil-report-action-panel-wrapper').length < 1){
            closeActionPanel();
        }
    });

    /**
     * Closes any open action panel
     **/
    function closeActionPanel(){
        var panel = $('.wpil-report-action-panel-wrapper.open');
        if(panel){
            panel.animate({'right': '-600px'}, 500, function(){
                panel.removeClass('active-1');
                panel.removeClass('open');
            });
        }
    }

    $(document).on('click', '#checkall .wpil-report-post-checkbox, .wpil-sticky-header .wpil-report-post-checkbox', function(){
        var check = $(this);
        if(check.is(':checked')){
            check.parents('table').find('input.wpil-report-post-checkbox').prop('checked', true);
        }else{
            check.parents('table').find('input.wpil-report-post-checkbox').prop('checked', false);
        }
    });

    $(document).on('click', '.wpil-panel-subaction, .wpil-collapsible-wrapper.wpil-activity-activate', function(e){
        var actionPanel = $('.wpil-report-action-panel-wrapper.open'),
            action = $(this),
            row = $(this).parents('tr');

        if($(e.target).parents('.add-density-highlight').length > 0 || $(e.target).hasClass('add-density-highlight')){
            return;
        }

        actionPanel.animate({'right': '-600px'}, 500, function(){
            actionPanel.removeClass('active-1 open');
        });
        
        $('.active-dropdown').removeClass('active-dropdown');
        if(action.data('link-type')){
            row.find('.wpil-collapsible-wrapper[data-link-type="'+action.data('link-type')+'"]').addClass('active-dropdown');
        }else if(action.data('domain')){
            row.find('.wpil-collapsible-wrapper[data-domain="'+action.data('domain')+'"]').addClass('active-dropdown');
        }

        animateActivityPanel(action.data('activity-panel-title'))
    });

    $(document).on('click', '.wpil-panel-close, .wpil-overlay', closeActivityPanel);
    $(document).on('keydown', function(e){ if(e.key === 'Escape') closeActivityPanel(); });

    function animateActivityPanel(title = ''){
        var panel = $('.wpil-activity-panel-wrapper');
        if(panel.hasClass('open')){
            closeActivityPanel();
        }else{
            if(title){
                panel.find('.wpil-activity-panel-header').text(title);
            }
            panel.addClass('active-1');
            $('.wpil-overlay').addClass('is-open');
            panel.animate({ right: '0px' }, 500, function(){ panel.addClass('open'); });
        }
    }

    function closeActivityPanel(){
        var panel = $('.wpil-activity-panel-wrapper');
        if(!panel.hasClass('open')) return;
        panel.animate({ right: '-110vw' }, 500, function(){
            panel.removeClass('active-1 open');
            $('.wpil-overlay').removeClass('is-open');
        });
    }


    /*** Report page bulk action selector ****/
    var $root   = $('#wpil-bulk-select');
    var $button = $root.find('.wpil-bulk-trigger');
    var $menu   = $root.find('.wpil-bulk-menu');
    var activeIndex = -1;
    var outsideHandler;

    function openMenu() {
        $menu.prop('hidden', false)
            .attr('data-open', 'true')
            .focus({ preventScroll: true });
        $button.attr('aria-expanded', 'true');
        setActive(0);
        bindOutside();
    }

    function closeMenu() {
        $menu.prop('hidden', true)
            .removeAttr('data-open');
        $button.attr('aria-expanded', 'false');
        activeIndex = -1;
        unbindOutside();
    }

    function setActive(i) {
        var $items = $menu.find('li[role="option"]');
        $items.removeClass('is-active');
        if (!$items.length) return;
        activeIndex = (i + $items.length) % $items.length;
        var $active = $items.eq(activeIndex).addClass('is-active');
        $active[0].scrollIntoView({ block: 'nearest' });
    }

    function choose($el) {
        var value = $el.data('value'),
            data = [];
            
        $('.wpil-report-post-checkbox:checked').each(
        function(ind, element){ 
            data.push($(element).data('post-id'));
        });

        $root.trigger('wpil:bulkActionSelected', {
        value: value,
        data: data
        });
        closeMenu();
    }

    $button.on('click', function() {
        var open = $button.attr('aria-expanded') === 'true';
        open ? closeMenu() : openMenu();
    });

    // Mouse interactions
    $menu.on('click', 'li[role="option"]', function() {
        choose($(this));
    });

    // Keyboard on trigger
    $button.on('keydown', function(e) {
        if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMenu();
        }
    });

    // Keyboard in menu
    $menu.on('keydown', function(e) {
        var $items = $menu.find('li[role="option"]');
        if (!$items.length) return;

        switch (e.key) {
        case 'Escape': closeMenu(); $button.focus(); break;
        case 'ArrowDown': e.preventDefault(); setActive(activeIndex + 1); break;
        case 'ArrowUp': e.preventDefault(); setActive(activeIndex - 1); break;
        case 'Home': e.preventDefault(); setActive(0); break;
        case 'End': e.preventDefault(); setActive($items.length - 1); break;
        case 'Enter':
        case ' ': e.preventDefault(); choose($items.eq(activeIndex).length ? $items.eq(activeIndex) : $items.eq(0)); break;
        }
    });

    function bindOutside() {
        outsideHandler = function(e) {
            if (!$root[0].contains(e.target)) {
                closeMenu();
            }
        };
        $(document).on('mousedown', outsideHandler);
    }

    function unbindOutside() {
        if (outsideHandler) {
            $(document).off('mousedown', outsideHandler);
        }
    }
    /*** \Report page bulk action selector ****/

    // auto check the update box when text changes
    $(document).on('change', '.wpil-activity-table input[type="text"]', function(){
        $(this).parents('tr').find('td .wpil_activity_select').prop('checked', true);
        $('.wpil-update-activity-items a').removeClass('disabled');
    });

    /** \Report page actions and activity **/

    /*** Dashboard AI Fix runner (stub) ***/
    var wpilAiFixJobs = {};
    var wpilAiFixRunnerHooks = {};

    function wpilAiFixParseInt(val){
        var parsed = parseInt(val, 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    function wpilAiFixNormalizeContext(ctx){
        ctx = ctx || {};

        return {
            type: (ctx.type || '').toString(),
            itemId: (ctx.itemId !== undefined && ctx.itemId !== null)
                ? String(ctx.itemId)
                : ((ctx.item_id !== undefined && ctx.item_id !== null) ? String(ctx.item_id) : ''),
            estimate: wpilAiFixParseInt(ctx.estimate || 0),
            startId: (ctx.startId || ctx.start_id || '').toString(),
            processKey: (ctx.processKey || ctx.process_key || '').toString(),
            specialOptions: ctx.specialOptions || ctx.special_options || null,
            processCurrentMap: !!(ctx.processCurrentMap || ctx.process_current_map),
            description: (ctx.description || '').toString(),
            balance: wpilAiFixParseInt(ctx.balance || 0)
        };
    }

    function wpilAiFixGetJobKey(ctx){
        var normalized = wpilAiFixNormalizeContext(ctx);
        if(!normalized.type){
            return '';
        }

        return normalized.type + ':' + normalized.itemId;
    }

    function wpilAiFixCallHook(name, args){
        if($.isFunction(wpilAiFixRunnerHooks[name])){
            return wpilAiFixRunnerHooks[name].apply(window, args || []);
        }

        return null;
    }

    function wpilAiFixResolveProcessKey(ctx){
        var normalized = wpilAiFixNormalizeContext(ctx);
        if(normalized.processKey){
            return normalized.processKey;
        }

        var processKey = wpilAiFixCallHook('getProcessKey', [normalized]);
        return processKey ? String(processKey) : '';
    }

    function wpilAiFixResolveLinkMode(){
        var mode = wpilAiFixCallHook('getLinkMode', []);
        return (mode === 'review' || mode === 'manual_select') ? 'review' : 'auto';
    }

    function wpilAiFixResolveSpecialOptions(ctx){
        var normalized = wpilAiFixNormalizeContext(ctx);
        if(normalized.specialOptions){
            return normalized.specialOptions;
        }

        var options = wpilAiFixCallHook('getSpecialOptions', [normalized]);
        return options || {};
    }

    function wpilAiFixGetPendingStartKey(ctx){
        var normalized = wpilAiFixNormalizeContext(ctx);
        if(!normalized.type){
            return '';
        }

        return 'wpil_fix_pending_start:' + normalized.type + ':' + normalized.itemId;
    }

    function wpilAiFixSavePendingStart(ctx){
        var key = wpilAiFixGetPendingStartKey(ctx);
        if(!key || !window.localStorage){
            return;
        }

        var normalized = wpilAiFixNormalizeContext(ctx);
        normalized.processKey = wpilAiFixResolveProcessKey(normalized);

        try{
            window.localStorage.setItem(key, JSON.stringify({
                type: normalized.type,
                itemId: normalized.itemId,
                estimate: normalized.estimate,
                processKey: normalized.processKey,
                savedAt: Date.now()
            }));
        }catch(e){}
    }

    function wpilAiFixClearPendingStart(ctx){
        var key = wpilAiFixGetPendingStartKey(ctx);
        if(!key || !window.localStorage){
            return;
        }

        try{
            window.localStorage.removeItem(key);
        }catch(e){}
    }

    function wpilAiFixGetPendingStarts(){
        if(!window.localStorage){
            return [];
        }

        var pending = [];
        try{
            for(var i = 0; i < window.localStorage.length; i++){
                var key = window.localStorage.key(i);
                if(!key || key.indexOf('wpil_fix_pending_start:') !== 0){
                    continue;
                }

                var raw = window.localStorage.getItem(key);
                if(!raw){
                    continue;
                }

                var parsed = JSON.parse(raw);
                if(!parsed || !parsed.type){
                    continue;
                }

                if((Date.now() - wpilAiFixParseInt(parsed.savedAt)) > (15 * 60 * 1000)){
                    window.localStorage.removeItem(key);
                    continue;
                }

                pending.push({
                    type: parsed.type,
                    itemId: parsed.itemId || '',
                    estimate: wpilAiFixParseInt(parsed.estimate),
                    processKey: parsed.processKey || ''
                });
            }
        }catch(e){}

        return pending;
    }

    function wpilAiFixEmit(eventName, args){
        $(document).trigger(eventName, args || []);
    }

    function wpilAiFixClearJobTimer(job){
        if(job && job.timer){
            window.clearTimeout(job.timer);
            job.timer = null;
        }
    }

    function wpilAiFixRegisterJob(ctx, overrides){
        var normalized = wpilAiFixNormalizeContext(ctx);
        var jobKey = wpilAiFixGetJobKey(normalized);
        if(!jobKey){
            return null;
        }

        var existing = wpilAiFixJobs[jobKey] || null;
        var job = existing || {
            key: jobKey,
            ctx: normalized,
            timer: null,
            lastData: null,
            failures: 0,
            transportMode: 'run'
        };

        job.ctx = $.extend({}, job.ctx || {}, normalized);
        job.ctx.processKey = wpilAiFixResolveProcessKey(job.ctx);
        job.transportMode = job.transportMode || 'run';

        if(overrides){
            $.extend(job, overrides);
        }

        wpilAiFixJobs[jobKey] = job;
        return job;
    }

    function wpilAiFixBuildPayload(ctx, step){
        var normalized = wpilAiFixNormalizeContext(ctx);
        normalized.processKey = wpilAiFixResolveProcessKey(normalized);

        var payload = {
            action: 'wpil_ai_fix_process',
            nonce: (window.WPIL_AI_FIX_NONCE || ''),
            fix_type: normalized.type,
            item_id: normalized.itemId,
            estimate: normalized.estimate,
            start_id: normalized.startId || '',
            process_key: normalized.processKey,
            link_mode: wpilAiFixResolveLinkMode(),
            process_current_map: normalized.processCurrentMap ? 1 : 0,
            step: step || 'run'
        };

        if(payload.step === 'start'){
            payload.special_options = wpilAiFixResolveSpecialOptions(normalized);
        }

        return payload;
    }

    function wpilAiFixParseJsonError(xhr, textStatus){
        var message = 'Unable to continue the AI fix.';
        var retryable = true;
        var code = 'request_failed';
        var status = (xhr && xhr.status) ? xhr.status : 0;

        if(xhr && xhr.responseJSON && xhr.responseJSON.data && xhr.responseJSON.data.message){
            message = xhr.responseJSON.data.message;
        }else if(xhr && xhr.responseText){
            try{
                var parsed = JSON.parse(xhr.responseText);
                if(parsed && parsed.data && parsed.data.message){
                    message = parsed.data.message;
                }
            }catch(e){}
        }else if(textStatus){
            message = textStatus;
        }

        if(status === 403 || status === 400){
            retryable = false;
        }else if(status >= 500 || status === 0){
            retryable = true;
        }

        if(status === 403){
            code = 'forbidden';
        }else if(status === 400){
            code = 'bad_request';
        }else if(status >= 500){
            code = 'server_error';
        }

        return {
            code: code,
            message: message,
            retryable: retryable,
            status: status
        };
    }

    function wpilAiFixFinalizeJob(jobKey, data){
        var job = wpilAiFixJobs[jobKey];
        if(!job){
            return;
        }

        wpilAiFixClearJobTimer(job);
        job.lastData = data || job.lastData || {
            status: 'idle',
            progress: 0,
            message: 'No active job'
        };
        wpilAiFixClearPendingStart(job.ctx);

        delete wpilAiFixJobs[jobKey];

        wpilAiFixEmit('wpil:fix_finished', [job.ctx, job.lastData, job]);
        wpilAiFixCallHook('onFinish', [job.ctx, job.lastData, job]);

        if(job.lastData.status === 'cancelled'){
            wpilAiFixEmit('wpil:fix_cancelled', [job.ctx, job.lastData, job]);
            wpilAiFixCallHook('onCancelled', [job.ctx, job.lastData, job]);
        }
    }

    function wpilAiFixSchedule(job, step, delay){
        if(!job || !wpilAiFixJobs[job.key]){
            return;
        }

        wpilAiFixClearJobTimer(job);
        job.timer = window.setTimeout(function(){
            wpilAiFixRequest(job, step);
        }, Math.max(0, wpilAiFixParseInt(delay)));
    }

    function wpilAiFixHandleRetryableError(job, step, error){
        if(!job || !wpilAiFixJobs[job.key]){
            return;
        }

        job.failures = wpilAiFixParseInt(job.failures) + 1;
        wpilAiFixEmit('wpil:fix_error', [job.ctx, error, job, step]);
        wpilAiFixCallHook('onError', [job.ctx, error, job, step]);

        if(!error.retryable){
            wpilAiFixFinalizeJob(job.key, $.extend({}, job.lastData || {}, {
                status: 'error',
                message: error.message || 'Unable to continue the AI fix.'
            }));
            return;
        }

        if(step === 'start' || step === 'run'){
            job.transportMode = 'status';
        }

        wpilAiFixSchedule(job, 'status', Math.min(4000, 1500 + (job.failures * 400)));
    }

    function wpilAiFixHandleSuccess(job, step, res){
        if(!job || !wpilAiFixJobs[job.key]){
            return;
        }

        if(!res || !res.success || !res.data){
            wpilAiFixHandleRetryableError(job, step, {
                code: 'invalid_response',
                message: 'Unexpected AI fix response.',
                retryable: true,
                status: 200
            });
            return;
        }

        var data = res.data;
        if(data.process_key){
            job.ctx.processKey = String(data.process_key);
        }
        job.lastData = data;
        job.failures = 0;

        if(step === 'start' && data.status === 'running'){
            wpilAiFixClearPendingStart(job.ctx);
        }

        wpilAiFixEmit('wpil:fix_updated', [job.ctx, data, job, step, !!res.skip]);
        wpilAiFixCallHook('onUpdate', [job.ctx, data, job, step, !!res.skip]);

        if(data.status === 'complete' || data.status === 'cancelled' || data.status === 'idle' || data.status === 'error'){
            wpilAiFixFinalizeJob(job.key, data);
            return;
        }

        if(res.skip){
            job.transportMode = 'status';
        }else if(step === 'status' && data.status === 'running'){
            job.transportMode = 'run';
        }

        wpilAiFixSchedule(job, (job.transportMode === 'status') ? 'status' : 'run', (job.transportMode === 'status') ? 1500 : 1200);
    }

    function wpilAiFixRequest(job, step){
        if(!job || !job.ctx || !job.ctx.type || typeof ajaxurl === 'undefined'){
            return;
        }

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: wpilAiFixBuildPayload(job.ctx, step)
        }).done(function(res){
            wpilAiFixHandleSuccess(job, step, res);
        }).fail(function(xhr, textStatus){
            wpilAiFixHandleRetryableError(job, step, wpilAiFixParseJsonError(xhr, textStatus));
        });
    }

    function wpilAiFixCheckStatus(ctx, callback){
        var normalized = wpilAiFixNormalizeContext(ctx);
        if(!normalized.type || typeof ajaxurl === 'undefined'){
            if($.isFunction(callback)){
                callback({
                    success: false,
                    data: null,
                    error: {
                        code: 'missing_context',
                        message: 'Missing AI fix context.',
                        retryable: false,
                        status: 0
                    }
                });
            }
            return;
        }

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: wpilAiFixBuildPayload(normalized, 'status')
        }).done(function(res){
            if($.isFunction(callback)){
                callback({
                    success: !!(res && res.success && res.data),
                    data: (res && res.success && res.data) ? res.data : null,
                    skip: !!(res && res.skip),
                    error: (res && res.success && res.data) ? null : {
                        code: 'invalid_response',
                        message: 'Unexpected AI fix status response.',
                        retryable: true,
                        status: 200
                    }
                });
            }
        }).fail(function(xhr, textStatus){
            if($.isFunction(callback)){
                callback({
                    success: false,
                    data: null,
                    error: wpilAiFixParseJsonError(xhr, textStatus)
                });
            }
        });
    }

    function wpilAiFixStart(ctx){
        var normalized = wpilAiFixNormalizeContext(ctx);
        var jobKey = wpilAiFixGetJobKey(normalized);
        if(!jobKey){
            return null;
        }

        if(wpilAiFixJobs[jobKey]){
            return wpilAiFixJobs[jobKey];
        }

        normalized.processKey = wpilAiFixResolveProcessKey(normalized);
        if(!normalized.startId){
            normalized.startId = 'wpil_fix_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        }
        var job = wpilAiFixRegisterJob(normalized, {
            transportMode: 'run',
            lastData: {
                status: 'running',
                progress: 0,
                message: 'Starting...',
                process_key: normalized.processKey
            }
        });

        wpilAiFixSavePendingStart(normalized);
        wpilAiFixEmit('wpil:fix_started', [job.ctx, job]);
        wpilAiFixCallHook('onStart', [job.ctx, job]);
        wpilAiFixRequest(job, 'start');

        return job;
    }

    function wpilAiFixResume(ctx, statusData, options){
        var normalized = wpilAiFixNormalizeContext(ctx);
        var jobKey = wpilAiFixGetJobKey(normalized);
        if(!jobKey){
            return null;
        }

        var existed = !!wpilAiFixJobs[jobKey];
        if(statusData && statusData.process_key){
            normalized.processKey = String(statusData.process_key);
        }else{
            normalized.processKey = wpilAiFixResolveProcessKey(normalized);
        }

        var job = wpilAiFixRegisterJob(normalized, {
            transportMode: (options && options.transportMode === 'status') ? 'status' : 'run'
        });

        if(statusData){
            job.lastData = statusData;
            wpilAiFixEmit('wpil:fix_updated', [job.ctx, statusData, job, 'hydrate', false]);
            wpilAiFixCallHook('onUpdate', [job.ctx, statusData, job, 'hydrate', false]);
        }

        if(!existed){
            wpilAiFixEmit('wpil:fix_started', [job.ctx, job]);
            wpilAiFixCallHook('onStart', [job.ctx, job]);
        }

        if(statusData && statusData.status && statusData.status !== 'running'){
            wpilAiFixFinalizeJob(job.key, statusData);
            return job;
        }

        wpilAiFixClearPendingStart(job.ctx);
        wpilAiFixSchedule(job, (job.transportMode === 'status') ? 'status' : 'run', (options && options.delay !== undefined) ? options.delay : 25);
        return job;
    }

    function wpilAiFixFindContext(type, itemId){
        var normalizedItemId = (itemId === undefined || itemId === null) ? '' : String(itemId);
        var matched = null;

        $.each(wpilAiFixJobs, function(jobKey, job){
            if(matched || !job || !job.ctx || job.ctx.type !== type){
                return;
            }

            var ctxItemId = (job.ctx.itemId === undefined || job.ctx.itemId === null) ? '' : String(job.ctx.itemId);
            if(normalizedItemId !== '' && ctxItemId !== normalizedItemId){
                return;
            }

            matched = $.extend({}, job.ctx);
        });

        if(matched){
            return matched;
        }

        return {
            type: type || '',
            itemId: normalizedItemId,
            estimate: 0,
            processKey: ''
        };
    }

    function wpilAiFixCancel(ctx, callback){
        var normalized = wpilAiFixNormalizeContext(ctx);
        if(!normalized.type || typeof ajaxurl === 'undefined'){
            return;
        }

        normalized.processKey = wpilAiFixResolveProcessKey(normalized);

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: wpilAiFixBuildPayload(normalized, 'cancel')
        }).done(function(res){
            if(!res || !res.success || !res.data){
                var invalidError = {
                    code: 'invalid_response',
                    message: 'Unexpected AI fix cancel response.',
                    retryable: false,
                    status: 200
                };
                wpilAiFixEmit('wpil:fix_error', [normalized, invalidError, null, 'cancel']);
                wpilAiFixCallHook('onError', [normalized, invalidError, null, 'cancel']);
                if($.isFunction(callback)){
                    callback({
                        success: false,
                        data: null,
                        error: invalidError
                    });
                }
                return;
            }

            wpilAiFixClearPendingStart(normalized);

            var jobKey = wpilAiFixGetJobKey(normalized);
            if(wpilAiFixJobs[jobKey]){
                wpilAiFixFinalizeJob(jobKey, res.data);
            }else{
                wpilAiFixEmit('wpil:fix_finished', [normalized, res.data, null]);
                wpilAiFixCallHook('onFinish', [normalized, res.data, null]);
                wpilAiFixEmit('wpil:fix_cancelled', [normalized, res.data, null]);
                wpilAiFixCallHook('onCancelled', [normalized, res.data, null]);
            }

            if($.isFunction(callback)){
                callback({
                    success: true,
                    data: res.data,
                    error: null
                });
            }
        }).fail(function(xhr, textStatus){
            var error = wpilAiFixParseJsonError(xhr, textStatus);
            wpilAiFixEmit('wpil:fix_error', [normalized, error, null, 'cancel']);
            wpilAiFixCallHook('onError', [normalized, error, null, 'cancel']);

            if($.isFunction(callback)){
                callback({
                    success: false,
                    data: null,
                    error: error
                });
            }
        });
    }

    function wpilAiFixHydrateRunningJobs(jobs){
        $.each((jobs && typeof jobs === 'object') ? jobs : {}, function(jobKey, job){
            var ctx = {
                type: (job && job.type) ? job.type : '',
                itemId: (job && job.itemId !== undefined) ? job.itemId : '',
                estimate: wpilAiFixParseInt(job && job.estimate),
                processKey: (job && job.processKey) ? job.processKey : ''
            };

            if(!ctx.type){
                return;
            }

            wpilAiFixCheckStatus(ctx, function(result){
                if(!result || !result.success || !result.data){
                    return;
                }

                if(result.data.status === 'running'){
                    wpilAiFixResume(ctx, result.data, { transportMode: 'run' });
                }
            });
        });
    }

    function wpilAiFixHydratePendingStarts(){
        $.each(wpilAiFixGetPendingStarts(), function(index, ctx){
            if(wpilAiFixJobs[wpilAiFixGetJobKey(ctx)]){
                return;
            }

            wpilAiFixCheckStatus(ctx, function(result){
                if(!result){
                    return;
                }

                if(result.success && result.data && result.data.status === 'running'){
                    wpilAiFixResume(ctx, result.data, { transportMode: 'run' });
                    return;
                }

                if(result.success && result.data && result.data.status !== 'running'){
                    wpilAiFixClearPendingStart(ctx);
                }
            });
        });
    }

    window.wpilAiFixRunner = {
        configure: function(options){
            wpilAiFixRunnerHooks = $.extend({}, wpilAiFixRunnerHooks, options || {});
            return this;
        },
        getJobKey: function(ctx){
            return wpilAiFixGetJobKey(ctx);
        },
        getJob: function(ctx){
            var key = wpilAiFixGetJobKey(ctx);
            return key && wpilAiFixJobs[key] ? wpilAiFixJobs[key] : null;
        },
        getActiveJobs: function(){
            return wpilAiFixJobs;
        },
        start: function(ctx){
            return wpilAiFixStart(ctx);
        },
        resume: function(ctx, statusData, options){
            return wpilAiFixResume(ctx, statusData, options || {});
        },
        checkStatus: function(ctx, callback){
            wpilAiFixCheckStatus(ctx, callback);
        },
        cancel: function(ctx, callback){
            wpilAiFixCancel(ctx, callback);
        },
        cancelByType: function(type, itemId, callback){
            wpilAiFixCancel(wpilAiFixFindContext(type, itemId), callback);
        },
        hydrateRunningJobs: function(jobs){
            wpilAiFixHydrateRunningJobs(jobs);
        },
        hydratePendingStarts: function(){
            wpilAiFixHydratePendingStarts();
        }
    };

    function wpilAiHistoryGetShell(){
        return $('[data-wpil-ai-history-shell]').first();
    }

    function wpilAiHistoryGetViewMode($shell){
        var $panel = $shell.find('[data-wpil-ai-history-panel]').first();
        if($panel.length){
            var $toggle = $panel.find('[data-wpil-ai-history-view-toggle]');
            if($toggle.length){
                return $toggle.is(':checked') ? 'task' : 'individual';
            }

            return ($panel.attr('data-current-view') === 'task') ? 'task' : 'individual';
        }

        return 'task';
    }

    function wpilAiHistoryGetFilters($shell, page){
        var $panel = $shell.find('[data-wpil-ai-history-panel]').first();
        var filters = {
            nonce: $shell.data('nonce'),
            ai_usage_from: $shell.data('default-from') || '',
            ai_usage_to: $shell.data('default-to') || '',
            ai_usage_page: page || 1,
            ai_usage_view: 'task',
            ai_usage_events: []
        };

        if($panel.length){
            filters.ai_usage_from = $panel.find('[name="ai_usage_from"]').val() || filters.ai_usage_from;
            filters.ai_usage_to = $panel.find('[name="ai_usage_to"]').val() || filters.ai_usage_to;
            filters.ai_usage_view = wpilAiHistoryGetViewMode($shell);
            filters.ai_usage_events = $panel.find('[name="ai_usage_events[]"]').val() || [];
            if(!page){
                filters.ai_usage_page = parseInt($panel.attr('data-current-page'), 10) || 1;
            }
        }

        return filters;
    }

    function wpilAiHistoryInitSelect2($shell){
        var $select = $shell.find('[data-wpil-ai-history-events]');
        if(!$select.length || typeof $.fn.select2 !== 'function'){
            return;
        }

        var placeholder = (wpilAiHistoryGetViewMode($shell) === 'task') ? 'All AI tasks' : 'All AI events';

        $select.each(function(){
            var $el = $(this);
            if($el.hasClass('select2-hidden-accessible')){
                $el.select2('destroy');
            }

            $el.select2({
                width: '100%',
                placeholder: placeholder,
                closeOnSelect: false,
                dropdownParent: $shell.find('[data-wpil-ai-history-body]')
            });
        });
    }

    function wpilAiHistoryRenderEventOptions($shell, options, selected){
        var $select = $shell.find('[data-wpil-ai-history-events]');
        if(!$select.length){
            return;
        }

        selected = $.isArray(selected) ? selected : [];
        if($select.hasClass('select2-hidden-accessible')){
            $select.select2('destroy');
        }

        $select.empty();
        $.each(options || {}, function(value, label){
            $('<option />')
                .val(String(value))
                .text(label)
                .prop('selected', $.inArray(String(value), $.map(selected, function(item){ return String(item); })) !== -1)
                .appendTo($select);
        });

        wpilAiHistoryInitSelect2($shell);
    }

    function wpilAiHistoryRefreshEventOptions($shell){
        if(!$shell.length || $shell.data('events-loading')){
            return;
        }

        $shell.data('events-loading', true);
        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: $.extend({
                action: 'wpil_get_ai_credit_history_events'
            }, wpilAiHistoryGetFilters($shell, 1))
        }).done(function(response){
            if(response && response.success && response.data){
                wpilAiHistoryRenderEventOptions($shell, response.data.options || {}, response.data.selected || []);
            }
        }).always(function(){
            $shell.data('events-loading', false);
        });
    }

    function wpilAiHistoryClearLoading($shell){
        var $body = $shell.find('[data-wpil-ai-history-body]');
        $body.removeClass('is-loading');
        $body.find('.ai-usage-loading-overlay').remove();
    }

    function wpilAiHistorySetLoading($shell, message, isError){
        var $body = $shell.find('[data-wpil-ai-history-body]');
        var hasPanel = $body.find('[data-wpil-ai-history-panel]').length > 0;
        var classes = 'ai-usage-loading';
        if(isError){
            classes += ' is-error';
        }

        if(hasPanel && !isError){
            $body.addClass('is-loading');
            if(!$body.find('.ai-usage-loading-overlay').length){
                $body.append('<div class="ai-usage-loading-overlay"><div class="ai-usage-loading-chip">' + (message || 'Loading AI credit history...') + '</div></div>');
            }else{
                $body.find('.ai-usage-loading-chip').text(message || 'Loading AI credit history...');
            }
            return;
        }

        $body.html('<div class="' + classes + '">' + (message || 'Loading AI credit history...') + '</div>');
    }

    function wpilAiHistoryLoad($shell, page){
        if(!$shell.length || $shell.data('loading')){
            return;
        }

        $shell.data('loading', true);
        wpilAiHistorySetLoading($shell, 'Loading AI credit history...');

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: $.extend({
                action: 'wpil_get_ai_credit_history_panel'
            }, wpilAiHistoryGetFilters($shell, page))
        }).done(function(response){
            if(response && response.success && response.data && response.data.html !== undefined){
                $shell.find('[data-wpil-ai-history-body]').html(response.data.html);
                $shell.data('loaded', true);
                wpilAiHistoryInitSelect2($shell);
            }else{
                wpilAiHistorySetLoading($shell, 'We couldn\'t load the AI credit history just now.', true);
            }
        }).fail(function(){
            wpilAiHistorySetLoading($shell, 'We couldn\'t load the AI credit history just now.', true);
        }).always(function(){
            wpilAiHistoryClearLoading($shell);
            $shell.data('loading', false);
        });
    }

    $(document).on('click', '[data-wpil-ai-history-toggle]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        var $body = $shell.find('[data-wpil-ai-history-body]');
        var isOpen = $shell.hasClass('is-open');

        if(isOpen){
            $shell.removeClass('is-open');
            $(this).attr('aria-expanded', 'false');
            $body.attr('hidden', true);
            return;
        }

        $shell.addClass('is-open');
        $(this).attr('aria-expanded', 'true');
        $body.attr('hidden', false);

        if(!$shell.data('loaded')){
            wpilAiHistoryLoad($shell, 1);
        }
    });

    $(document).on('click', '[data-wpil-ai-history-apply]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        wpilAiHistoryLoad($shell, 1);
    });

    $(document).on('change', '[data-wpil-ai-history-panel] [name="ai_usage_from"], [data-wpil-ai-history-panel] [name="ai_usage_to"]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        wpilAiHistoryRefreshEventOptions($shell);
    });

    $(document).on('change', '[data-wpil-ai-history-view-toggle]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        wpilAiHistoryLoad($shell, 1);
    });

    $(document).on('click', '[data-wpil-ai-history-page]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        var page = parseInt($(this).attr('data-wpil-ai-history-page'), 10) || 1;
        wpilAiHistoryLoad($shell, page);
    });

    $(document).on('click', '[data-wpil-ai-history-sync]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        var $button = $(this);

        if(!$shell.length || $button.data('loading')){
            return;
        }

        $button.data('loading', true).addClass('is-active');
        wpilAiHistorySetLoading($shell, 'Checking for recent AI credit purchases...');

        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: $.extend({
                action: 'wpil_refresh_ai_credit_purchases'
            }, wpilAiHistoryGetFilters($shell, 1))
        }).done(function(response){
            if(response && response.success){
                wpilAiHistoryLoad($shell, 1);
                return;
            }

            wpilAiHistoryClearLoading($shell);
            window.alert((response && response.data && response.data.message) ? response.data.message : 'We couldn\'t refresh the AI credit purchases just now.');
        }).fail(function(){
            wpilAiHistoryClearLoading($shell);
            window.alert('We couldn\'t refresh the AI credit purchases just now.');
        }).always(function(){
            $button.data('loading', false).removeClass('is-active');
        });
    });

    $(document).on('click', '[data-wpil-ai-history-export]', function(){
        var $shell = $(this).closest('[data-wpil-ai-history-shell]');
        var $button = $(this);
        if(!$shell.length || $button.data('loading')){
            return;
        }

        $button.data('loading', true).text('Preparing...');
        $.ajax({
            type: 'POST',
            url: ajaxurl,
            dataType: 'json',
            data: $.extend({
                action: 'wpil_get_ai_credit_history_export_url'
            }, wpilAiHistoryGetFilters($shell, 1))
        }).done(function(response){
            if(response && response.success && response.data && response.data.url){
                window.location = response.data.url;
            }
        }).always(function(){
            $button.data('loading', false).text('Export CSV');
        });
    });

    /*** \Dashboard AI Fix runner ***/



})(jQuery);
