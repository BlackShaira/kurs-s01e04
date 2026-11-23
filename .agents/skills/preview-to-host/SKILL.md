---
name: preview-to-host
description: Put one page of this repo on a public HTTPS link for a reviewer, and take it down again. Use for a plan's preview step, and for the clean-up step that re-uploads the page without its lane marker.
---

# preview-to-host

A reviewer has no lane access, so a page is reviewed from a copy on a public link
(ADR 0003). This is the routine that puts one HTML file there and takes it down again,
written from the run that worked, not from documentation.

Host used here: Cloudflare Pages, through `wrangler` by `npx`, so nothing is installed.
Any host works if the link is a real host over HTTPS and you can upload over it.

## Save the page, by command

Never a browser's "save as": the page is self-contained by ADR 0001, so one request is the
whole file.

```sh
PORT=8792 pnpm start &            # needs .env with LANE_MARKER set
curl -sS http://localhost:8792/digest/<night> -o <outdir>/index.html
```

`<outdir>` is **outside this repo**. No previews in the repo, in issues, or in chat
attachments: there the marker cannot be taken off again (ADR 0003).

Check the file before it goes anywhere public:

```sh
grep -c "<script" <outdir>/index.html        # must be 0 (ADR 0001)
grep -oE 'class="marker">[^<]*' <outdir>/index.html
```

## Put it up

Once per project. Run it from `<outdir>`, which holds only `index.html`:

```sh
npx -y wrangler pages project create <project> --force --production-branch main
```

**`--force` is required and `--help` does not list it.** Without it wrangler delegates to
Cloudflare Workers, fails, and deploys nothing. Run it from a folder with no framework and
no `wrangler.json`/`.toml` in it or above it: from the repo root it detects Hono and dies.
Pass `--force` only on this one command; wrangler says so itself afterwards.

Then, for every upload:

```sh
npx -y wrangler pages deploy . --project-name <project> --branch main --commit-dirty
```

## Which link to send

`wrangler` prints a **per-deployment** link with a hash in it, like
`https://<hash>.<project>.pages.dev`. **Do not send that one.** Cloudflare keeps every
deployment at its own immutable address, so a later upload does not replace it, and the
clean-up step ("the preview link no longer shows the lane marker") becomes impossible.

Send the **project's stable link**, which the create step prints and
`npx -y wrangler pages project list` shows:

```
https://<project>.pages.dev
```

Deploying again to the same project and the same branch replaces what that link serves.

## Take it down

A link you cannot take down is not this routine.

```sh
npx -y wrangler pages deployment list --project-name <project>
npx -y wrangler pages deployment delete <deployment-id>   # one deployment
npx -y wrangler pages project delete <project>            # the whole project
```

After a clean-up upload, the old deployment still serves the marker at its own hashed
address. Delete that deployment too, or the marker is still public.

## What only the human does

`npx -y wrangler login` opens a browser and authorizes their Cloudflare account. A harness
without a tty cannot drive it: ask them to run it. Ask them again before the first upload
and before the clean-up upload — each puts something on, or changes something on, a public
link.
