import { createContext } from "react";

/**
 * Where pop-ups render. The embed sets this to a layer attached to <body> with the highest
 * z-index, so the host site's headers, z-index rules, transforms or overflow cannot cover or
 * clip a pop-up. When it is null (the resume portal's own /jobs page) pop-ups render in place.
 */
export const OverlayContext = createContext<HTMLElement | null>(null);
