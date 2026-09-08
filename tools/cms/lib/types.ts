export interface Fields { title: string; description: string; pubDate: string; draft: boolean; tags: string[] }
export interface Post extends Fields { id: string; body: string; revision: string; updatedAt: string; words: number }
export type PostInput = Fields & { body: string; id: string; revision?: string };
