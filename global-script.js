//Last Updated: 2026-07-07 by Nicolask Rak @nicolasrak
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
  { key: 'gclid',        selector: '[data-utm-id="gclid"]' }
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
  { key: 'lt-gclid',        selector: '[data-utm-id="lt-gclid"]' }
];

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
  const hasMarketingParams = fieldMappings.some(mapping => urlParams.has(mapping.key));

  // 3. The Aggressive Overwrite (ONLY if it's external inbound traffic)
  if (hasMarketingParams && !isInternalTraffic) {

    // Overwrite Path and Referrer
    localStorage.setItem(ltInitialPathKey, window.location.pathname);
    localStorage.setItem(ltInitialReferrerKey, document.referrer || 'direct');

    // Overwrite UTMs
    fieldMappings.forEach(mapping => {
      const value = urlParams.get(mapping.key) || '';
      localStorage.setItem('lt-' + mapping.key, value);
    });
  }
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
  const workEmailRegex = new RegExp(
    `@([a-z0-9-]+\\.)*(${rootsPattern})\\.[a-z.]+$|@([a-z0-9-]+\\.)*(${exactPattern})$`,
    'i'
  );

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

//****************
//INIT
//****************
//FIRST TOUCH
saveFirstVisitValues();

//LAST TOUCH
saveLastVisitValues();

//Populating fields & appending button urls
populateHiddenFields();
appendUtmToLinks();

//Form email validation
validateEmails();

//Checking which btn was clicked
handleButtonAnalytics();
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
