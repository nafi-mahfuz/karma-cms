import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/blog' }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().default(''),
    pubDate: z.coerce.date(),
    draft: z.boolean().default(true),
    featuredImage: z.string().default(''),
    featuredImageAlt: z.string().default(''),
    seoTitle: z.string().default(''),
    metaDescription: z.string().default(''),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});
export const collections = { blog };
