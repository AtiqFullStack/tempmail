import sanitizeHtml from "sanitize-html";
import juice from "juice";

// Only presentational CSS values are accepted. In particular, no URLs, custom
// properties, positioning, animation, CSS escapes, or resource-loading functions.
const length = String.raw`(?:0|\d{1,4}(?:\.\d{1,3})?(?:px|pt|em|rem|%))`;
const color = String.raw`(?:#(?:[a-f\d]{3,4}|[a-f\d]{6}|[a-f\d]{8})|(?:rgb|rgba|hsl|hsla)\([\d\s.,%]+\)|[a-z]{1,20})`;
const lengths = new RegExp(`^(?:${length})(?:\\s+(?:${length})){0,3}$`, "i");
const dimension = new RegExp(`^(?:${length}|auto)$`, "i");
const colors = new RegExp(`^${color}$`, "i");
const border = new RegExp(
  `^(?:0|none|${length}\\s+(?:solid|dotted|dashed|double)\\s+${color})$`,
  "i",
);
const safeStyles: Record<string, RegExp[]> = {
  color: [colors],
  background: [colors],
  "background-color": [colors],
  "font-family": [/^[a-z\d\s,'"-]{1,160}$/i],
  font: [/^[a-z\d\s,'".%/+-]{1,160}$/i],
  "font-size": [new RegExp(`^${length}$`, "i")],
  "font-weight": [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
  "font-style": [/^(?:normal|italic|oblique)$/i],
  "line-height": [
    new RegExp(`^(?:normal|\\d{1,2}(?:\\.\\d{1,3})?|${length})$`, "i"),
  ],
  "letter-spacing": [new RegExp(`^(?:normal|${length})$`, "i")],
  "word-spacing": [new RegExp(`^(?:normal|${length})$`, "i")],
  "text-align": [/^(?:left|right|center|justify|start|end)$/i],
  "text-decoration": [
    /^(?:none|underline|overline|line-through)(?:\s+(?:underline|overline|line-through))*$/i,
  ],
  "text-transform": [/^(?:none|uppercase|lowercase|capitalize)$/i],
  "white-space": [/^(?:normal|pre|pre-wrap|pre-line|break-spaces)$/i],
  "word-break": [/^(?:normal|break-all|keep-all|break-word)$/i],
  "overflow-wrap": [/^(?:normal|anywhere|break-word)$/i],
  "vertical-align": [
    /^(?:baseline|top|middle|bottom|text-top|text-bottom|sub|super)$/i,
  ],
  "border-collapse": [/^(?:collapse|separate)$/i],
  "border-spacing": [lengths],
  "border-radius": [lengths],
  "border-color": [colors],
  "border-width": [lengths],
  "border-style": [/^(?:none|solid|dotted|dashed|double)$/i],
  "table-layout": [/^(?:auto|fixed)$/i],
  "box-sizing": [/^(?:border-box|content-box)$/i],
  display: [
    /^(?:block|inline|inline-block|table|table-row|table-cell|table-row-group)$/i,
  ],
};
for (const key of [
  "width",
  "max-width",
  "min-width",
  "height",
  "max-height",
  "min-height",
])
  safeStyles[key] = [dimension];
for (const key of [
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
])
  safeStyles[key] = [lengths];
for (const key of [
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
]) {
  safeStyles[key] = [
    new RegExp(`^(?:${length}|auto)(?:\\s+(?:${length}|auto)){0,3}$`, "i"),
  ];
}
for (const key of [
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
])
  safeStyles[key] = [border];

function inlineEmailStyles(html: string): string {
  // Bound selector work and CSS expansion; large templates retain inline CSS.
  const stylesheetBytes = [
    ...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi),
  ].reduce((size, match) => size + match[1].length, 0);
  if (
    html.length > 256 * 1024 ||
    stylesheetBytes > 8192 ||
    (html.match(/</g)?.length || 0) > 2000 ||
    (html.match(/{/g)?.length || 0) > 200
  )
    return html;
  try {
    // The synchronous juice() API only processes supplied HTML/CSS. Do not use
    // juiceResources/juiceFile, which can fetch remote or filesystem resources.
    const inlined = juice(html, {
      applyStyleTags: true,
      removeStyleTags: true,
      preserveMediaQueries: false,
      preserveFontFaces: false,
      preserveKeyFrames: false,
      preservePseudos: false,
      applyWidthAttributes: false,
      applyHeightAttributes: false,
      applyAttributesTableElements: false,
      inlinePseudoElements: false,
      resolveCSSVariables: false,
    });
    return inlined.length <= 1024 * 1024 ? inlined : html;
  } catch {
    return html;
  }
}
export function sanitizeEmail(html: string): string {
  return sanitizeHtml(inlineEmailStyles(html), {
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
      "h5",
      "h6",
      "center",
      "font",
      "small",
      "sub",
      "sup",
      "caption",
      "tfoot",
      "colgroup",
      "col",
      "section",
      "article",
      "header",
      "footer",
    ],
    nonTextTags: ["script", "style", "textarea", "option", "title", "noscript"],
    allowedAttributes: {
      "*": ["style", "dir"],
      a: ["href", "target", "rel"],
      table: [
        "width",
        "height",
        "align",
        "bgcolor",
        "border",
        "cellpadding",
        "cellspacing",
        "role",
      ],
      tr: ["align", "valign", "bgcolor"],
      td: [
        "colspan",
        "rowspan",
        "width",
        "height",
        "align",
        "valign",
        "bgcolor",
      ],
      th: [
        "colspan",
        "rowspan",
        "width",
        "height",
        "align",
        "valign",
        "bgcolor",
      ],
      font: ["color", "face", "size"],
    },
    allowedStyles: { "*": safeStyles },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: {
      body: "div",
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
