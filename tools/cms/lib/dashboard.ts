import type { Post } from './types.js';
export function filterPosts(posts:Post[],query:string,status:string,category:string,sort:string) {
  const needle=query.trim().toLocaleLowerCase();
  return posts.filter(p=>(status==='all'||(status==='drafts'?p.draft:!p.draft)) && (category==='all'||(category==='none'?!p.category: p.category===category.slice(6))) && `${p.title} ${p.id} ${p.description} ${p.category || ''} ${p.tags.join(' ')}`.toLocaleLowerCase().includes(needle)).sort((a,b)=>{
    const comparison=sort==='title'?a.title.localeCompare(b.title):sort==='title-desc'?b.title.localeCompare(a.title):sort==='date'?b.pubDate.localeCompare(a.pubDate):sort==='oldest'?a.pubDate.localeCompare(b.pubDate):b.updatedAt.localeCompare(a.updatedAt);
    return comparison||a.id.localeCompare(b.id);
  });
}
