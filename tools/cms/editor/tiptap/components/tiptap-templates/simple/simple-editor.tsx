// Adapted from Tiptap's MIT-licensed Simple Editor template.
// https://tiptap.dev/docs/ui-components/templates/simple-editor
import type { MediaItem } from '../../../../../components/MediaLibrary';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Image } from '@tiptap/extension-image';
import { Markdown } from '@tiptap/markdown';
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar';
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import { LinkPopover } from '@/components/tiptap-ui/link-popover';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';
import '@/styles/_variables.scss';
import '@/styles/_keyframe-animations.scss';
import './simple-editor.scss';

export function SimpleEditor({body,onChange,onPickImage}:{body:string;onChange:(body:string)=>void;onPickImage:(choose:(image:MediaItem)=>void)=>void}) {
  const editor = useEditor({
    immediatelyRender:false,
    extensions:[StarterKit.configure({link:{openOnClick:false,enableClickSelection:true}}),Image,Markdown],
    content:body,
    contentType:'markdown',
    onUpdate:({editor})=>onChange(editor.getMarkdown()),
    editorProps:{attributes:{class:'prose-editor simple-editor','aria-label':'Article body',role:'textbox','aria-multiline':'true'}},
  });
  return <div className="simple-editor-wrapper"><EditorContext.Provider value={{editor}}>
    <Toolbar aria-label="Article formatting">
      <ToolbarGroup><UndoRedoButton action="undo"/><UndoRedoButton action="redo"/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><HeadingDropdownMenu modal={false} levels={[1,2,3,4,5,6]}/><ListDropdownMenu modal={false} types={['bulletList','orderedList']}/><BlockquoteButton/><CodeBlockButton/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><MarkButton type="bold"/><MarkButton type="italic"/><MarkButton type="code"/><LinkPopover/><button className="secondary" type="button" disabled={!editor} onClick={()=>onPickImage(image=>editor?.chain().focus().setImage({src:image.url,alt:image.alt}).run())}>Image</button></ToolbarGroup>
    </Toolbar>
    <EditorContent editor={editor}/>
  </EditorContext.Provider></div>;
}
