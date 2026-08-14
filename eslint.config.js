// ESLint 静态检查配置(flat config)
// 核心目标: no-undef 根治 strict IIFE 下未声明赋值/引用的运行时错误
// 用法: npx eslint qimen_app/js/*.js
const globals = require('globals');

module.exports = [
  {
    files: ['qimen_app/js/*.js'],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        // 项目跨文件全局(各 IIFE 挂到 window 的导出, 下游文件直接引用)
        // 注: QM 不在全局表——chuanren/yinpan_app 各自显式 var QM=window.QM||{} 挂接
        XING: 'readonly',
        MEN: 'readonly',
        SHEN: 'readonly',
        SHEN_ABBR: 'readonly',
        XING_ABBR: 'readonly',
        MEN_ABBR: 'readonly',
        GAN_LIST: 'readonly',
        ZHI_LIST: 'readonly',
        GAN10: 'readonly',
        ZHI12: 'readonly',
        SHENJIANG_NAMES: 'readonly',
        SHENJUE: 'readonly',
        ZXJ_NAMES: 'readonly',
        GONG_FULL: 'readonly',
        tyme4j: 'readonly',
        tyme: 'readonly',
        Capacitor: 'readonly',
        // 调试/运行时代码
        __TAURI__: 'readonly'
      }
    },
    rules: {
      // 未声明变量 = 历史 3 次运行时雷(h/agColor/ag)的根因, 必须报错
      'no-undef': 'error',
      // 重复声明(同作用域二次 let)也是 strict 雷源
      'no-redeclare': 'error',
      // 未使用变量仅警告(历史代码较多, 逐步清理)
      'no-unused-vars': 'warn',
      // 基础防御
      'no-extra-semi': 'error',
      'no-dupe-keys': 'error',
      'no-unreachable': 'error'
    }
  },
  {
    ignores: [
      'node_modules/**',
      'qimen_app/js/qimen_bundle.min.js',
      'qimen_app/js/tyme4j-browser.js',
      'qimen_app/js/gong_detail_data.js',
      'web/**',
      'www/**',
      'android/**',
      'src-tauri/target/**'
    ]
  }
];
