(function($, window, document){
  'use strict';

  var LWCreditCheckout = {
    stripe: null,
    elements: null,
    paymentElement: null,
    clientSecret: null,
    activeType: null,
    activePriceId: null,
    activeQuantity: null,
    activeEmail: null,

    init: function(){
      if (!window.wpilCheckout || !window.wpilCheckout.stripePublicKey || !window.wpilCheckout.apiUrl) {
        console.error('LWCreditCheckout: missing config');
        return;
      }

      this.stripe = Stripe(window.wpilCheckout.stripePublicKey);
      this.bindUI();
    },

    bindUI: function(){
      var self = this;

      // Open modal from the "Buy" button, should contain all parameters for the sale in data attres
      $(document).on('click', '.lw-credits-buy', function(e){
        e.preventDefault();

        var $btn = $(this);
        self.activeType     = $btn.data('type') || 'custom';
        self.activePriceId  = $btn.data('price-id') || null;
        self.activeQuantity = parseInt($btn.data('quantity') || $btn.data('credits') || 0, 10) || null;

        // Left side UI (you can compute price locally or set via data-price)
        $('#lwcc-credits').text((parseInt($btn.data('credits'),10) || self.activeQuantity || '—').toLocaleString());
        $('#lwcc-price').text($btn.data('price') || '$0.00');

        self.activeEmail = (window.wpilCheckout.userEmail) ? window.wpilCheckout.userEmail : ($btn.data('email') || '');
        self.open();

        // If you already know email, create intent immediately
        // Otherwise you can add an email field. If you truly want minimal, pass email from WP.
        self.createIntent();
      });

      $(document).on('click', '[data-lwcc-close]', function(e){
        e.preventDefault();
        self.close();
      });

      $(document).on('submit', '#lwcc-form', function(e){
        e.preventDefault();
        self.submit();
      });

      $(document).on('keydown', function(e){
        if(e.key === 'Escape' && $('#lw-credit-checkout-modal').is(':visible')){
          self.close();
        }
      });
    },

    open: function(){
      $('#lwcc-errors').text('');
      this.setMessage('', '');
      $('#lw-credit-checkout-modal')
        .removeClass('hidden')
        .attr('aria-hidden', 'false')
        .show();
      $('body').addClass('lwcc-open');
    },

    close: function(){
      $('#lw-credit-checkout-modal')
        .addClass('hidden')
        .attr('aria-hidden', 'true')
        .hide();
      $('body').removeClass('lwcc-open');
      $('#lwcc-errors').text('');
      this.setMessage('', '');
      this.teardownStripe();
      this.clientSecret = null;
      this.activeType = null;
      this.activePriceId = null;
      this.activeQuantity = null;
      this.activeEmail = null;
    },

    setMessage: function(msg, type){
      var $m = $('#lwcc-message');
      $m.removeClass('is-info is-success is-error');

      if (!msg){
        $m.hide().text('');
        return;
      }

      $m.addClass(type ? ('is-' + type) : 'is-info').text(msg).show();
    },

    setLoading: function(isLoading, msg){
      if (msg) this.setMessage(msg, 'info');
      $('#lwcc-loader').toggle(!!isLoading);
      $('#lwcc-submit').prop('disabled', !!isLoading);
    },

    teardownStripe: function(){
      $('#lwcc-payment-element').empty();
      this.elements = null;
      this.paymentElement = null;
    },

    createIntent: function(){
      var self = this;

      if (!this.activeEmail) {
        this.setMessage('Missing email.', 'error');
        return;
      }

      var payload = { email: this.activeEmail, type: this.activeType };

      if (this.activeType === 'custom') {
        payload.quantity = this.activeQuantity;
      } else {
        payload.price_id = this.activePriceId;
      }

      this.setLoading(true, 'Preparing checkout...');

      $.ajax({
        url: window.wpilCheckout.apiUrl + '/create-intent',
        method: 'POST',
        dataType: 'json',
        contentType: 'application/json; charset=utf-8',
        data: JSON.stringify(payload)
      })
      .done(function(res){
        if (!res || res.error || !res.clientSecret) {
          self.setLoading(false);
          self.setMessage(res && res.error ? res.error : 'Failed to create checkout.', 'error');
          return;
        }

        self.clientSecret = res.clientSecret;

        if (res.credits) $('#lwcc-credits').text(parseInt(res.credits,10).toLocaleString());
        if (res.amount_display) $('#lwcc-price').text('$' + (res.amount_display / 100).toFixed(2));

        self.mountPaymentElement();
        self.setLoading(false, 'Enter payment details.');
      })
      .fail(function(jqXHR){
        self.setLoading(false);

        var msg = 'Network error creating checkout.';
        if (jqXHR && jqXHR.status === 0) {
          var endpoint = (window.wpilCheckout && window.wpilCheckout.apiUrl) ? window.wpilCheckout.apiUrl : 'the Link Whisper checkout endpoint';
          msg = 'Your site blocked the outbound checkout request to ' + endpoint + '. Ask your host/firewall to allow this endpoint, then try again.';
          $('#lwcc-errors').text('Outbound checkout request blocked. Allow access to ' + endpoint + ' and retry.');
        }
        self.setMessage(msg, 'error');
      });
    },

    mountPaymentElement: function(){
      this.teardownStripe();

      this.elements = this.stripe.elements({ clientSecret: this.clientSecret });
      this.paymentElement = this.elements.create('payment');
      this.paymentElement.mount('#lwcc-payment-element');
    },

    submit: function(){
      var self = this;

      if (!this.stripe || !this.elements || !this.activeType) {
        $('#lwcc-errors').text('Checkout not ready.');
        return;
      }

      $('#lwcc-errors').text('');
      this.setLoading(true, 'Confirming payment...');

      var method = (this.activeType === 'recurring') ? 'confirmSetup' : 'confirmPayment';

      this.stripe[method]({
        elements: this.elements,
        confirmParams: {
          payment_method_data: { billing_details: { email: this.activeEmail } }
        },
        redirect: 'if_required'
      }).then(function(result){
        self.setLoading(false);

        if (result.error) {
          $('#lwcc-errors').text(result.error.message || 'Payment failed.');
          return;
        }

        self.setMessage('Payment successful!', 'success');

        setTimeout(function(){
            self.close();
        }, 150);

        // trigger complete for the benefit of whoever's listening
        $(document).trigger('lwcc:paid', [result]);
      });
    }
  };

  window.LWCreditCheckout = LWCreditCheckout;

  $(function(){
    LWCreditCheckout.init();
  });

    $(document).on('lwcc:paid', function (e, result) {
        var button = $('.lw-credits-buy'),
            available = $('.ai-credits-available'),
            current = parseInt((available.text() || '0').replace(/,/g, ''), 10) || 0,
            purchase = parseInt(button.data('credits'), 10) || 0;

        $('.wpil-ai-credit-stamp').removeClass('wpil-ai-credit-stamp--bad').addClass('wpil-ai-credit-stamp--ok');
        available.text((purchase + current));
        button.hide();
    });


})(jQuery, window, document);
