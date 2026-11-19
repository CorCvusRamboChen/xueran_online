// 打包时把客户端代码里的中文自动接上翻译（见 src/shared/i18n/core.js 开头的说明）。
//   '中文'            → __t('中文')
//   `第 ${n} 夜`      → __tt('第 {0} 夜', [n])
//   <p>你有 {n} 票</p> → <p>{__tj('你有 {0} 票', [n])}</p>（同一行里的文字和 {…}、<b>…</b> 合成一句）
//   title="提示"      → title={__t('提示')}
// 不动的：import 路径、对象的键、obj['中文'] 这种当键用的、正则、console.*。
// 中文下 __t 原样返回，所以中文界面和以前一模一样。
// 同一个插件也给 scripts/i18n/extract.mjs 用（opts.collect 收集所有键），保证抽出来的键和运行时查的键一样。
const CJK = /[一-鿿]/;
const FN = new Set(['__t', '__tt', '__tj']);
// 着色器代码（GLSL）里的中文注释：不是给玩家看的，整段不动
const CODE = /(void main|gl_FragColor|gl_Position|precision (high|medium|low)p)/;
const STRING_ONLY_PARENTS = new Set(['option', 'title', 'textarea', 'tspan', 'text']);

/** React 处理 JSX 文字的空白规则（同 @babel/types 的 cleanJSXElementLiteralChild）：'' 表示这段会被去掉。 */
function cleanJSX(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) lastNonEmpty = i;
  let str = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/\t/g, ' ');
    if (i !== 0) line = line.replace(/^[ ]+/, '');
    if (i !== lines.length - 1) line = line.replace(/[ ]+$/, '');
    if (line) { if (i !== lastNonEmpty) line += ' '; str += line; }
  }
  return str;
}
const trimKey = (k) => k.trim();

module.exports = function i18nPlugin({ types: t }, opts = {}) {
  const collect = opts.collect; // (key, file) => void
  const call = (name, args) => t.callExpression(t.identifier(name), args);

  function isKeyLike(path) {
    const p = path.parentPath;
    if (!p) return false;
    if (p.isImportDeclaration() || p.isExportAllDeclaration() || p.isExportNamedDeclaration() || p.isImport?.()) return true;
    if ((p.isObjectProperty() || p.isObjectMethod() || p.isClassProperty?.() || p.isClassMethod?.()) && p.node.key === path.node && !p.node.computed) return true;
    if (p.isMemberExpression() && p.node.property === path.node) return true; // obj['中文']
    if (p.isNewExpression() && t.isIdentifier(p.node.callee, { name: 'RegExp' })) return true;
    if (p.isCallExpression() && path.listKey === 'arguments') {
      const c = p.node.callee;
      if (t.isIdentifier(c) && FN.has(c.name)) return true; // 自己生成的
      if (t.isIdentifier(c, { name: 'require' })) return true;
      if (t.isImport?.(c)) return true;
    }
    if (p.isTSLiteralType?.()) return true;
    return false;
  }
  function inConsole(path) {
    return !!path.findParent((p) => p.isCallExpression() && t.isMemberExpression(p.node.callee) && t.isIdentifier(p.node.callee.object, { name: 'console' }));
  }

  return {
    name: 'botc-i18n',
    visitor: {
      Program: {
        enter(path, state) { state.i18nUsed = false; state.file.i18nFile = state.filename || state.file.opts.filename || ''; },
        exit(path, state) {
          if (!state.i18nUsed || collect || opts.noImport) return;
          const src = opts.runtime || '@i18n';
          path.unshiftContainer('body', t.importDeclaration(
            [...FN].map((n) => t.importSpecifier(t.identifier(n), t.identifier(n))),
            t.stringLiteral(src),
          ));
        },
      },
      StringLiteral(path, state) {
        const v = path.node.value;
        if (!CJK.test(v) || CODE.test(v)) return;
        if (path.parentPath.isJSXAttribute()) return; // JSXAttribute 里处理
        if (isKeyLike(path) || inConsole(path)) return;
        if (path.parentPath.isTSLiteralType?.()) return;
        const k = trimKey(v);
        if (collect) { collect(k, state.filename); return; }
        state.i18nUsed = true;
        path.replaceWith(call('__t', [t.stringLiteral(v)]));
        path.skip();
      },
      TemplateLiteral(path, state) {
        if (path.parentPath.isTaggedTemplateExpression()) return;
        const qs = path.node.quasis;
        if (!qs.some((q) => CJK.test(q.value.cooked ?? q.value.raw))) return;
        if (qs.some((q) => CODE.test(q.value.raw))) return;
        if (inConsole(path)) return;
        const key = qs.map((q, i) => (i ? `{${i - 1}}` : '') + (q.value.cooked ?? q.value.raw)).join('');
        if (collect) { collect(trimKey(key), state.filename); return; }
        state.i18nUsed = true;
        path.replaceWith(call('__tt', [t.stringLiteral(key), t.arrayExpression(path.node.expressions)]));
      },
      JSXAttribute(path, state) {
        const v = path.node.value;
        if (!t.isStringLiteral(v) || !CJK.test(v.value)) return;
        if (collect) { collect(trimKey(v.value), state.filename); return; }
        state.i18nUsed = true;
        path.node.value = t.jsxExpressionContainer(call('__t', [t.stringLiteral(v.value)]));
      },
      'JSXElement|JSXFragment'(path, state) {
        const kids = path.node.children;
        // 「」：只有引号没有中文的（「{台词}」）也接上，英文下换成英文引号
        const TEXTY = (v) => CJK.test(v) || /[「」]/.test(v);
        if (!kids.some((c) => t.isJSXText(c) && TEXTY(c.value))) return;
        const tag = t.isJSXElement(path.node) && t.isJSXIdentifier(path.node.openingElement.name) ? path.node.openingElement.name.name : '';
        const stringOnly = STRING_ONLY_PARENTS.has(tag);
        const out = [];
        let run = [];
        const flush = () => {
          if (!run.length) return;
          const hasCjk = run.some((c) => t.isJSXText(c) && TEXTY(c.value));
          if (!hasCjk) { out.push(...run); run = []; return; }
          let key = '';
          const args = [];
          for (const c of run) {
            if (t.isJSXText(c)) key += cleanJSX(c.value);
            else { key += `{${args.length}}`; args.push(t.isJSXExpressionContainer(c) ? c.expression : c); }
          }
          // 首尾空白：留在外面
          const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(key);
          if (collect) collect(m[2], state.filename);
          else {
            state.i18nUsed = true;
            if (m[1]) out.push(t.jsxText(m[1]));
            const expr = args.length === 0 ? call('__t', [t.stringLiteral(m[2])])
              : call(stringOnly ? '__tt' : '__tj', [t.stringLiteral(m[2]), t.arrayExpression(args)]);
            out.push(t.jsxExpressionContainer(expr));
            if (m[3]) out.push(t.jsxText(m[3]));
          }
          if (collect) out.push(...run);
          run = [];
        };
        for (const c of kids) {
          if (t.isJSXText(c)) {
            const raw = c.value;
            const cleaned = cleanJSX(raw);
            if (!cleaned) { flush(); out.push(c); continue; }
            // 文字开头有换行：和前面的不是同一行，前面的先结束；结尾有换行：这一段到此为止
            if (/^[ \t]*[\r\n]/.test(raw)) flush();
            run.push(t.jsxText(cleaned === raw ? raw : cleaned));
            if (/[\r\n][ \t]*$/.test(raw)) flush();
          } else if (t.isJSXExpressionContainer(c) && t.isJSXEmptyExpression(c.expression)) {
            flush(); out.push(c);
          } else if (t.isJSXSpreadChild(c)) {
            flush(); out.push(c);
          } else run.push(c);
        }
        flush();
        if (!collect) path.node.children = out;
      },
      JSXText(path, state) {
        // 上面合并过的已经换掉了；这里只剩不在元素里的（几乎没有）
      },
    },
  };
};
module.exports.cleanJSX = cleanJSX;
