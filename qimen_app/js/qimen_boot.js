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
   ⚠️ 不要在这里给内联 onclick 加任何「兜底委托」（2026-09-24 实测教训）
   ------------------------------------------------------------
   曾加过一层运行时探测 + 捕获阶段委托, 想兜住"CSP 万一又拦住内联 onclick"的情况,
   结果**反而把好端端的功能搞坏了**, 已撤掉, 原因是:
     · 探测靠 `probe.click()` —— 在 WebKitGTK 里它**不会触发属性方式的内联 handler**,
       于是内联明明有效也被判成"失效";
     · 判成失效后挂上的捕获委托, 会与内联 onclick **同时执行** → 双重触发;
     · `toggleXianhouMark` 被连调两次 = 先标记再取消 —— 症状正是
       「宫位短按怎么点都没反应、先后天三宫标记出不来」。
   现状(已核实): tauri.conf.json 的 CSP 是 `script-src 'self' 'unsafe-inline'`,
   且 yinpan.html 已无内联 <script>(不会注入 hash) —— **内联 onclick 本来就能用**。
   要守的规矩只有一条: **别往 yinpan.html 里加内联 <script>/<style>**。
   ============================================================ */
