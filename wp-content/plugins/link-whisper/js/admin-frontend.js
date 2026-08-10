function getData(){
    var data = {},
        search = window.location.search;
    if(search.length > 1){
        var dat = new URLSearchParams(search).get('wpil_admin_frontend_data');
        if(dat && dat.length > 1){
            var decode = JSON.parse(JSON.stringify(dat));
            try{
                decode = atob(dat);
            }catch(error){
                try{
                    decode = atob(dat+'=');
                }catch(error2){
                    console.log(error2);
                    console.log(dat);
                }
            }

            if(dat !== decode){
                data = JSON.parse(decode);
            }
        }
        
    }

    return data;
}

function selectText(element) {
    if (document.body.createTextRange) {
        const range = document.body.createTextRange();
        range.moveToElementText(element);
        range.select();
    } else if (window.getSelection) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        console.warn("Could not select text in node: Unsupported browser.");
    }
}

(function ($)
{
    $(window).on('load', function(){
        var data = getData();

        if(!data || undefined === typeof data || 'object' === typeof data && Object.keys(data).length < 1){
            return;
        }

        // if we're scrolling to a link
        if(undefined !== data.scrollLink && Object.keys(data.scrollLink).length > 1){
            var link,
                links,
                decoded = $('<textarea />').html(data.scrollLink.url).text();

            // if we can find the link's monitor id
            if(data.scrollLink.monitorId && $('[data-wpil-monitor-id="' +data.scrollLink.monitorId+ '"]').length > 0 && data.scrollLink.monitorId > 0){
                link = $('[data-wpil-monitor-id="' +data.scrollLink.monitorId+ '"]');
            }else if($('a[href="' +data.scrollLink.url+ '"]').length > 0){
                links = $('a[href="' +data.scrollLink.url+ '"]');
            }else if($('a[href="' +decoded+ '"]').length > 0){
                links = $('a[href="' +decoded+ '"]');
            }

            if(links.length){
                links.each(function(ind, element){
                    if( !link && 
                        ($(element).text().trim() === data.scrollLink.anchor.trim()) || 
                        ($(element).text().replace(new RegExp('\/+$'), '').trim() === data.scrollLink.anchor.replace(new RegExp('\/+$'), '').trim())
                    ){
                        link = $(element);
                    }
                });

                if(!link){
                    link = links.first();
                }
            }

            if(link && link.length > 0){
                setTimeout(function(){
                    const elementTop = link.offset().top;
                    const elementHeight = link.outerHeight();
                    const viewportHeight = $(window).height();
                    const centerPosition = elementTop - (viewportHeight / 2) + (elementHeight / 2);

                    $('html').animate({ scrollTop: centerPosition }, 600, function(){
                        selectText(link.get()[0]);
                    });
                }, 500);
            }
        }
    });
})(jQuery);