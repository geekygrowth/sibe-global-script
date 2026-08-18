# CLAUDE.md

Project overview, release workflow, and Webflow dependencies: @README.md

Everything below is a hard rule specific to how this repo is deployed. Read the
README first — this file only exists to stop mistakes it is easy to make here.

## Never move an existing tag

`git tag -f` on a version that has already been published is destructive and
effectively irreversible. jsDelivr caches each tagged URL as `immutable` for one
year, so the CDN keeps serving the original bytes while the repo shows something
different — a live site running code that no longer exists in git.

To ship a change, always cut a **new** version. Never re-point an old one.

## Do not minify

`global-script.js` exposes globals that other code references by name. A
minifier that renames them breaks the post-submit redirects silently: forms
still submit, users never get redirected. The file is ~20KB; leave it readable.

## Changes here are half a change

Hidden form fields live in the Webflow component `[dev] Form - Hidden Fields`
and are matched on `data-utm-id` / `data-type` attributes. Adding a mapping in
this file does nothing until a matching field exists in Webflow, and vice versa.
Say so explicitly when a change needs the Webflow side too.

## Verify before claiming a release is live

After pushing a tag, confirm jsDelivr actually serves it — fetch the tagged URL
and compare its SHA256 against `git show <tag>:global-script.js`. A pushed tag
is not a deployed script.

## Docs-only commits do not need a tag

jsDelivr only ever serves the tagged `global-script.js`. Editing README.md or
this file changes nothing that is deployed, so do not bump the version for it.
