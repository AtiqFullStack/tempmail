import sanitizeHtml from "sanitize-html";
export function sanitizeEmail(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p",
      "br",
      "div",
      "span",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "a",
    ],
    allowedAttributes: {
      a: ["href", "target", "rel"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        target: "_blank",
        rel: "noopener noreferrer nofollow",
      }),
    },
  });
}
export function safeFilename(value: string) {
  return (
    value
      .replace(/[\\/\x00-\x1f\x7f"<>:|?*]/g, "_")
      .replace(/^\.+/, "_")
      .slice(0, 150) || "attachment"
  );
}
const safeTypes = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
export const isSafeAttachment = (type: string, name: string) =>
  safeTypes.has(type.toLowerCase()) &&
  !/\.(?:exe|com|bat|cmd|ps1|js|mjs|vbs|scr|msi|html?|svg|jar|sh|lnk)(?:\.|$)/i.test(
    name,
  );
