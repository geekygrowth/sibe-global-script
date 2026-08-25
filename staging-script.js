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
const emailInputSelector = '[data-type="email-input"]';
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
const bookDemoButtonSelector = '[data-js="redirect-to-book-a-demo"]';
const emailErrorSelector = '[data-js="email-error"]';
const emailErrorActiveClass = 'cc-active';



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

function validateEmails() {
  // 1. Select all form wrappers that need this validation
  const forms = document.querySelectorAll('[data-js="email-validate-form"]');

  if (!forms.length) {
    return;
  }

  // 2. and 3. (the blocked provider roots and the exact-domain list) now live at
  // module level as personalEmailRegex, so this function and the Book a Demo gate
  // share one source of truth. Behaviour here is unchanged - same list, same regex.
  const workEmailRegex = personalEmailRegex;

  // 4. Loop through each form and apply the validation logic
  forms.forEach(form => {
    // Find the necessary elements *inside* the current form
    const emailInput = form.querySelector('[data-js~="custom-validate"]');
    const emailError = form.querySelector('[data-js="email-error"]');
    const submitButtons = form.querySelectorAll('[type="submit"]');
    const nextButtons = form.querySelectorAll('[data-form-nav="next"]');

    // If any essential element is missing, skip this form
    if (!emailInput || !emailError || !submitButtons.length) {
      return;
    }

    function checkEmail() {
      const email = emailInput.value.trim();

      if (email && workEmailRegex.test(email)) {
        emailError.classList.add('cc-active');

        submitButtons.forEach(button => {
          button.disabled = true;
          button.style.opacity = 0.5;
          button.style.cursor = 'not-allowed';
        });

        nextButtons.forEach(button => {
          button.disabled = true;
          button.style.opacity = 0.5;
          button.style.cursor = 'not-allowed';
        });

      } else {
        emailError.classList.remove('cc-active');

        submitButtons.forEach(button => {
          button.disabled = false;
          button.style.opacity = 1;
          button.style.cursor = 'pointer';
        });

        nextButtons.forEach(button => {
          button.disabled = false;
          button.style.opacity = 1;
          button.style.cursor = 'pointer';
        });
      }
    }

// Run after the full page load — this runs strictly after DOMContentLoaded,
    // guaranteeing any prefill scripts (like the /demo page's URL-param prefill)
    // have already populated the field before we validate it
    window.addEventListener('load', checkEmail);

    // Keep checking as the user types
    emailInput.addEventListener('input', checkEmail);
  });
}

function gateBookDemoOnWorkEmail() {
  // Gates ONLY the "Book a Demo" button on forms that also offer the free trial
  // (the inline forms). Those forms deliberately accept personal emails, because
  // engineers often try the app on a throwaway address first - but a personal
  // address clicking Book a Demo currently submits successfully, pings Vadim, and
  // then dead-ends on /demo where the address is rejected. This stops that at the
  // point of submission instead.
  //
  // Opt-in only, via data-js="book-demo-email-gate". Nothing is inferred from a
  // form's structure, so a form built later gets this behaviour only if someone
  // deliberately tags it. The Demo Request forms are untouched and keep
  // validateEmails(), which still blocks personal emails outright.
  const forms = document.querySelectorAll(bookDemoGateSelector);
  if (!forms.length) return;

  forms.forEach(wrapper => {
    // Accept the attribute either on a wrapper or directly on the form element
    const form = wrapper.matches('form') ? wrapper : wrapper.querySelector('form');
    const demoButton = wrapper.querySelector(bookDemoButtonSelector);
    const emailInput = wrapper.querySelector(emailInputSelector)
      || wrapper.querySelector('[data-js~="custom-validate"]');
    const emailError = wrapper.querySelector(emailErrorSelector);

    // A tagged form with no Book a Demo button has nothing to gate
    if (!form || !demoButton || !emailInput) {
      return;
    }

    function hideEmailError() {
      if (emailError) emailError.classList.remove(emailErrorActiveClass);
    }

    function showEmailError() {
      if (emailError) emailError.classList.add(emailErrorActiveClass);
    }

    // Clear the message as soon as they start correcting the address
    emailInput.addEventListener('input', hideEmailError);

    form.addEventListener('submit', function(e) {
      // e.submitter is the button that triggered submission, and it is populated
      // for Enter-key submits too - those resolve to the form's first submit
      // button, which is Book a Demo. Binding to the button's click instead would
      // miss that entirely and leave the gate trivially bypassable.
      const submitter = e.submitter || activeSubmitButton;

      // Anything other than Book a Demo passes straight through. "Try Sibe for
      // free" must keep accepting personal addresses.
      if (submitter !== demoButton) {
        hideEmailError();
        return;
      }

      // The input is type="email" required, so the browser has already enforced
      // format and non-emptiness before this event fires at all.
      if (personalEmailRegex.test(emailInput.value.trim())) {
        e.preventDefault();
        // Capture phase + stopImmediatePropagation keeps the event away from
        // Webflow's own submit handler, which would otherwise still AJAX it
        // through - preventDefault alone does not stop propagation.
        e.stopImmediatePropagation();
        showEmailError();
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

//Form email validation
validateEmails();

//Work-email gate on the Book a Demo button only (inline forms)
//Runs BEFORE handleButtonAnalytics so a blocked submit never reaches its
//listener and cannot write analytics fields for a submission that never happened
gateBookDemoOnWorkEmail();

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
