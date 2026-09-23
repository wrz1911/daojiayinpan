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
   内联 onclick 的运行时探测 + 自动兜底
   ------------------------------------------------------------
   动机: 只要 yinpan.html 里出现**任何**内联 <script>/<style>(哪怕一行统计
     代码), Tauri 就会重新注入 sha256, 'unsafe-inline' 随即失效 —— 届时 HTML
     字符串里的 36 处 onclick 会**集体**失效, 而浏览器侧完全复现不出来。
     这个坑本项目已经踩过一次(先后天三宫标记点不动), 排查成本极高。
   做法(不改任何业务代码, 零风险):
     ① 造一个游离元素, 用**属性方式**挂一个 onclick, 点它一下看是否执行;
     ② 只有确认已被 CSP 拦截时, 才挂一个捕获阶段的委托监听, 把 onclick
        属性里的语句解析出来手动执行;
     ③ 探测通过时**什么都不做**, 运行时行为与改造前完全一致。
   覆盖形态: `fn()` / `fn(1)` / `fn(-1)` / `fn(1,window._mlData)` /
             `event.stopPropagation()` / `this.remove()` /
             `document.getElementById('x').remove()` / 以及它们的分号组合。
   ============================================================ */
(function () {
  'use strict';

  var WARNED = false;

  /** 探测: 属性方式的内联 onclick 在当前 CSP 下是否会被执行 */
  function inlineHandlersWork() {
    if (!document.body) return true;            // 拿不到 body 就不冒进
    var probe = document.createElement('div');
    probe.setAttribute('onclick', 'window.__qmInlineProbe = 1');
    probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:0;height:0';
    document.body.appendChild(probe);
    var ok = false;
    try { probe.click(); ok = window.__qmInlineProbe === 1; } catch (e) { ok = false; }
    try { delete window.__qmInlineProbe; } catch (e) { window.__qmInlineProbe = undefined; }
    if (probe.parentNode) probe.parentNode.removeChild(probe);
    return ok;
  }

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

  /** 把实参字面量还原成真正的值 */
  function coerce(raw) {
    var s = String(raw).trim();
    if (s === 'window._mlData') return window._mlData;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);   // shen12(1) / panChange(-1)
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if ((s.charAt(0) === "'" && s.slice(-1) === "'") ||
        (s.charAt(0) === '"' && s.slice(-1) === '"')) return s.slice(1, -1);
    return s;
  }

  /** 解析单条语句 → 指令对象; 认不出来返回 null */
  function parseStatement(stmt) {
    var s = stmt.trim();
    if (!s) return null;

    if (s === 'event.stopPropagation()') return { kind: 'stop' };

    /* this.remove() / this.parentNode.remove() */
    if (/^this(?:\.parentNode)?\.remove\(\)$/.test(s)) return { kind: 'selfRemove' };

    /* document.getElementById('x').remove() */
    var mById = /^document\.getElementById\((['"])([\s\S]+?)\1\)\.remove\(\)$/.exec(s);
    if (mById) return { kind: 'removeById', id: mById[2] };

    /* 关闭弹层: let p=this; while(p){ if(...position==='fixed'){ p.remove(); break; } p=p.parentNode; } */
    if (/^let\s+p\s*=\s*this\s*;\s*while\s*\(\s*p\s*\)/.test(s) &&
        /position/.test(s) && /fixed/.test(s)) {
      return { kind: 'closeFixedParent' };
    }

    /* 常规 fn(args) —— 只认全局函数, 不碰 eval */
    var m = /^([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/.exec(s);
    if (!m) return null;
    var fn = window[m[1]];
    if (typeof fn !== 'function') return null;
    var raw = m[2].trim();
    return { kind: 'call', fn: fn, args: raw ? splitTopLevel(raw, ',').map(coerce) : [] };
  }

  /** 解析整段 onclick 源码 → 指令数组; 任一条认不出来就整体放弃(宁可不兜底, 也不误调) */
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

  /** 兜底委托: 仅在探测失败时才会被挂上 */
  function onCaptureClick(e) {
    var el = e.target;
    if (!el || typeof el.closest !== 'function') return;
    var host = el.closest('[onclick]');
    if (!host) return;

    var attr = host.getAttribute('onclick');
    var prog = parseInline(attr);
    if (!prog) {
      if (!WARNED) {
        WARNED = true;
        console.warn('[qimen] 内联 onclick 已被 CSP 拦截, 但这条无法自动解析: ' + attr);
      }
      return;
    }

    for (var i = 0; i < prog.length; i++) {
      var st = prog[i];
      try {
        if (st.kind === 'stop') { e.stopPropagation(); }
        else if (st.kind === 'selfRemove') { host.remove(); }
        else if (st.kind === 'removeById') {
          var d = document.getElementById(st.id);
          if (d) d.remove();
        } else if (st.kind === 'closeFixedParent') {
          /* 从宿主往上找第一个 position:fixed 的祖先并移除(与内联写法等价) */
          var cur = host;
          while (cur) {
            if (cur.style && cur.style.position === 'fixed') { cur.remove(); break; }
            cur = cur.parentNode;
          }
        } else if (st.kind === 'call') {
          st.fn.apply(host, st.args);
        }
      } catch (err) {
        if (window._logErr) window._logErr('inlineFallback', err && err.message);
      }
    }
  }

  if (!inlineHandlersWork()) {
    document.addEventListener('click', onCaptureClick, true);
    console.warn('[qimen] 检测到 CSP 已阻止内联 onclick(HTML 里可能又被加回了内联 ' +
      '<script>/<style>), 已自动启用委托兜底。根治办法: 把内联脚本移出 HTML。');
  }
})();
