# Verification scripts

Five scripts that check the site by loading it in a real browser. They are how a
change is proved not to have broken something, and they are the evidence behind
several entries in the project history.

They are **not** run by `npm run build`. You run them by hand.

## You need one thing that `npm install` does NOT give you

Every one of these drives a browser through **Playwright**, and Playwright is
deliberately **not** in `package.json`. So a fresh clone cannot run any of them
until you install it:

```bash
cd website
npm install                      # the site's own dependencies
npm install --no-save playwright # the browser driver, NOT saved to package.json
npx playwright install chromium  # the browser itself (~200 MB, downloaded once)
```

`--no-save` matters: it leaves `package.json` untouched, so the quarterly data
refresh and the Cloudflare build never pull a 200 MB browser they do not use.

Disk cost, measured: ~18 MB of node modules plus ~199 MB of browser binaries in
`~/Library/Caches/ms-playwright`.

If you skip this step, every script fails immediately with
`ERR_MODULE_NOT_FOUND: Cannot find package 'playwright'`. That error means the
install above was not done — it does not mean the site is broken.

## Running them

All but one expect a dev server on **port 5199**:

```bash
# terminal 1
cd website && npm run dev -- --port 5199

# terminal 2
cd website
node scripts/verify-render-text.mjs before.txt
node scripts/verify-attribution.mjs
node scripts/verify-map-viewport.mjs
node scripts/verify-popup-html.mjs before.txt '{"biz":"n_businesses","emp":"n_employees","pbiz":"prior_n_businesses","pemp":"prior_n_employees","year":2025}'
```

`verify-layer-list.mjs` is the exception — it uses the default port 5173, so
start that one with plain `npm run dev`.

Each script's own header comment says what it verifies, what a pass looks like,
and what a fail looks like. Read it before trusting a result.

## What state each script is in

Do not assume a failure means the site is broken. Two of these five currently
fail for reasons that are not the site's fault, and one is unreliable.

| script | state |
|---|---|
| `verify-render-text.mjs` | **Works.** Same input gives the same output. |
| `verify-popup-html.mjs` | **Works.** Same input gives the same output. |
| `verify-attribution.mjs` | **Flaky.** Run twice unchanged, it can disagree with itself, and sometimes crashes instead of reporting. Re-run before believing a failure. |
| `verify-map-viewport.mjs` | **Fails by design.** It checks for a camera behaviour that was tried and not adopted. Its render-height half still works. |
| `verify-layer-list.mjs` | **Does not run.** Waits for a page element that no longer exists; times out after 90 s. |

The two that work are the ones the rendered-output checks depend on.
