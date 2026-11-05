// A small XML reader for BattleScribe rosters: elements, attributes, text,
// comments, CDATA, processing instructions and the five named entities plus
// numeric references. Namespace prefixes are dropped from names. No DTD.

export interface XmlElement {
  name: string;
  attributes: Record<string, string>;
  children: XmlElement[];
  text: string;
}

export class XmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlError";
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body] ?? whole;
  });
}

const localName = (qualified: string) => qualified.slice(qualified.indexOf(":") + 1);

export function parseXml(source: string): XmlElement {
  let i = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = source.length;
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;

  const fail = (what: string): never => {
    throw new XmlError(`${what} at offset ${i}`);
  };
  const top = () => stack[stack.length - 1];
  const addText = (text: string) => {
    const el = top();
    if (el && text) el.text += text;
  };

  while (i < n) {
    const lt = source.indexOf("<", i);
    if (lt === -1) {
      addText(decodeEntities(source.slice(i)));
      break;
    }
    if (lt > i) addText(decodeEntities(source.slice(i, lt)));
    i = lt;

    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      if (end === -1) fail("Unterminated comment");
      i = end + 3;
      continue;
    }
    if (source.startsWith("<![CDATA[", i)) {
      const end = source.indexOf("]]>", i + 9);
      if (end === -1) fail("Unterminated CDATA");
      addText(source.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (source.startsWith("<?", i)) {
      const end = source.indexOf("?>", i + 2);
      if (end === -1) fail("Unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (source.startsWith("<!", i)) {
      const end = source.indexOf(">", i + 2);
      if (end === -1) fail("Unterminated declaration");
      i = end + 1;
      continue;
    }
    if (source.startsWith("</", i)) {
      const end = source.indexOf(">", i + 2);
      if (end === -1) fail("Unterminated end tag");
      const name = localName(source.slice(i + 2, end).trim());
      const el = stack.pop();
      if (!el || el.name !== name) fail(`Unexpected end tag </${name}>`);
      i = end + 1;
      continue;
    }

    // Start tag.
    let j = i + 1;
    while (j < n && !/[\s/>]/.test(source[j]!)) j++;
    const name = localName(source.slice(i + 1, j));
    if (!name) fail("Empty tag name");
    const el: XmlElement = { name, attributes: {}, children: [], text: "" };
    let selfClosing = false;
    for (;;) {
      while (j < n && /\s/.test(source[j]!)) j++;
      if (j >= n) fail("Unterminated start tag");
      if (source[j] === ">") {
        j++;
        break;
      }
      if (source[j] === "/") {
        if (source[j + 1] !== ">") fail("Malformed self-closing tag");
        selfClosing = true;
        j += 2;
        break;
      }
      let k = j;
      while (k < n && !/[\s=]/.test(source[k]!)) k++;
      const attr = localName(source.slice(j, k));
      while (k < n && /\s/.test(source[k]!)) k++;
      if (source[k] !== "=") fail(`Attribute ${attr} has no value`);
      k++;
      while (k < n && /\s/.test(source[k]!)) k++;
      const quote = source[k];
      if (quote !== '"' && quote !== "'") throw new XmlError(`Attribute ${attr} is not quoted at offset ${k}`);
      const close = source.indexOf(quote, k + 1);
      if (close === -1) fail(`Attribute ${attr} is unterminated`);
      el.attributes[attr] = decodeEntities(source.slice(k + 1, close));
      j = close + 1;
    }
    const parent = top();
    if (parent) parent.children.push(el);
    else if (root) fail("More than one root element");
    else root = el;
    if (!selfClosing) stack.push(el);
    i = j;
  }

  if (stack.length) throw new XmlError(`Unclosed element <${stack[stack.length - 1]!.name}>`);
  if (!root) throw new XmlError("No root element");
  return root;
}
