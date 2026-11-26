# Careers page (embeddable)

The public careers page (SRS Screens 16 and 17): the company's branded header, hero and sections from the
**Career Page builder**, the open jobs with search and filters, a full job page (`?job=<id>`) with sharing,
and the apply flow (email code, then resume upload). It builds into **one JavaScript file** that can be added to
any website or project, or into **one HTML file** that can be hosted on its own.

- **Everything comes from the resume portal:** the published career page (Career Page builder), the company's
  branding (Settings → Branding: colours, logo, font) and its published jobs.
- **Header and footer** are the company's own (logo, links); hide them with `data-header="false"` /
  `data-footer="false"` when the host site has its own.
- Companies find ready-to-copy code, website-builder steps and a connection check in the portal under
  **Career Page → Add to your website** (public copy for web agencies: `/careers/<company>/integrate`).

## Build

```bash
npm run build:careers
```

This writes `dist-careers/`:

| File | Use it for |
| --- | --- |
| `shinelogics-careers.js` | Adding the careers page to an existing site or project (React, styles and logo are inside) |
| `careers.html` | Hosting the careers page as a single page. Everything is inside this one file |
| `index.html` | An example of embedding the script |

To bake the API address into the build, set `VITE_CAREERS_API_BASE_URL` first, e.g.
`https://api.example.com/api/v1`. It can also be set per page with `data-api` (below).

For local work: `npm run dev:careers` (http://localhost:5190).

## Share the single file

`careers.html` works uploaded to any website or opened straight from disk. Options go in the link:

| Link | Shows |
| --- | --- |
| `careers.html` | Header, roles and footer of the default company (Shinelogics) |
| `careers.html?company=acme` | That company's roles and page text (its page address from Job openings → company bar) |
| `careers.html?header=false` | No Shinelogics header (for a site that has its own) |
| `careers.html?footer=false` | No Shinelogics footer |
| `careers.html?header=false&footer=false` | Only the roles |
| `careers.html?api=https://api.example.com/api/v1` | Roles from another resume portal |

## Add it to any site

```html
<div data-careers data-company="acme" data-api="https://api.example.com/api/v1"></div>
<script src="https://api.example.com/api/v1/public/career-page/embed.js" defer></script>
```

| Attribute | Default | Meaning |
| --- | --- | --- |
| `data-api` | value baked in at build | Resume portal API address |
| `data-company` | `?company=` in the page address, else the default company | Company page address, e.g. `acme` |
| `data-header` | `true` | `false` hides the Shinelogics header (when the site has its own) |
| `data-footer` | `true` | `false` hides the Shinelogics footer |
| `data-manage-title` | `false` | `true` sets the browser tab title to the open role |

From JavaScript (for example in a React, Angular or Vue app, after the script has loaded):

```js
const careers = window.CareersWidget.mount(document.getElementById("careers"), {
  apiBaseUrl: "https://api.example.com/api/v1",
  showHeader: false,
});
// careers.unmount() removes it again
```

### How it stays out of the host site's way

- It renders inside a **Shadow DOM**: its styles cannot change the host page, and the host page's
  styles (fonts, colours, button styles) cannot change it.
- It does **not use the page's routes**. An open role is kept in the address as `?job=<id>`,
  so a role link can be shared and the Back button closes it. Other query values are kept.
- It does not change the tab title unless `data-manage-title="true"`.

## Hosting notes

- **Any site can call the careers endpoints.** `/api/v1/public/...` answers every origin with `*`
  (no cookies), including a page opened from disk, which sends `Origin: null`. Logged-in
  endpoints keep the main CORS rules.
- The single `careers.html` needs no special server setup; any static host works.

## In the resume portal

The portal's own `/jobs` route renders the same page (`CareersPage`), without the Shadow DOM.
Old links like `/jobs/<id>` redirect to `/jobs?job=<id>`.

## Endpoints used (no login)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/public/jobs?company=<address>` | A company's open roles with all their sections (default company when left out) |
| GET | `/public/jobs/page?company=<address>` | A company's careers page text, with `company: {id, name, slug}` |
| POST | `/public/jobs/verification/request` | Email a 6-digit code |
| POST | `/public/jobs/verification/confirm` | Check the code, returns an applicant token |
| POST | `/public/jobs/{id}/apply` | Upload the resume (`X-Applicant-Token` header), with `heard_from` (how they found the role) and an optional `note` |

## Companies

Each company in the resume portal has its own roles, careers page text and page address (slug).
Pick a company, or add one, in the bar at the top of **Job openings**; it shows the company's link to share.

- In this app: `/careers/<address>` or `/jobs?company=<address>`. `/jobs` alone is the default company, so older links still work.
- Single file: `careers.html?company=<address>`. Embed: `data-company="<address>"`, or `mount(el, { company: "<address>" })`.
- An unknown address, or a company whose page is turned off, shows "This careers page was not found."
- An application records the company and role on the candidate's resume (`company_id`, `company_name`, `job_title`,
  and every application in `applied_jobs`). Candidate lists can be filtered by company and show a company pill.


## Names

`data-careers` and `window.CareersWidget` are the names to use. The older `data-shinelogics-careers` and
`window.ShinelogicsCareers` keep working for pages that already use them.

## Serving the script

The API serves the built script at `/api/v1/public/career-page/embed.js` (the file set by `CAREERS_EMBED_FILE`,
default `dist-careers/shinelogics-careers.js`), so companies don't need a CDN. Run `npm run build:careers` on
deploy. Requests from the embed carry `X-Careers-Embed: 1`, which lets the portal show where the page is embedded.

## Own domains

A company can serve its careers page at `<slug>.<CAREERS_DOMAIN>` or its own `careers.company.com`
(CNAME + TXT verification in the portal). The app shows that company's careers page on those hosts
(`/api/v1/public/career-page/resolve-host`). For HTTPS, a web server with on-demand TLS should ask
`/api/v1/public/career-page/tls-allowed?domain=<host>` before issuing a certificate, e.g. Caddy:

```
{
  on_demand_tls {
    ask https://api.example.com/api/v1/public/career-page/tls-allowed
  }
}
https:// {
  tls { on_demand }
  reverse_proxy app:80
}
```
