// shared.js — loaded on every page before auth-guard.js and all form scripts.
// Provides: supabaseClient, DEFAULT_SALES_OPTIONS, compressToWebP()

const DEFAULT_SALES_OPTIONS = [
  { code: "S001", name: "YUNIA" },
  { code: "S002", name: "YOGI" },
  { code: "S003", name: "IDA" },
  { code: "S004", name: "NUR" },
  { code: "S005", name: "DWI" },
  { code: "S006", name: "BENI" },
  { code: "S007", name: "RATNO" }
];

(function () {
  const cfg = window.APP_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("<PUT_")) {
    throw new Error("Missing APP_CONFIG values — set SUPABASE_URL and SUPABASE_ANON_KEY in config.js");
  }
  window.supabaseClient = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
})();

/**
 * Compress an image File to WebP using the Canvas API.
 * Resizes so the longest side is at most maxPx, then encodes at the given quality.
 */
function compressToWebP(file, maxPx = 1280, quality = 0.80) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { naturalWidth: w, naturalHeight: h } = img;
      if (w > maxPx || h > maxPx) {
        if (w >= h) {
          h = Math.round((h / w) * maxPx);
          w = maxPx;
        } else {
          w = Math.round((w / h) * maxPx);
          h = maxPx;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas compression failed."));
            return;
          }
          resolve(blob);
        },
        "image/webp",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to load image for compression."));
    };

    img.src = objectUrl;
  });
}
