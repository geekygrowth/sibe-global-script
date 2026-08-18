# sibe-global-script

Global JavaScript for the [sibe.io](https://www.sibe.io) Webflow site: marketing
attribution capture, work-email validation, phone input, and post-submit
redirects.

Served to Webflow from jsDelivr. It used to live inline in Webflow's footer
custom code, but outgrew that field's character limit.

---

## What's in here

A single file, `global-script.js`, containing three formerly-separate footer
script blocks:

| Part | Responsibility |
|---|---|
| Attribution | Captures UTMs and click IDs into `localStorage`, populates hidden form fields |
| Email validation | Blocks personal-email domains on forms marked `data-js="email-validate-form"` |
| Phone input | Initialises [intl-tel-input](https://github.com/jackocnr/intl-tel-input) on `[ms-code-phone-number]` fields |
| Form submit | Fires the PostHog event, then redirects to `app.sibe.io` or `/demo` |

They share one scope now, so `fieldMappings` and `activeSubmitButton` are plain
locals rather than a fragile contract between separate `<script>` tags.

---

## How it's loaded

Webflow → Site Settings → Custom Code → **Footer**:

```html
<script src="https://cdn.jsdelivr.net/npm/intl-tel-input@26.0.1/build/js/intlTelInput.min.js"></script>
<script src="https://cdn.jsdelivr.net/gh/geekygrowth/sibe-global-script@v1.1.0/global-script.js"></script>
```

And in **Head**:

```html
<link rel="preconnect" href="https://cdn.jsdelivr.net">
```

Three things about those tags are deliberate:

- **intl-tel-input loads first.** Dependency before dependent.
- **No `async` or `defer`.** The script must finish before the page's other
  inline code runs.
- **No `.min.js`.** The file exposes globals that other code references *by
  name*. A minifier that renames them would silently break the post-submit
  redirects — forms would still submit, users just would never get redirected.

---

## Releasing a change

jsDelivr caches every tagged URL as `immutable` for one year. That is the whole
reason this workflow exists: a version, once served, can never change.

```bash
# 1. edit global-script.js, then sanity-check it parses
node --check global-script.js

# 2. commit
git add global-script.js
git commit -m "describe the change"

# 3. tag - bump MINOR for new behaviour, PATCH for a fix
git tag v1.2.0

# 4. push both the branch and the tag (the tag is what jsDelivr resolves)
git push && git push --tags
```

Then update the version in the Webflow footer URL and publish.

**Test on `sibe.webflow.io` before production.** Publish to the Webflow
subdomain only, with the custom domains unchecked.

### Never move a tag

Do not `git tag -f` a version that has already been fetched from jsDelivr. The
CDN will keep serving the original bytes for up to a year while the repo shows
something different — you would be debugging a file that is not the one running.
Always cut a new version instead.

For the same reason, never point the Webflow URL at `@main`. Branch URLs are
cached for ~12 hours, so edits appear on an unpredictable delay.

### Rolling back

Put the previous tag back in the Webflow footer URL and publish. Old versions
stay served forever, so this works instantly and needs no git operation.

---

## Depends on the Webflow side

The script writes into hidden inputs from the **`[dev] Form - Hidden Fields`**
component (group `z_[dev]`, ~112 instances). Fields are matched on
`data-utm-id` or `data-type` attributes, never on position or `id`.

**Adding a tracked field means changing both sides.** A new hidden input needs a
matching entry here, and a mapping added here does nothing until the component
has a field carrying the right attribute.

Component groups, and what populates each:

| Group | Populated from | When |
|---|---|---|
| First Touch fields | `localStorage`, written once on first visit | page load |
| Last Touch fields | `localStorage`, overwritten on each external inbound visit | page load |
| Touch Agnostic fields | page title, slug, clicked button | submit |
| Meta Pixel Cookies | `document.cookie` (`_fbp` / `_fbc`) | submit |

---

## Behaviour worth knowing

**First touch vs last touch.** Unprefixed keys (`gclid`, `msclkid`, `fbclid`)
are first-touch and written once, never overwritten. `lt-` keys are last-touch
and rewritten on every external inbound visit carrying a marketing parameter.

**`fbclid` cannot trigger a last-touch overwrite.** Facebook and Instagram
append `fbclid` to *every* outbound link, including organic posts, comments and
DMs — not only paid ads. If it could trigger the overwrite, an organic social
click would blank existing paid attribution. `ltTriggerMappings` therefore
excludes it. It is still captured whenever a properly tagged ad click fires the
overwrite; it just cannot fire one alone.

**`_fbp` and `_fbc` are cookies, not URL params.** They are written by the Meta
Pixel, asynchronously, so they are read at submit time rather than page load.
`_fbp` is a browser id with no touch semantics, so it has no `lt-` twin. `_fbc`
is `fb.1.<clickTime>.<fbclid>` and is overwritten by the Pixel on every ad click,
making it inherently last-touch. When the cookie is missing but the URL carries
an `fbclid`, the script builds Meta's documented fallback format itself.

**Attribution capture is not consent-gated.** URL parameters are read and stored
in `localStorage` before any cookie-consent decision. The Meta cookie fields are
effectively gated, since the Pixel does not write its cookies without ad
consent — expect those two to be empty often.

---

## Testing attribution

Clear `localStorage` first, or first-touch values will not be written. Paste
each URL into the address bar — clicking through from within the site makes
`document.referrer` internal, which correctly suppresses the last-touch
overwrite and makes a working script look broken.

```
# 1. first touch
/sibe-vs-traditional-pdm?utm_source=first_source&gclid=first_gclid_111&msclkid=first_msclkid_111&fbclid=first_fbclid_111

# 2. last touch - unprefixed fields stay first_*, lt- fields become second_*
/pricing?utm_source=second_source&gclid=second_gclid_222&msclkid=second_msclkid_222&fbclid=second_fbclid_222

# 3. organic social - every lt- field must be UNCHANGED from step 2
/demo?fbclid=organic_fbclid_333
```

Step 3 is the only check that exercises the `ltTriggerMappings` guard.

---

## Open items

- **Awaiting a decision on `fbclid`.** Option A (current): `fbclid` cannot
  trigger a last-touch overwrite. Option B: it behaves like every other click
  ID. Switching to B is one line — `const ltTriggerMappings = fieldMappings;`.
- **Confirm the Meta Pixel is installed and firing on sibe.io.** Without it,
  `_fbp` never exists and only the `_fbc` fallback can ever populate.
