/* ============================================================
   启动引导 —— 必须排在 bundle 的最前面执行(见 scripts/build.sh 的 bundle 子命令)
   ------------------------------------------------------------
   ⚠️ 这里的两段代码**原本是 HTML 里的内联 <script>**, 必须搬出来:
     Tauri 在编译期会为 HTML 中的内联脚本/样式计算 sha256 并注入 CSP
     (tauri-codegen 的 CspHashes → 运行时拼进 script-src)。而按 CSP 规范,
     script-src 里一旦出现 hash 或 nonce, 同行的 'unsafe-inline' 就被**忽略** ——
     于是所有内联 onclick 属性(本项目 36 处)全部不执行。
     症状: 浏览器/网页版一切正常, 桌面版(Tauri)里宫格短按(先后天三宫标记)、
     地八神/人八神/玄女16诀/金口诀等按钮点了没反应。
     HTML 里不再有内联脚本后, CSP 不含 hash, 'unsafe-inline' 重新生效。
   ============================================================ */

/* 安卓 / Capacitor 环境标记(原为 <body> 开头的内联脚本)。
   bundle 在 body 末尾加载, 此时 document.body 一定存在。 */
if (navigator.userAgent.indexOf('Android') > -1 || window.Capacitor) {
  document.body.classList.add('is-mobile');
}

/* tyme4j 别名(原为紧跟 tyme4j-browser.js 的内联脚本)。
   bundle 排在其后加载, 执行顺序不变, window.tyme 此时已就绪。 */
window.tyme4j = window.tyme || {};

/* ============================================================
   内联事件属性接管(rebind) —— 2026-09-24 二次修复, 取代已撤掉的 575ac9b 方案
   ------------------------------------------------------------
   ⚠️ 此前"HTML 无内联 <script> 后, 内联 onclick 就能用"的结论**是错的**:
   Tauri 2 运行时会把自己的初始化脚本以 **nonce** 方式注入页面(可执行文件里的
   __TAURI_SCRIPT_NONCE__ / __TAURI_STYLE_NONCE__ 字符串即是), 并把 'nonce-xxx'
   追加进 CSP —— 而 CSP 规范规定: script-src 一旦出现 nonce **或** hash,
   同行的 'unsafe-inline' 即被忽略。
   → **只要配置了 CSP, 桌面版(WebKitGTK)的内联 onclick/onchange/onkeydown
     永远无效**, 与 HTML 里有没有内联 <script> 无关。实测(main 最新构建):
     地八神/人八神/玄女16诀/金口诀四按钮(纯内联属性、无程序化兜底)零响应。

   本方案(全端统一、无双触发):
     · 解析成功的内联属性 → **移除属性** + 程序化绑定 el.onclick = fn。
       属性移除后内联路径物理消失, 网页/Android/桌面都只走程序化这一条路。
     · 解析不了的复杂语句 → **保留属性**(网页/Android 仍可用), console.warn 留痕。
       需要桌面版支持时: 把逻辑抽成具名函数放进 yinpan_app.js 并导出,
       属性里只写 fn() / fn(N) / fn('str') / fn(event) 形态。
   历史教训(575ac9b 翻车原因, 勿重蹈): "先探测内联是否有效、再决定挂不挂
   委托" —— WebKitGTK 的 probe.click() 不触发属性 handler, 内联有效也被误判
   成失效, 挂上的委托与内联**同时执行** → toggle 类函数双触发 = 点了没反应。
   本方案不探测、直接替换, 从机制上杜绝双触发。
   ============================================================ */
(function () {
  'use strict';

  var WARNED = {};

  /** 按顶层分隔符切分; 括号/引号内的分隔符不算(避免切坏字符串参数) */
  function splitTopLevel(s, sep) {
    var out = [], depth = 0, cur = '', quote = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (quote) {
        cur += c;
        if (c === quote && s.charAt(i - 1) !== '\\') quote = '';
        continue;
      }
      if (c === "'" || c === '"') { quote = c; cur += c; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      if (c === sep && depth === 0) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  var EV = { __qimenEvent: true };   /* 'event' 参数占位, 执行时替换为真实事件 */

  /** 把实参字面量还原成真正的值 */
  function coerce(raw) {
    var s = String(raw).trim();
    if (s === 'event') return EV;
    if (s === 'window._mlData') return window._mlData;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);   /* shen12(1) / panChange(-1) */
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if ((s.charAt(0) === "'" && s.slice(-1) === "'") ||
        (s.charAt(0) === '"' && s.slice(-1) === '"')) return s.slice(1, -1);
    return s;
  }

  /** 解析单条语句 → 指令对象; 认不出来返回 null。函数引用**执行时**才查
      (rebind 发生在 bundle 各 IIFE 定义完之前也是安全的, 惰性解析)。 */
  function parseStatement(s) {
    s = s.trim();
    if (!s) return null;

    if (s === 'event.stopPropagation()') return { kind: 'stop' };
    if (s === 'event.preventDefault()') return { kind: 'prevent' };

    /* this.remove() / this.parentNode.remove() */
    if (/^this(?:\.parentNode)?\.remove\(\)$/.test(s)) return { kind: 'selfRemove' };

    /* document.getElementById('x').remove() —— 弹窗关闭按钮 */
    var mById = /^document\.getElementById\((['"])([\s\S]+?)\1\)\.remove\(\)$/.exec(s);
    if (mById) return { kind: 'removeById', id: mById[2] };

    /* 关闭弹层: let p=this; while(p){ if(...position==='fixed'){ p.remove(); break; } p=p.parentNode; } */
    if (/^let\s+p\s*=\s*this\s*;\s*while\s*\(\s*p\s*\)/.test(s) &&
        /position/.test(s) && /fixed/.test(s)) {
      return { kind: 'closeFixedParent' };
    }

    /* 常规 fn(args) 与 window.fn(args) —— 只认全局函数, 不碰 eval/new Function
       (CSP 无 'unsafe-eval', new Function 会被拦) */
    var m = /^(?:window\.)?([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/.exec(s);
    if (!m) return null;
    var raw = m[2].trim();
    return { kind: 'call', name: m[1], args: raw ? splitTopLevel(raw, ',').map(coerce) : [] };
  }

  /** 解析整段属性源码 → 指令数组; 任一条认不出来就整体放弃(宁可不接管, 也不误调) */
  function parseInline(code) {
    code = String(code == null ? '' : code).trim();
    if (!code) return null;
    var stmts = splitTopLevel(code, ';')
      .map(function (x) { return x.trim(); })
      .filter(function (x) { return x.length > 0; });
    var prog = [];
    for (var i = 0; i < stmts.length; i++) {
      var p = parseStatement(stmts[i]);
      if (!p) return null;
      prog.push(p);
    }
    return prog.length ? prog : null;
  }

  function runInline(prog, host, ev) {
    for (var i = 0; i < prog.length; i++) {
      var st = prog[i];
      try {
        if (st.kind === 'stop') { if (ev) ev.stopPropagation(); }
        else if (st.kind === 'prevent') { if (ev) ev.preventDefault(); }
        else if (st.kind === 'selfRemove') { host.remove(); }
        else if (st.kind === 'removeById') {
          var d = document.getElementById(st.id);
          if (d) d.remove();
        } else if (st.kind === 'closeFixedParent') {
          var cur = host;
          while (cur) {
            if (cur.style && cur.style.position === 'fixed') { cur.remove(); break; }
            cur = cur.parentNode;
          }
        } else if (st.kind === 'call') {
          var fn = window[st.name];
          if (typeof fn === 'function') {
            fn.apply(host, st.args.map(function (a) { return a === EV ? ev : a; }));
          } else if (window._logErr) {
            window._logErr('rebindInline', 'window.' + st.name + ' 不是函数');
          }
        }
      } catch (err) {
        if (window._logErr) window._logErr('rebindInline', err && err.message);
      }
    }
  }

  var ATTRS = ['onclick', 'onchange', 'onkeydown'];

  function rebindEl(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var attr = ATTRS[i];
      var code = el.getAttribute(attr);
      if (!code) continue;
      var prog = parseInline(code);
      if (!prog) {
        if (!WARNED[attr + code]) {
          WARNED[attr + code] = 1;
          console.warn('[qimen] 内联 ' + attr + ' 无法自动接管(已保留原属性, 桌面版可能无响应): ' + code);
        }
        continue;
      }
      el.removeAttribute(attr);   /* 关键: 内联路径物理移除, 杜绝双触发 */
      (function (prog) {
        el[attr] = function (ev) { runInline(prog, this, ev); };
      })(prog);
    }
  }

  function rebindRoot(root) {
    if (!root) return;
    if (root.querySelectorAll) {
      var els = root.querySelectorAll('[onclick],[onchange],[onkeydown]');
      for (var i = 0; i < els.length; i++) rebindEl(els[i]);
    }
    /* querySelectorAll 不含 root 自身(MutationObserver 的 addedNodes 可能就是目标) */
    if (root.nodeType === 1) {
      var has = false;
      for (var j = 0; j < ATTRS.length; j++) { if (root.getAttribute(ATTRS[j])) { has = true; break; } }
      if (has) rebindEl(root);
    }
  }

  /* 动态渲染收口: 宫格/按钮/弹窗全部走 innerHTML, 渲染后由 observer 统一接管。
     微任务去抖: 一次渲染产生的一批 mutation 只扫一遍。 */
  if (window.MutationObserver) {
    var pending = false;
    new MutationObserver(function (muts) {
      var has = false;
      for (var i = 0; i < muts.length; i++) {
        if (muts[i].addedNodes && muts[i].addedNodes.length) { has = true; break; }
      }
      if (!has || pending) return;
      pending = true;
      Promise.resolve().then(function () {
        pending = false;
        rebindRoot(document);
      });
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  /* 静态元素: bundle 在 body 末尾加载, 此时 HTML 里的 select 等都已就绪 */
  rebindRoot(document);
})();
