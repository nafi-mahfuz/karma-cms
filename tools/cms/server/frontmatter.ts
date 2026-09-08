import { parseDocument, isMap, isAlias, isNode, stringify } from 'yaml';

export function parseFrontmatter(raw: string) {
  const match = raw.match(/^(?:\uFEFF)?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw new Error('Missing YAML frontmatter. Add a frontmatter block in your code editor.');
  const yaml = match[1];
  const doc = parseDocument(yaml);
  if (doc.errors.length || !isMap(doc.contents)) throw new Error('Invalid YAML frontmatter.');
  return { doc, yaml, body: raw.slice(match[0].length), prefix: match[0], offset: match[0].indexOf(yaml), newline: raw.includes('\r\n') ? '\r\n' : '\n' };
}

// Patch only changed value ranges. Never reserialize unrelated YAML or Markdown.
export function patchFrontmatter(raw: string, changes: Record<string, unknown>, body?: string) {
  const parsed = parseFrontmatter(raw);
  const entries = Object.entries(changes);
  if (!entries.length) return parsed.prefix + (body ?? parsed.body);
  if (isMap(parsed.doc.contents) && parsed.doc.contents.flow) throw new Error('Edit flow-style frontmatter metadata in your code editor. The original file has been preserved.');
  const edits: {start:number;end:number;value:string}[] = [];
  const additions: string[] = [];
  for (const [key,value] of entries) {
    const node = parsed.doc.get(key, true);
    const encoded = JSON.stringify(value);
    if (isNode(node) && node.range) {
      if (isAlias(node) || ('anchor' in node && node.anchor)) throw new Error(`Edit anchored or aliased field “${key}” in your code editor. The original file has been preserved.`);
      const [start,end] = node.range;
      const old = parsed.yaml.slice(start,end);
      edits.push({start,end,value:encoded + (old.endsWith('\r\n')?'\r\n':old.endsWith('\n')?'\n':'')});
    } else if (!parsed.doc.has(key)) additions.push(`${key}: ${encoded}`);
    else throw new Error(`Cannot safely edit field “${key}”. Use your code editor; the original file has been preserved.`);
  }
  let yaml = parsed.yaml;
  for (const edit of edits.sort((a,b)=>b.start-a.start)) yaml = yaml.slice(0,edit.start)+edit.value+yaml.slice(edit.end);
  if (additions.length) yaml += `${yaml.endsWith('\n')?'':parsed.newline}${additions.join(parsed.newline)}`;
  const prefix = parsed.prefix.slice(0,parsed.offset)+yaml+parsed.prefix.slice(parsed.offset+parsed.yaml.length);
  const result = prefix+(body ?? parsed.body);
  // Validate the patched document before any filesystem write.
  const actual = parseFrontmatter(result).doc.toJS();
  for (const [key,value] of entries) if (JSON.stringify(actual[key]) !== JSON.stringify(value)) throw new Error(`Could not safely preserve frontmatter while editing ${key}.`);
  return result;
}
export function newMarkdown(fields: Record<string,unknown>, body: string) { return `---\n${stringify(fields)}---\n${body}`; }
