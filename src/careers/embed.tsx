/**
 * Embeddable careers page: one script that works on any website or project.
 *
 *   <div data-shinelogics-careers data-api="https://api.example.com/api/v1"></div>
 *   <script src="shinelogics-careers.js"></script>
 *
 * Options (data attributes, or ShinelogicsCareers.mount(element, options)):
 *   data-api           resume portal API address (apiBaseUrl)
 *   data-header        "false" hides the Shinelogics header (showHeader)
 *   data-footer        "false" hides the Shinelogics footer (showFooter)
 *   data-manage-title  "true" sets the browser tab title to the open role (manageTitle)
 *
 * The page renders inside a shadow root, so its styles and the host site's styles cannot
 * affect each other. Pop-ups render in a separate layer on <body> with the highest z-index, so
 * the host site's headers and stacking rules cannot cover them. An open role is kept in the address as ?job=<id>.
 */
import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import styles from "./careers.css?inline";
import CareersPage, { type CareersPageProps } from "./CareersPage";
import { setCareersApiBaseUrl } from "./api";
import { OverlayContext } from "./overlay";

export interface CareersEmbedOptions extends CareersPageProps {
  apiBaseUrl?: string;
}

export interface CareersEmbed {
  unmount: () => void;
}

const mounted = new Map<Element, CareersEmbed>();
let propertiesRegistered = false;

/**
 * Browsers ignore @property rules inside a shadow root, and Tailwind needs them for shadows,
 * rings and transforms. They are global and only declare custom property defaults, so they are
 * added to the host page once.
 */
function registerCssProperties() {
  if (propertiesRegistered) return;
  propertiesRegistered = true;
  const rules = styles.match(/@property\s+[^{]+\{[^}]*\}/g);
  if (!rules?.length) return;
  const style = document.createElement("style");
  style.setAttribute("data-shinelogics-careers-properties", "");
  style.textContent = rules.join("\n");
  document.head.appendChild(style);
}

export function mount(target: Element | string, options: CareersEmbedOptions = {}): CareersEmbed {
  const host = typeof target === "string" ? document.querySelector(target) : target;
  if (!host) throw new Error(`Shinelogics careers: no element matches ${String(target)}`);
  const existing = mounted.get(host);
  if (existing) return existing;

  const { apiBaseUrl, ...pageProps } = options;
  if (apiBaseUrl) setCareersApiBaseUrl(apiBaseUrl);
  registerCssProperties();

  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = styles;
  const container = document.createElement("div");
  container.className = "careers-root";
  shadow.replaceChildren(style, container);

  // Pop-ups go in their own layer on <body>, above everything on the host page.
  const layer = document.createElement("div");
  layer.setAttribute("data-shinelogics-careers-overlay", "");
  layer.style.cssText = "position: relative; z-index: 2147483647;";
  const layerShadow = layer.attachShadow({ mode: "open" });
  const layerStyle = document.createElement("style");
  layerStyle.textContent = styles;
  const overlay = document.createElement("div");
  overlay.className = "careers-root careers-overlay";
  layerShadow.replaceChildren(layerStyle, overlay);
  document.body.appendChild(layer);

  const root: Root = createRoot(container);
  root.render(
    <StrictMode>
      <OverlayContext.Provider value={overlay}>
        <CareersPage {...pageProps} />
      </OverlayContext.Provider>
    </StrictMode>
  );

  const embed: CareersEmbed = {
    unmount: () => {
      root.unmount();
      shadow.replaceChildren();
      layer.remove();
      mounted.delete(host);
    },
  };
  mounted.set(host, embed);
  return embed;
}

const flag = (value: string | undefined, fallback: boolean) =>
  value === undefined ? fallback : !/^(false|0|no|off)$/i.test(value.trim());

function optionsFrom(el: HTMLElement): CareersEmbedOptions {
  const d = el.dataset;
  return {
    apiBaseUrl: d.api || undefined,
    showHeader: flag(d.header, true),
    showFooter: flag(d.footer, true),
    manageTitle: flag(d.manageTitle, false),
  };
}

/** Mount on every <div data-shinelogics-careers> on the page that is not mounted yet. */
export function mountAll() {
  document.querySelectorAll<HTMLElement>("[data-shinelogics-careers]").forEach((el) => mount(el, optionsFrom(el)));
}

declare global {
  interface Window {
    ShinelogicsCareers?: { mount: typeof mount; mountAll: typeof mountAll };
  }
}

window.ShinelogicsCareers = { mount, mountAll };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll);
else mountAll();
