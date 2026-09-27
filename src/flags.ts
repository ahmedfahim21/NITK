/**
 * Build-time feature flags, read from VITE_* env vars (see .env.example).
 *
 * VITE_STORY_MODE: "true" shows Story Mode, "false" hides it. Unset, it is
 * on for `npm run dev` and off for production builds, so a deploy only
 * offers Explore Mode until the story is ready.
 */
const story = import.meta.env.VITE_STORY_MODE;
if (story !== undefined && story !== "true" && story !== "false") {
  throw new Error(`VITE_STORY_MODE must be "true" or "false", got "${story}"`);
}

export const STORY_MODE: boolean = story === undefined ? import.meta.env.DEV : story === "true";
