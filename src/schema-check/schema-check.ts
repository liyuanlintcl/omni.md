import * as fs from 'node:fs';
import * as path from 'node:path';
import { load as loadYaml } from 'js-yaml';
import { marked, Tokens } from 'marked';

export interface SchemaNode {
  type: 'section' | 'attr';
  name?: string;
  children?: string[];
  link?: string;
}

export interface DocNode {
  type: 'section' | 'attr';
  name: string;
  value?: string;
  children: DocNode[];
  links: string[];
}

interface RefSpec {
  key: string;
  min: number;
  max: number | null;
}

interface LinkRef {
  schemaFile: string;
  nodeKey: string;
  min: number;
  max: number | null;
}

export function loadSchema(p: string): Record<string, SchemaNode> {
  return loadYaml(fs.readFileSync(p, 'utf-8')) as Record<string, SchemaNode>;
}

function parseRef(ref: string): RefSpec {
  if (ref.endsWith('*')) return { key: ref.slice(0, -1), min: 0, max: null };
  if (ref.endsWith('+')) return { key: ref.slice(0, -1), min: 1, max: null };
  return { key: ref, min: 1, max: 1 };
}

function parseLinkRef(value: string): LinkRef | null {
  const hashIdx = value.indexOf('#');
  if (hashIdx === -1) return null;
  const schemaFile = value.slice(0, hashIdx).trim();
  const nodeRef = value.slice(hashIdx + 1).trim();
  if (!schemaFile || !nodeRef) return null;
  const { key, min, max } = parseRef(nodeRef);
  return { schemaFile, nodeKey: key, min, max };
}

export function findSchemas(schemaDir: string): string[] {
  if (!fs.existsSync(schemaDir)) return [];
  const results: string[] = [];
  function walk(current: string) {
    for (const e of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.yaml')) results.push(full);
    }
  }
  walk(schemaDir);
  return results;
}

function extractWikiLinks(text: string): string[] {
  const links: string[] = [];
  const re = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;
  for (const m of text.matchAll(re)) {
    links.push(m[1].trim());
  }
  return links;
}

function resolveLink(target: string, docTree: DocNode, docPath: string): DocNode[] {
  const docBase = path.basename(docPath, '.md');
  const results: DocNode[] = [];

  const hashIdx = target.indexOf('#');
  if (hashIdx === -1) return results;

  const filePart = target.slice(0, hashIdx);
  const sectionPath = target.slice(hashIdx + 1);
  if (!filePart || !sectionPath) return results;
  if (filePart !== docBase) return results;

  const parts = sectionPath.split('#').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return results;

  function allNodes(n: DocNode): DocNode[] {
    const list: DocNode[] = [];
    function walk(node: DocNode) {
      list.push(node);
      for (const c of node.children) walk(c);
    }
    for (const c of n.children) walk(c);
    return list;
  }
  const all = allNodes(docTree);

  function descend(start: DocNode, segs: string[]): DocNode | null {
    let cur: DocNode | null = start;
    for (const seg of segs) {
      const found: DocNode | undefined = cur?.children.find(c => c.name === seg);
      if (!found) { cur = null; break; }
      cur = found;
    }
    return cur;
  }

  for (const cand of all.filter(n => n.name === parts[0])) {
    const found = descend(cand, parts.slice(1));
    if (found) results.push(found);
  }

  if (results.length === 0) {
    const h1Name = docTree.children[0]?.name;
    if (h1Name) {
      const withH1 = [h1Name, ...parts];
      for (const cand of all.filter(n => n.name === withH1[0])) {
        const found = descend(cand, withH1.slice(1));
        if (found) results.push(found);
      }
    }
  }

  return results;
}

function resolveSchema(schemaFile: string, schemaDir: string): Record<string, SchemaNode> | null {
  const targetPath = path.join(schemaDir, schemaFile + '.yaml');
  if (!fs.existsSync(targetPath)) return null;
  return loadSchema(targetPath);
}

function validateLink(
  docLinks: string[],
  schemaLink: string | undefined,
  schema: Record<string, SchemaNode>,
  schemaDir: string,
  docTree: DocNode,
  docPath: string,
  issues: string[],
  p: string,
): void {
  if (!schemaLink) return;

  const linkRef = parseLinkRef(schemaLink);
  if (!linkRef) {
    issues.push(`  [SCHEMA_ERROR] Invalid link format '${schemaLink}' (expected 'file#node_id')`);
    return;
  }

  const myBase = path.basename(docPath, '.md');
  let targetSchema = schema;
  if (linkRef.schemaFile !== myBase) {
    const loaded = resolveSchema(linkRef.schemaFile, schemaDir);
    if (!loaded) {
      issues.push(`  [SCHEMA_ERROR] Schema '${linkRef.schemaFile}' not found`);
      return;
    }
    if (!loaded[linkRef.nodeKey]) {
      issues.push(`  [SCHEMA_ERROR] '${linkRef.nodeKey}' not defined in schema '${linkRef.schemaFile}'`);
      return;
    }
    targetSchema = loaded;
  }

  const targetNode = targetSchema[linkRef.nodeKey];
  if (!targetNode) {
    issues.push(`  [SCHEMA_ERROR] '${linkRef.nodeKey}' not defined in schema '${linkRef.schemaFile}'`);
    return;
  }

  let count = 0;
  for (const link of docLinks) {
    const targetNodes = resolveLink(link, docTree, docPath);
    for (const docNode of targetNodes) {
      if (docNode.type === targetNode.type && (targetNode.name === undefined || docNode.name === targetNode.name)) {
        count++;
      }
    }
  }

  if (count < linkRef.min) {
    issues.push(`  [MISSING LINK] '${linkRef.schemaFile}#${linkRef.nodeKey}' need >= ${linkRef.min} link(s), got ${count}  (${p})`);
  }
  if (linkRef.max !== null && count > linkRef.max) {
    issues.push(`  [EXTRA LINK]   '${linkRef.schemaFile}#${linkRef.nodeKey}' need <= ${linkRef.max} link(s), got ${count}  (${p})`);
  }
}

function parseList(
  listToken: Tokens.List,
  parent: DocNode,
): void {
  for (const item of listToken.items) {
    const m = item.text.split('\n')[0].match(/^(.+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const node: DocNode = {
      type: 'attr',
      name: m[1].trim(),
      value: m[2].trim(),
      children: [],
      links: extractWikiLinks(item.text.split('\n')[0]),
    };
    for (const t of item.tokens) {
      if (t.type === 'list') {
        parseList(t as Tokens.List, node);
      }
    }
    parent.children.push(node);
  }
}

function parseDocTree(text: string): DocNode {
  const tokens = marked.lexer(text);
  const root: DocNode = { type: 'section', name: 'ROOT', children: [], links: [] };
  const stack: { node: DocNode; level: number }[] = [{ node: root, level: 0 }];

  for (const token of tokens) {
    if (token.type === 'heading') {
      const h = token as Tokens.Heading;
      while (stack.length > 0 && stack.at(-1)!.level >= h.depth) {
        stack.pop();
      }
      const node: DocNode = {
        type: 'section',
        name: h.text,
        children: [],
        links: extractWikiLinks(h.text),
      };
      stack.at(-1)!.node.children.push(node);
      stack.push({ node, level: h.depth });
    } else if (token.type === 'paragraph') {
      const p = token as Tokens.Paragraph;
      const links = extractWikiLinks(p.text);
      stack.at(-1)!.node.links.push(...links);
    } else if (token.type === 'list') {
      parseList(token as Tokens.List, stack.at(-1)!.node);
    }
  }
  return root;
}

function collectSchemaRefs(
  schemaKey: string,
  schema: Record<string, SchemaNode>,
): Record<string, { min: number; max: number | null; node: SchemaNode }> {
  const node = schema[schemaKey];
  const result: Record<string, { min: number; max: number | null; node: SchemaNode }> = {};
  for (const childRef of node.children ?? []) {
    const { key, min, max } = parseRef(childRef);
    if (!result[key]) {
      result[key] = { min, max, node: schema[key] };
    }
  }
  return result;
}

function matchNode(
  docNode: DocNode,
  schemaKey: string,
  schema: Record<string, SchemaNode>,
): boolean {
  const s = schema[schemaKey];
  if (docNode.type !== s.type) return false;
  return s.name === undefined || docNode.name === s.name;
}

function validateNode(
  docChildren: DocNode[],
  schemaNodeKey: string,
  schema: Record<string, SchemaNode>,
  schemaDir: string,
  docTree: DocNode,
  docPath: string,
  issues: string[],
  p = '',
): void {
  const refSpecs = collectSchemaRefs(schemaNodeKey, schema);
  const keys = Object.keys(refSpecs);
  if (keys.length === 0) return;

  const counts: Record<string, number> = {};
  for (const k of keys) counts[k] = 0;
  const used = new Set<number>();

  for (const refKey of keys) {
    for (let i = 0; i < docChildren.length; i++) {
      if (used.has(i)) continue;
      if (!matchNode(docChildren[i], refKey, schema)) continue;
      counts[refKey]++;
      used.add(i);
      const childPath = p ? `${p} > ${docChildren[i].name}` : docChildren[i].name;

      const sNode = schema[refKey];
      validateLink(docChildren[i].links, sNode.link, schema, schemaDir, docTree, docPath, issues, childPath);

      validateNode(docChildren[i].children ?? [], refKey, schema, schemaDir, docTree, docPath, issues, childPath);
    }
  }

  for (const refKey of keys) {
    const spec = refSpecs[refKey];
    if (counts[refKey] < spec.min) {
      issues.push(`  [MISSING] '${refKey}' need >= ${spec.min}, got ${counts[refKey]}  (${p})`);
    }
    if (spec.max !== null && counts[refKey] > spec.max) {
      issues.push(`  [EXTRA]   '${refKey}' need <= ${spec.max}, got ${counts[refKey]}  (${p})`);
    }
  }
}

export function validateSchema(
  docPath: string,
  schemaPath: string,
): string[] {
  const schema = loadSchema(schemaPath);
  const schemaDir = path.dirname(schemaPath);
  const issues: string[] = [];

  const rootSchema = schema['root'];
  if (!rootSchema) {
    issues.push(`  [SCHEMA_ERROR] 'root' not found in schema`);
    return issues;
  }
  if (rootSchema.type !== 'section') {
    issues.push(`  [SCHEMA_ERROR] 'root.type' must be 'section'`);
  }

  const text = fs.readFileSync(docPath, 'utf-8');
  const docTree = parseDocTree(text);

  const placeholderPatterns: [RegExp, string][] = [
    [/\{\{.*?\}\}/g, 'variable'],
    [/\{\%.*?\%\}/g, 'tag'],
    [/\{\#.*?\#\}/g, 'comment'],
  ];
  for (const [pat, label] of placeholderPatterns) {
    for (const m of text.matchAll(pat)) {
      issues.push(`  [PLACEHOLDER] Unreplaced ${label}: ${m[0].trim()}`);
    }
  }

  const rootName = rootSchema.name;
  let docRoot: DocNode | null = null;
  for (const child of docTree.children) {
    if (child.type === 'section' && (rootName === undefined || child.name === rootName)) {
      docRoot = child;
      break;
    }
  }

  if (!docRoot) {
    issues.push(`  [MISSING] Root section '${rootName}' not found`);
    return issues;
  }

  validateLink(docRoot.links, rootSchema.link, schema, schemaDir, docTree, docPath, issues, docRoot.name);

  validateNode(docRoot.children, 'root', schema, schemaDir, docTree, docPath, issues);
  return issues;
}

export function deriveDocPath(projectRoot: string, schemaRel: string): string {
  const base = schemaRel.replace(/\.yaml$/i, '');
  return path.resolve(projectRoot, 'omni.md', base + '.md');
}
