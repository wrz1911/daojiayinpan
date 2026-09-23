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
