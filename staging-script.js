//Last Updated: 2026-08-18 by Nicolask Rak @nicolasrak
//
//****************
//GLOBAL VARIABLES
//****************
const urlParams = new URLSearchParams(window.location.search);

// ==========================================
// 1. FIRST-TOUCH
// ==========================================
const fieldMappings = [
  { key: 'utm_source',   selector: '[data-utm-id="source"]' },
  { key: 'utm_medium',   selector: '[data-utm-id="medium"]' },
  { key: 'utm_campaign', selector: '[data-utm-id="campaign"]' },
  { key: 'utm_term',     selector: '[data-utm-id="term"]' },
  { key: 'utm_content',  selector: '[data-utm-id="content"]' },
  { key: 'gclid',        selector: '[data-utm-id="gclid"]' },
  { key: 'msclkid',      selector: '[data-utm-id="msclkid"]' },
  { key: 'fbclid',       selector: '[data-utm-id="fbclid"]' },
  { key: 'rdt_cid',      selector: '[data-utm-id="rdt_cid"]' }
];

// input selectors
const initialPathInputSelector = '[data-type="initial-path-input"]';
const referrerInputSelector = '[data-type="referrer-input"]';
// localStorage keys
const initialPathKey = 'initialPath';
const initialReferrerKey = 'initialReferrer';

// ==========================================
// 2. LAST-TOUCH
// ==========================================
const ltFieldMappings = [
  { key: 'lt-utm_source',   selector: '[data-utm-id="lt-source"]' },
  { key: 'lt-utm_medium',   selector: '[data-utm-id="lt-medium"]' },
  { key: 'lt-utm_campaign', selector: '[data-utm-id="lt-campaign"]' },
  { key: 'lt-utm_term',     selector: '[data-utm-id="lt-term"]' },
  { key: 'lt-utm_content',  selector: '[data-utm-id="lt-content"]' },
  { key: 'lt-gclid',        selector: '[data-utm-id="lt-gclid"]' },
  { key: 'lt-msclkid',      selector: '[data-utm-id="lt-msclkid"]' },
  { key: 'lt-fbclid',       selector: '[data-utm-id="lt-fbclid"]' },
  { key: 'lt-rdt_cid',      selector: '[data-utm-id="lt-rdt_cid"]' }
];

// Which URL params are allowed to TRIGGER a last-touch overwrite.
// fbclid is deliberately excluded: Facebook and Instagram append it to EVERY
// outbound link (organic posts, comments, DMs), not only paid ads. If it could
// trigger the overwrite below, an organic social click would wipe existing paid
// attribution and rewrite every lt- value as an empty string.
// fbclid is still CAPTURED whenever the overwrite fires - it is just not allowed
// to fire it on its own. Pending Omer's A/B decision on the Asana ticket
// "Meta Click ID collection"; switch this back to fieldMappings if he picks B.
// gclid, msclkid and rdt_cid are NOT excluded: unlike fbclid, those are only
// ever appended on a genuine paid ad click, so each is a real new last touch.
const ltTriggerMappings = fieldMappings.filter(mapping => mapping.key !== 'fbclid');

// input selectors
const ltInitialPathInputSelector = '[data-type="lt-initial-path-input"]';
const ltReferrerInputSelector = '[data-type="lt-referrer-input"]';
// localStorage keys
const ltInitialPathKey = 'lt-initialPath';
const ltInitialReferrerKey = 'lt-initialReferrer';

// ==========================================
// 3. TOUCH AGNOSTIC
// ==========================================
const formSelector = '[data-type="form-component"]';
// The email field is identified by data-js="custom-validate" only. That
// attribute means "this field gets email validation", which is exactly the
// precondition for the gate and the shake - so one marker, not two.
const emailFieldSelector = '[data-js~="custom-validate"]';
const nameInputSelector = '[data-type="name-input"]';
const phoneInputSelector = '[data-type="phone-input"]';
const titleInputSelector = '[data-type="title-input"]';
const slugInputSelector = '[data-type="slug-input"]';
const submitButtonTextInputSelector = '[data-type="submit-button-text-input"]';
const phTypeInputSelector = '[data-type="ph-type-input"]';
const phLocationInputSelector = '[data-type="ph-location-input"]';
const phIntentInputSelector = '[data-type="ph-intent-input"]';
let activeSubmitButton = null;

// ==========================================
// 4. META PIXEL COOKIES (_fbp / _fbc)
// ==========================================
// These two are NOT URL params - they are first-party cookies written by the
// Meta Pixel, so they are read from document.cookie rather than urlParams,
// and at SUBMIT time rather than page load (the Pixel writes them
// asynchronously and is often slower than this script).
//   _fbp = browser id, no touch semantics, so no lt- twin.
//   _fbc = fb.1.<clickTime>.<fbclid>, overwritten by the Pixel on every new ad
//          click, so it is inherently a LAST-touch value.
const fbpInputSelector = '[data-type="fbp-input"]';
const ltFbcInputSelector = '[data-type="lt-fbc-input"]';
// localStorage key for the manually-built _fbc fallback
const fbcFallbackKey = 'lt-fbc-fallback';

// ==========================================
// 5. PERSONAL-EMAIL DETECTION (shared)
// ==========================================
// Moved up here from inside validateEmails() so that function and the Book a
// Demo gate below share one list. Kept as two separate copies they would drift
// apart the first time someone adds a domain to only one of them.

// 2. Define the core provider names to block (ignoring TLDs like .com, .fr, .it)
// Added common typos based on your client's request
const blockedRoots = [
  'gmail', 'gmai', 'googlemail', 'jmail',
  'outlook', 'hotmail', 'live', 'msn',
  'icloud', 'iclouud', 'me',
  'yahoo', 'ymail',
  'mg',
  'qq', 'aol', 'cox', 'comcast',
  'yandex', 'gmx', 'onmicrosoft'
  // Add any other root words or common typos here
];

// 3. Define exact domains (for domains that are too risky to use as a root word)
// E.g., If we blocked the root word "mail", it would accidentally block valid
// corporate emails like "user@mail.companyllc.com".
const exactDomains = [
  'mail.ru', 'gmailcom'
];

// Build the regular expression strings
const rootsPattern = blockedRoots.join('|');
const exactPattern = exactDomains.map(d => d.replace(/\./g, '\\.')).join('|');

// The New Regular Expression Breakdown:
// Part 1: @([a-z0-9-]+\.)*(${rootsPattern})\.[a-z.]+$
// -> Matches @, followed by optional subdomains, then the blocked root (e.g. gmai), a dot, and ANY domain extension (.com, .fr, .co.uk)
// Part 2: @([a-z0-9-]+\.)*(${exactPattern})$
// -> Matches exact domains like mail.ru
const personalEmailRegex = new RegExp(
  `@([a-z0-9-]+\\.)*(${rootsPattern})\\.[a-z.]+$|@([a-z0-9-]+\\.)*(${exactPattern})$`,
  'i'
);

// Book a Demo gate selectors
// Opt-in only: a form gets this behaviour when it carries
// data-js="book-demo-email-gate", so a newly built form never inherits it by
// accident. Put it on the same element that holds data-type="form-component"
// (the attribute is also accepted directly on the <form>).
const bookDemoGateSelector = '[data-js~="book-demo-email-gate"]';
const emailValidateFormSelector = '[data-js~="email-validate-form"]';
const bookDemoButtonSelector = '[data-js="redirect-to-book-a-demo"]';
const emailErrorSelector = '[data-js="email-error"]';
const emailErrorActiveClass = 'cc-active';
// Shake animation on the email field itself. Requested per TRIGGER, not per
// form: a submit is a deliberate action and should shake, whereas the demo
// form's as-you-type check must not, or the field judders on every keystroke.
const emailTremorClass = 'cc-tremor';



//****************
//GLOBAL FUNCTIONS
//****************

function saveFirstVisitValues() {
  // ==========================================
  // FIRST-TOUCH
  // ==========================================

  // 1. Save initial path (if empty)
  if (localStorage.getItem(initialPathKey) === null) {
    localStorage.setItem(initialPathKey, window.location.pathname);
  }

  // 2. Save initial referrer (if empty)
  if (localStorage.getItem(initialReferrerKey) === null) {
    const fullReferrer = document.referrer || 'direct';
    localStorage.setItem(initialReferrerKey, fullReferrer);
  }

  // 3. Save initial UTMs (if empty)
  fieldMappings.forEach(mapping => {
    if (localStorage.getItem(mapping.key) === null) {
      const value = urlParams.get(mapping.key) || '';
      localStorage.setItem(mapping.key, value);
    }
  });
}

function saveLastVisitValues() {
  // ==========================================
  // LAST-TOUCH
  // ==========================================

  // 1. Is this an internal navigation? (Did they come from your own domain?)
  const isInternalTraffic = document.referrer.includes(window.location.hostname);

  // 2. Check if the current URL contains ANY standard marketing parameters
  // Uses ltTriggerMappings, not fieldMappings, so a bare fbclid (which Facebook
  // adds to organic links too) cannot trigger the overwrite on its own.
  const hasMarketingParams = ltTriggerMappings.some(mapping => urlParams.has(mapping.key));

  // 3. The Aggressive Overwrite (ONLY if it's external inbound traffic)
  if (hasMarketingParams && !isInternalTraffic) {

    // Overwrite Path and Referrer
    localStorage.setItem(ltInitialPathKey, window.location.pathname);
    localStorage.setItem(ltInitialReferrerKey, document.referrer || 'direct');

    // Overwrite UTMs
    // Still loops fieldMappings, so lt-fbclid IS written when a properly tagged
    // ad click fires the overwrite - fbclid just cannot fire it by itself.
    fieldMappings.forEach(mapping => {
      const value = urlParams.get(mapping.key) || '';
      localStorage.setItem('lt-' + mapping.key, value);
    });
  }
}

function saveFbcFallback() {
  // Meta's _fbc cookie only exists once the Pixel has loaded AND ad consent
  // allows it, so it is usually absent on the landing pageview - exactly the
  // pageview that carries the fbclid. Build Meta's documented
  // fb.1.<timestamp>.<fbclid> format ourselves and keep it as a fallback.
  // Stamped here at page load so the timestamp stays close to the actual click.
  // The real cookie always wins over this when it exists.
  const fbclid = urlParams.get('fbclid');

  if (!fbclid) {
    return;
  }

  localStorage.setItem(fbcFallbackKey, 'fb.1.' + Date.now() + '.' + fbclid);
}

function getCookieValue(cookieName) {
// This function reads a single raw cookie by name, returning '' when absent
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + cookieName + '=([^;]*)'));

  return match ? decodeURIComponent(match[1]) : '';
}

function populateMetaCookieFields() {
  // Called at submit time (and once at load as a best effort for returning
  // visitors whose cookies already exist). Both fields stay empty when the
  // Pixel is blocked by cookie consent, which is the correct outcome.
  updateInputValue(fbpInputSelector, getCookieValue('_fbp'));

  const fbc = getCookieValue('_fbc') || localStorage.getItem(fbcFallbackKey) || '';
  updateInputValue(ltFbcInputSelector, fbc);
}

function updateInputValue(selector, value) {
// This function finds all elements matching the selector and updates their value
  const fields = document.querySelectorAll(selector);

  // if no fields are found, or if the value is empty, do nothing
  if (!fields.length || !value) {
    return;
  }

  fields.forEach(field => {
    field.value = value;
  });
}

function populateHiddenFields() {
  // ==========================================
  // 1. FIRST-TOUCH values
  // ==========================================
  fieldMappings.forEach(mapping => {
    const value = localStorage.getItem(mapping.key);
    updateInputValue(mapping.selector, value);
  });

  const initialPath = localStorage.getItem(initialPathKey);
  updateInputValue(initialPathInputSelector, initialPath);

  const referrer = localStorage.getItem(initialReferrerKey);
  updateInputValue(referrerInputSelector, referrer);

  // ==========================================
  // 2. LAST-TOUCH values
  // ==========================================
  ltFieldMappings.forEach(mapping => {
    const value = localStorage.getItem(mapping.key);
    updateInputValue(mapping.selector, value);
  });

  const ltPath = localStorage.getItem(ltInitialPathKey);
  updateInputValue(ltInitialPathInputSelector, ltPath);

  const ltReferrer = localStorage.getItem(ltInitialReferrerKey);
  updateInputValue(ltReferrerInputSelector, ltReferrer);

  // ==========================================
  // 3. TOUCH-AGNOSTIC values
  // ==========================================
  const pageTitle = document.title;
  updateInputValue(titleInputSelector, pageTitle);

  const slug = window.location.pathname;
  updateInputValue(slugInputSelector, slug);
}

function appendUtmToLinks() {
  // We're using the first touch attributes to append the links to the app
  const links = document.querySelectorAll('a[href*="app.sibe.io"]');

  if (!links.length) {
    return;
  }

  links.forEach(link => {
    const url = new URL(link.href);
    const searchParams = url.searchParams;

    // Append UTM parameters from localStorage
    fieldMappings.forEach(mapping => {
      const value = localStorage.getItem(mapping.key);
      if (value && !searchParams.has(mapping.key)) {
        searchParams.set(mapping.key, value);
      }
    });

    link.href = url.toString();
  });
}

function toggleEmailError(scope, shouldShow, withTremor) {
// This function shows or hides the personal-email message inside one form.
// It is the single place that knows WHERE the message lives and WHICH classes
// reveal it; gateFormsOnWorkEmail() only decides WHEN - clearing it on input,
// showing it with a shake on a rejected submit.
// Pass withTremor to also shake the email field. Kept opt-in rather than
// automatic so the clear-on-input path can never trigger it.
// Returns false when the form has no error element, so a caller can warn.
  const emailError = scope ? scope.querySelector(emailErrorSelector) : null;
  const emailInput = scope ? scope.querySelector(emailFieldSelector) : null;

  if (emailInput) {
    // Always strip the class first. A CSS animation only runs when the class
    // is newly applied, so re-adding it to an element that already has it does
    // nothing - a second rejected click on an unchanged address would show no
    // shake at all. Reading offsetWidth forces the browser to flush the removal
    // before the re-add, which restarts the animation.
    emailInput.classList.remove(emailTremorClass);

    if (shouldShow && withTremor) {
      void emailInput.offsetWidth;
      emailInput.classList.add(emailTremorClass);
    }
  }

  if (!emailError) {
    return false;
  }

  emailError.classList.toggle(emailErrorActiveClass, shouldShow);
  return true;
}

function gateFormsOnWorkEmail() {
  // ONE behaviour for every gated form: the user can click freely, and a
  // personal address is stopped at the submit itself - blocked, message shown,
  // field shaken. Nothing is ever disabled, and nothing is checked while typing.
  //
  // This replaces the old validateEmails(), which greyed the buttons out on
  // every keystroke. That approach only held while its input listener had
  // actually run, so an autofilled or programmatically-set address sailed
  // straight through; and a not-allowed cursor on a dead button explains
  // nothing. Blocking at submit is both stricter and clearer.
  //
  // Two opt-in attributes. They differ in ONE respect - which submit is gated:
  //
  //   data-js="book-demo-email-gate"  gates ONLY the Book a Demo button, so the
  //                                   inline forms keep their free-trial path
  //                                   open to personal addresses
  //
  //   data-js="email-validate-form"   gates EVERY submit, for Demo Request
  //                                   forms, which offer no free-trial
  //                                   alternative to fall back on
  //
  // Nothing is inferred from a form's structure: a form built later gets this
  // behaviour only if someone deliberately tags it.
  const forms = document.querySelectorAll(bookDemoGateSelector + ', ' + emailValidateFormSelector);
  if (!forms.length) return;

  forms.forEach(wrapper => {
    // Accept the attribute either on a wrapper or directly on the form element
    const form = wrapper.matches('form') ? wrapper : wrapper.querySelector('form');
    const emailInput = wrapper.querySelector(emailFieldSelector);
    const emailError = wrapper.querySelector(emailErrorSelector);

    // Only the inline forms care WHICH button submitted; everywhere else every
    // submit is gated.
    const gateOneButton = wrapper.matches(bookDemoGateSelector);
    const demoButton = gateOneButton ? wrapper.querySelector(bookDemoButtonSelector) : null;

    if (!form || !emailInput) {
      return;
    }

    // A form asking for the button-specific gate but carrying no Book a Demo
    // button has nothing to gate - leaving it wired would silently gate nothing
    if (gateOneButton && !demoButton) {
      console.warn('[sibe] book-demo-email-gate: no ' + bookDemoButtonSelector + ' inside this form. Nothing will be gated.', wrapper);
      return;
    }

    // Blocking a submit with no visible explanation is the worst outcome here -
    // the user clicks and nothing happens. Say so loudly at setup rather than
    // leaving it to be discovered in production.
    if (!emailError) {
      console.warn('[sibe] email gate: no ' + emailErrorSelector + ' inside this form. Submissions will be blocked with no message shown.', wrapper);
    }

    // Clear the message as soon as they start correcting the address
    emailInput.addEventListener('input', function() {
      toggleEmailError(wrapper, false);
    });

    form.addEventListener('submit', function(e) {
      if (gateOneButton) {
        // e.submitter is the button that triggered submission, and it is
        // populated for Enter-key submits too - those resolve to the form's
        // first submit button, which is Book a Demo. Binding to the button's
        // click instead would miss that and leave the gate bypassable.
        const submitter = e.submitter || activeSubmitButton;

        // Anything other than Book a Demo passes straight through. "Try Sibe
        // for free" must keep accepting personal addresses.
        if (submitter !== demoButton) {
          toggleEmailError(wrapper, false);
          return;
        }
      }

      // The input is type="email" required, so the browser has already enforced
      // format and non-emptiness before this event fires at all.
      if (personalEmailRegex.test(emailInput.value.trim())) {
        e.preventDefault();
        // Capture phase + stopImmediatePropagation keeps the event away from
        // Webflow's own submit handler, which would otherwise still AJAX it
        // through - preventDefault alone does not stop propagation.
        e.stopImmediatePropagation();
        // Shake: every rejection here came from a deliberate submit, and it
        // re-shakes on repeat submits even with the address unchanged.
        toggleEmailError(wrapper, true, true);
        emailInput.focus();
      }
    }, true); // capture, so we run before Webflow
  });
}

function handleButtonAnalytics() {
  const forms = document.querySelectorAll(formSelector);
  if (!forms.length) return;

  // 1. The Bridge: Listen for the click to know WHICH button was used
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[type="submit"]');
    if (btn) activeSubmitButton = btn;
  });

  // 2. The Injector: Fill the hidden fields right before the form submits
  forms.forEach(form => {
    form.addEventListener('submit', function() {
      if (activeSubmitButton) {
        const btnText = activeSubmitButton.value || activeSubmitButton.innerText || "Unknown Button";

        // Use your existing updateInputValue helper to populate the hidden fields
        // This ensures Make.com receives this data in the JSON payload
        updateInputValue(submitButtonTextInputSelector, btnText);
        updateInputValue(phTypeInputSelector, activeSubmitButton.getAttribute('data-ph-capture-attribute-type'));
        updateInputValue(phLocationInputSelector, activeSubmitButton.getAttribute('data-ph-capture-attribute-location'));
        updateInputValue(phIntentInputSelector, activeSubmitButton.getAttribute('data-ph-capture-attribute-intent'));
      }
    }, true); // Use capture phase to ensure this runs first
  });
}

function handleMetaCookieCapture() {
  const forms = document.querySelectorAll(formSelector);
  if (!forms.length) return;

  // 1. Best effort at load - covers returning visitors whose Pixel cookies
  // already exist from an earlier session
  populateMetaCookieFields();

  // 2. Authoritative read at submit time, by which point the Pixel has almost
  // always finished writing. Deliberately kept out of handleButtonAnalytics
  // because that one only injects when a submit button is known
  forms.forEach(form => {
    form.addEventListener('submit', populateMetaCookieFields, true); // capture phase, same as above
  });
}

//****************
//INIT
//****************
//FIRST TOUCH
saveFirstVisitValues();

//LAST TOUCH
saveLastVisitValues();

//META PIXEL _fbc fallback (must run before any field population)
saveFbcFallback();

//Populating fields & appending button urls
populateHiddenFields();
appendUtmToLinks();

//Work-email gate on both form types - blocks at submit, never disables
//Runs BEFORE handleButtonAnalytics so a blocked submit never reaches its
//listener and cannot write analytics fields for a submission that never happened
gateFormsOnWorkEmail();

//Checking which btn was clicked
handleButtonAnalytics();

//Meta Pixel cookies (_fbp / _fbc) - read from document.cookie at submit time
handleMetaCookieCapture();
//

  document.addEventListener('DOMContentLoaded', function() {
    var inputs = document.querySelectorAll('input[ms-code-phone-number]');

    inputs.forEach(function(input) {
      var preferredCountries = input.getAttribute('ms-code-phone-number').split(',');

      var iti = window.intlTelInput(input, {
        initialCountry: "auto",
        geoIpLookup: callback => {
            fetch("https://ipapi.co/json")
              .then(res => res.json())
              .then(data => callback(data.country_code))
              .catch(() => callback("us"));
        },
        strictMode: true,
        separateDialCode: true,
        countryOrder: preferredCountries,
        loadUtils: () => import("https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.1/build/js/utils.js"),
      });

      var form = input.closest('form');
      if (form) {
        // useCapture = true (The 'true' at the end) handles the race condition
        form.addEventListener('submit', function() {
           input.value = iti.getNumber();
        }, true);
      }
    });
  });

  var Webflow = Webflow || [];
  Webflow.push(function() {

    $(document).ajaxComplete(function(event, xhr, settings) {
      if (settings.url.includes("https://webflow.com/api/v1/form/")) {
        if (xhr.status === 200) {

          const payload = new URLSearchParams(settings.data);
          const parsedData = Object.fromEntries(payload.entries());

          const posthogProps = {
            formName: parsedData.name,
            pageId: parsedData.pageId,
            source: parsedData.source
          };

          // Clean up form fields
          for (const key in parsedData) {
            if (key.startsWith('fields[')) {
              const cleanKey = key.replace('fields[', '').replace(']', '');
              if (cleanKey === 'Field%203' || cleanKey === 'cf-turnstile-response') continue;
              posthogProps[cleanKey] = parsedData[key];
            }
          }

          posthog.capture('webflowFormSubmission', posthogProps);
          console.log("✅ PostHog Event Fired!", posthogProps);

          // Redirect Logic
          const email = posthogProps.email || '';
          const nameValue = posthogProps.name || '';
          const phoneValue = posthogProps.phone || '';
          const clickedButtonDataJs = (typeof activeSubmitButton !== 'undefined' && activeSubmitButton) ? activeSubmitButton.dataset.js : null; //activeSubmitButton is declared on global scope

          if (clickedButtonDataJs === 'redirect-to-app') {
            setTimeout(() => {
              const redirectUrl = new URL('https://app.sibe.io/auth');
              redirectUrl.searchParams.set('email', email);
              if (nameValue) redirectUrl.searchParams.set('name', nameValue);

              if (typeof fieldMappings !== 'undefined') {
                fieldMappings.forEach(mapping => {
                  const value = localStorage.getItem(mapping.key);
                  if (value && !redirectUrl.searchParams.has(mapping.key)) {
                    redirectUrl.searchParams.set(mapping.key, value);
                  }
                });
              }
              window.location.href = redirectUrl.href;
            }, 300);
          }
          else if (clickedButtonDataJs === 'redirect-to-book-a-demo') {
            if (activeSubmitButton) {
              const formElement = activeSubmitButton.closest('form');
              const successMessageElement = formElement.parentElement.querySelector('[data-js="success-message"]');
              if (successMessageElement) successMessageElement.textContent = "Redirecting...";
            }

            setTimeout(() => {
              const destinationUrl = new URL('/demo', window.location.origin);
              if (nameValue) destinationUrl.searchParams.append('name', nameValue);
              if (email) destinationUrl.searchParams.append('email', email);
              if (phoneValue) destinationUrl.searchParams.append('phone', phoneValue);
              window.location.href = destinationUrl.toString();
            }, 300);
          }

        }
      }
    });
  });
