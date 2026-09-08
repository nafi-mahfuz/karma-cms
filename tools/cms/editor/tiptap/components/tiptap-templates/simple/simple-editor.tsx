// Adapted from Tiptap's MIT-licensed Simple Editor template.
// https://tiptap.dev/docs/ui-components/templates/simple-editor
import type { MediaItem } from '../../../../../components/MediaLibrary';
import { EditorContent, EditorContext, useEditor, useCurrentEditor } from '@tiptap/react';
import { articleExtensions } from '../../../../extensions';
import { Toolbar, ToolbarGroup, ToolbarSeparator } from '@/components/tiptap-ui-primitive/toolbar';
import { Button } from '@/components/tiptap-ui-primitive/button';
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

const ALIGNMENTS = [
  { value: 'left', label: 'Align left', d: 'M4 6h16M4 12h10M4 18h13' },
  { value: 'center', label: 'Align center', d: 'M4 6h16M7 12h10M6 18h12' },
  { value: 'right', label: 'Align right', d: 'M4 6h16M10 12h10M7 18h13' },
  { value: 'justify', label: 'Justify', d: 'M4 6h16M4 12h16M4 18h16' },
] as const;

function AlignIcon({ d }: { d: string }) {
  return <svg className="tiptap-button-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

function TextAlignButtons() {
  const { editor } = useCurrentEditor();
  return <>{ALIGNMENTS.map(({ value, label, d }) => (
    <Button key={value} type="button" variant="ghost" role="button" tabIndex={-1}
      aria-label={label} tooltip={label}
      data-active-state={editor?.isActive({ textAlign: value }) ? 'on' : 'off'}
      disabled={!editor?.can().setTextAlign(value)}
      onClick={() => editor?.chain().focus().setTextAlign(value).run()}>
      <AlignIcon d={d} />
    </Button>
  ))}</>;
}

function HighlightButton() {
  const { editor } = useCurrentEditor();
  return <Button type="button" variant="ghost" role="button" tabIndex={-1}
    aria-label="Highlight" tooltip="Highlight"
    data-active-state={editor?.isActive('highlight') ? 'on' : 'off'}
    disabled={!editor?.can().toggleHighlight()}
    onClick={() => editor?.chain().focus().toggleHighlight().run()}>
    <svg className="tiptap-button-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 11-6 6v3h3l6-6" /><path d="m19 6-4-4-8.5 8.5 4 4L19 6Z" /></svg>
  </Button>;
}

export function SimpleEditor({body,onChange,onPickImage}:{body:string;onChange:(body:string)=>void;onPickImage:(choose:(image:MediaItem)=>void)=>void}) {
  const editor = useEditor({
    immediatelyRender:false,
    extensions:articleExtensions(),
    content:body,
    contentType:'markdown',
    onUpdate:({editor})=>onChange(editor.getMarkdown()),
    editorProps:{attributes:{class:'prose-editor simple-editor','aria-label':'Article body',role:'textbox','aria-multiline':'true'}},
  });
  return <div className="simple-editor-wrapper"><EditorContext.Provider value={{editor}}>
    <Toolbar aria-label="Article formatting">
      <ToolbarGroup><UndoRedoButton action="undo"/><UndoRedoButton action="redo"/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><HeadingDropdownMenu modal={false} levels={[1,2,3,4,5,6]}/><ListDropdownMenu modal={false} types={['bulletList','orderedList','taskList']}/><BlockquoteButton/><CodeBlockButton/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><MarkButton type="bold"/><MarkButton type="italic"/><MarkButton type="strike"/><MarkButton type="code"/><MarkButton type="underline"/><HighlightButton/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><MarkButton type="superscript"/><MarkButton type="subscript"/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><TextAlignButtons/></ToolbarGroup>
      <ToolbarSeparator/>
      <ToolbarGroup><LinkPopover/><button className="secondary" type="button" disabled={!editor} onClick={()=>onPickImage(image=>editor?.chain().focus().setImage({src:image.url,alt:image.alt}).run())}>Image</button></ToolbarGroup>
    </Toolbar>
    <EditorContent editor={editor}/>
  </EditorContext.Provider></div>;
}
