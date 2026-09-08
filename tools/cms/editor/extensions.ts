// Shared Tiptap extension configuration for the article editor.
// Kept free of JSX/SCSS so the round-trip test can import the exact same schema the UI uses.
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Heading } from '@tiptap/extension-heading';
import { Underline } from '@tiptap/extension-underline';
import { Superscript } from '@tiptap/extension-superscript';
import { Subscript } from '@tiptap/extension-subscript';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import type { JSONContent, MarkdownRendererHelpers, RenderContext } from '@tiptap/core';

// These marks have no standard Markdown syntax. Tiptap's defaults would emit non-standard tokens
// (`++u++`, `==mark==`, `^sup^`, `~sub~`) that Astro would render as literal text — unsafe for the
// deployed site. We override renderMarkdown to emit real semantic HTML instead. On reload the tags
// are recognized by each extension's parseHTML rules (the HTML parse path), so they round-trip.
const htmlMark = (tag: string) => ({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) { return `<${tag}>${helpers.renderChildren(node)}</${tag}>`; },
});
const SafeUnderline = Underline.extend(htmlMark('u'));
const SafeSuperscript = Superscript.extend(htmlMark('sup'));
const SafeSubscript = Subscript.extend(htmlMark('sub'));
const SafeHighlight = Highlight.extend(htmlMark('mark'));

// Text alignment is a block attribute with no Markdown syntax. Only when a block is aligned do we
// emit it as an HTML element carrying `class="align-*"` (never inline `style`, which MDX rejects);
// unaligned blocks keep their plain Markdown form. parseHTML on AlignedTextAlign reads the class back.
type MdRender = (node: JSONContent, helpers: MarkdownRendererHelpers, ctx: RenderContext) => string;
const alignOf = (node: JSONContent) => (node.attrs?.textAlign && node.attrs.textAlign !== 'left' ? node.attrs.textAlign as string : null);
// Delegate to each extension's own renderMarkdown for the default (unaligned) output; only when a
// block is aligned do we wrap it in an align-classed HTML element.
const baseParagraph = (Paragraph as unknown as { config: { renderMarkdown: MdRender } }).config.renderMarkdown;
const AlignedParagraph = Paragraph.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers, ctx: RenderContext) {
    const align = alignOf(node), base = baseParagraph(node, helpers, ctx);
    return align ? `<p class="align-${align}">${base}</p>` : base;
  },
});
const AlignedHeading = Heading.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const align = alignOf(node), level = node.attrs?.level || 1;
    if (!node.content) return '';
    const inner = helpers.renderChildren(node);
    return align ? `<h${level} class="align-${align}">${inner}</h${level}>` : `${'#'.repeat(level)} ${inner}`;
  },
});

// Text alignment emits `class="align-*"` rather than inline `style`, which keeps the output valid
// in MDX (where a `style` string would fail to compile as JSX) and free of inline styles.
export const AlignedTextAlign = TextAlign.extend({
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        textAlign: {
          default: this.options.defaultAlignment,
          parseHTML: (element: HTMLElement) =>
            element.getAttribute('class')?.match(/(?:^|\s)align-(left|center|right|justify)(?:\s|$)/)?.[1] ||
            element.style.textAlign || this.options.defaultAlignment,
          renderHTML: (attributes: Record<string, unknown>) => {
            const value = attributes.textAlign;
            if (!value || value === this.options.defaultAlignment) return {};
            return { class: `align-${value}` };
          },
        },
      },
    }];
  },
});

// The output vocabulary is a fixed, safe whitelist: standard Markdown/GFM plus a handful of
// semantic inline tags (<u>, <sup>, <sub>, <mark>) and align classes. These marks have no
// Markdown syntax, so @tiptap/markdown serializes them from each extension's renderHTML and
// parses them back via parseHTML. There is no free-form HTML input path, so the toolbar cannot
// produce anything arbitrary (scripts, event handlers, inline styles).
export function articleExtensions() {
  return [
    // StarterKit bundles underline/paragraph/heading; disable them and use align/HTML-safe variants.
    StarterKit.configure({ link: { openOnClick: false, enableClickSelection: true }, underline: false, paragraph: false, heading: false }),
    AlignedParagraph,
    AlignedHeading,
    Image,
    TaskList,
    TaskItem.configure({ nested: true }),
    SafeUnderline,
    SafeSuperscript,
    SafeSubscript,
    SafeHighlight,
    AlignedTextAlign.configure({ types: ['heading', 'paragraph'], defaultAlignment: 'left' }),
    Markdown,
  ];
}
