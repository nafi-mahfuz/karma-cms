import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import Image from '@tiptap/extension-image';
import { useState } from 'react';
export function ArticleEditor({body,onChange}:{body:string;onChange:(body:string)=>void}) {
  const [, refresh] = useState(0);
  const editor = useEditor({ extensions:[StarterKit.configure({link:{openOnClick:false}}),Markdown,Image], content:body,contentType:'markdown',onUpdate:({editor})=>onChange(editor.getMarkdown()),onTransaction:()=>refresh(x=>x+1),editorProps:{attributes:{class:'prose-editor','aria-label':'Article body'}} });
  if (!editor) return null;
  const action = (label:string, title:string, run:()=>void, active=false) => <button type="button" title={title} aria-label={title} aria-pressed={active} className={active?'active':''} onClick={run}>{label}</button>;
  return <><div className="formatbar">
    {action('B','Bold',()=>editor.chain().focus().toggleBold().run(),editor.isActive('bold'))}
    {action('I','Italic',()=>editor.chain().focus().toggleItalic().run(),editor.isActive('italic'))}
    {action('H2','Heading',()=>editor.chain().focus().toggleHeading({level:2}).run(),editor.isActive('heading',{level:2}))}<i/>
    {action('≡','Bullet list',()=>editor.chain().focus().toggleBulletList().run(),editor.isActive('bulletList'))}
    {action('1.','Numbered list',()=>editor.chain().focus().toggleOrderedList().run(),editor.isActive('orderedList'))}
    {action('❝','Quote',()=>editor.chain().focus().toggleBlockquote().run(),editor.isActive('blockquote'))}
    {action('</>','Code block',()=>editor.chain().focus().toggleCodeBlock().run(),editor.isActive('codeBlock'))}<i/>
    {action('↗','Insert link',()=>{const href=prompt('Link URL',editor.getAttributes('link').href || 'https://');if(href===null)return;if(!href)editor.chain().focus().unsetLink().run();else if (/^(https?:\/\/|mailto:|\/|#)/i.test(href))editor.chain().focus().setLink({href}).run();})}
    {action('▧','Insert image URL',()=>{const src=prompt('Image URL (https://…)');if(src&&/^https?:\/\//i.test(src))editor.chain().focus().setImage({src,alt:prompt('Image description')||''}).run();})}
    <span/>{action('↶','Undo',()=>editor.chain().focus().undo().run())}{action('↷','Redo',()=>editor.chain().focus().redo().run())}
  </div><EditorContent editor={editor}/></>;
}
