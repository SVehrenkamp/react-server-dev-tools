import { startNextLikeDev } from "./next-like-dev.mjs";

const marker = process.env.CUSTOM_WRAPPER_MARKER ?? `custom-wrapper-${Date.now()}`;

process.env.INTERNAL_FEATURE_FLAG = "true";
console.info("[custom-wrapper] preflight checks complete", {
  marker,
  featureFlag: process.env.INTERNAL_FEATURE_FLAG,
});

await startNextLikeDev(marker);

console.log("[custom-wrapper] server ready", { marker });
