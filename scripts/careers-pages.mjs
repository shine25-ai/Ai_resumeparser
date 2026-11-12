// After `vite build --config vite.careers.config.ts`: writes the two HTML pages next to the script.
//   careers.html  everything in one file (script inlined) - open it or upload it anywhere
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

writeFileSync(
  out("careers.html"),
  page(`    <div data-shinelogics-careers data-manage-title="true"></div>
    <script>${script}</script>`)
);

writeFileSync(
  out("index.html"),
  page(`    <!-- Your site's own content can go here. -->
    <div data-shinelogics-careers data-manage-title="true"></div>
    <!-- Set data-api to your resume portal API if it was not baked in at build time:
         <div data-shinelogics-careers data-api="https://api.example.com/api/v1"></div>
         data-header="false" / data-footer="false" hide the Shinelogics header / footer. -->
    <script src="./shinelogics-careers.js"></script>`)
);

console.log("Wrote dist-careers/careers.html (single file) and dist-careers/index.html (embed example)");
