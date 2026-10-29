# Board game catalogue

Static site published through GitHub Pages from `main`, `/ (root)`.

- `index.html`: page layout and game form.
- `app.js`: public catalogue loading, filters, and owner publishing.
- `games.json`: shared catalogue, including embedded cover images. Git history keeps previous versions.

## Publish catalogue changes

1. Create a **fine-grained personal access token** at https://github.com/settings/personal-access-tokens/new using the repository owner's account.
2. Select **Only select repositories**, choose `boardgame-catalogue`, and grant **Contents: Read and write**. Set an expiry. No Actions or administration permission is needed.
3. Open the live site, choose **Owner sign in**, and enter the token there. Never put it in chat, source code, or a public file. The site keeps it only in memory; reloading or signing out clears it.
4. Add, edit, or delete games. A successful publish commits `games.json` to `main`. GitHub Pages redeploys automatically; other visitors see updates after deployment, typically within a few minutes. Open pages refresh their catalogue once a minute when visible. The publishing browser retains its pending changes while deployment catches up (up to five minutes).

Only an account with repository administration permission can enter owner mode; GitHub enforces write permission on every save. Other visitors can browse without an account. Failed writes leave the shared catalogue unchanged. Saves read the latest catalogue and use its blob SHA to reject concurrent updates. Reopen a stale game before editing it again.

Tokens are needed because GitHub Pages itself cannot store writes. This is token-based owner authentication, not GitHub OAuth. The token grants repository content access, so keep it private and revoke it in GitHub when no longer needed. The catalogue and uploaded cover images are public.

## Import previous browser-only additions

On the same browser and website address where games were previously added, sign in and choose **Import browser games**. Confirm publication. Matching names are skipped. Your browser backup remains untouched. Browser-only data from other devices cannot be recovered by this project.

## Develop and verify

Run `python -m http.server 8000 --bind 127.0.0.1` from this directory. No build or application dependencies are required.

`node tests/catalogue.cjs` runs browser tests with Playwright and Chromium available in the cloud runtime. Set `CHROMIUM_PATH` if needed, and start the local server first. These tests mock GitHub writes and exercise fresh-visitor persistence, add/edit/delete, denied writes, concurrent edits, legacy imports, token lifetime, and public browsing. They do not perform live authenticated writes or prove GitHub Pages has deployed.
