// After `vite build --config vite.careers.config.ts`: writes the two HTML pages next to the script.
//   careers.html  everything in one file (script inlined) - open it or upload it anywhere;
//                 ?company=acme shows that company's roles; ?header=false&footer=false hides the header / footer
//   index.html    an example of embedding the script on an existing page
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const out = (name) => fileURLToPath(new URL(`../dist-careers/${name}`, import.meta.url));
const script = readFileSync(out("shinelogics-careers.js"), "utf8").replace(/<\/script/gi, "<\\/script");

const page = (body) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Open roles at Shinelogics. Apply with your resume." />
    <title>Careers at Shinelogics</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
${body}
  </body>
</html>
`;

// The single file reads its options from the link, so one file serves every case:
//   careers.html?company=acme   that company's roles and page text (page address from Job openings → Companies)
//   careers.html?header=false&footer=false   hide the Shinelogics header / footer
//   careers.html?api=https://api.example.com/api/v1   use another resume portal API
const linkOptions = `(function () {
      var params = new URLSearchParams(location.search);
      var el = document.querySelector("[data-shinelogics-careers]");
      ["header", "footer", "api"].forEach(function (name) {
        var value = params.get(name);
        if (value !== null && value !== "") el.setAttribute("data-" + name, value);
      });
    })();`;

writeFileSync(
  out("careers.html"),
  page(`    <div data-shinelogics-careers data-manage-title="true"></div>
    <script>${linkOptions}</script>
    <script>${script}</script>`)
);

writeFileSync(
  out("index.html"),
  page(`    <!-- Your site's own content can go here. -->
    <!-- Options (all optional):
         data-header="false"         hide the Shinelogics header (when your site has its own)
         data-footer="false"         hide the Shinelogics footer
         data-company="acme"         company page address from the resume portal (default company when left out)
         data-api="https://..."      resume portal API, if not baked in at build time
         data-manage-title="true"    set the browser tab title to the open role -->
    <div data-shinelogics-careers data-header="true" data-footer="true" data-manage-title="true"></div>
    <script src="./shinelogics-careers.js"></script>`)
);

console.log("Wrote dist-careers/careers.html (single file) and dist-careers/index.html (embed example)");
