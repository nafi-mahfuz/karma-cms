import type { PostInput } from './types';
export const slugify = (title: string) => title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,200).replace(/-$/,'');
export function prepareArticle(post: PostInput, draft: boolean): PostInput {
  return {...post, title:post.title.trim(), draft, tags:[...new Set(post.tags.map(t=>t.trim()).filter(Boolean))]};
}
export function articleError(post: PostInput): string {
  if (!post.title.trim()) return 'Give your article a title.';
  if (!post.slug || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(post.slug)) return 'Enter a slug using letters, numbers, hyphens or underscores.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.pubDate) || !Number.isFinite(Date.parse(post.pubDate)) || new Date(post.pubDate).toISOString().slice(0,10)!==post.pubDate) return 'Choose a valid publication date.';
  if (!post.draft && !post.body.trim()) return 'Write an article body before publishing.';
  if (post.featuredImage && !/^(https?:\/\/[^\s]+|\/(?!\/)[^\s]*)$/i.test(post.featuredImage)) return 'Featured image must be an http(s) URL or a site path beginning with /.';
  return '';
}
export const previewUrl = (siteUrl: string, slug: string, previewPath = '/blog/{slug}/') => `${siteUrl.replace(/\/$/,'')}${previewPath.replace('{slug}',slug.split('/').map(encodeURIComponent).join('/'))}`;
