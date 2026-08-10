import type { MetadataRoute } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/constants";

/**
 * The web app manifest — what makes the site installable.
 *
 * `standalone` display, because the point of installing a shop is a home
 * screen icon that opens without browser chrome. `start_url` is the home
 * page rather than the last visited one: somebody tapping the icon is
 * starting a shopping trip, not resuming a checkout from last Tuesday.
 *
 * The icons are the two that exist. There is no 192px entry, because
 * declaring a size we do not ship would have the browser fetch a 404 and
 * fall back — worse than one honest 512, which every platform downscales
 * perfectly well. There is also no `maskable` purpose: a maskable icon
 * needs roughly 20% padding inside the safe zone, and marking an unpadded
 * logo maskable gets the wordmark cropped by Android's circle mask. Both
 * are worth fixing with a proper icon export; neither is worth faking in a
 * manifest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — GI-Tagged Single-Origin Indian Foods`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Matches --color-ek-paper and --color-ek-green-900 in globals.css.
    // Duplicated here of necessity: a manifest is JSON served to the
    // operating system and cannot read a CSS variable. If the brand
    // changes, these two change with it.
    background_color: "#FAF7F0",
    theme_color: "#1C3A2D",
    lang: "en-IN",
    categories: ["food", "shopping"],
    icons: [
      {
        src: "/brand/ekmool-favicon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/ekmool-mark.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Shop",
        url: "/products",
        description: "The five things we sell",
      },
      {
        name: "Track an order",
        url: "/track",
        description: "Find an order with its reference and your email",
      },
    ],
  };
}
