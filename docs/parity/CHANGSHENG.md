# 十二长生（长生状态）功能测试

> 日期：2026-10-28 · 脚本：`scripts/parity/test-changsheng.js`
> 基准：第三方 `第三方排盘脚本` 的 `state()` 表与输出

## 1. 测试方法

| 层级 | 内容 | 数量 |
|---|---|---|
| **表级** | 9 干（第三方无「甲」行）× 8 宫的状态值；归一化字序与简称后比对 | 72 |
| **盘级** | 8 个时间点 × 8 宫 ×（天盘干/地盘干），本项目取值逻辑 vs 第三方 `state()` 实际写入的 `#stateTianN/#stateDiN` 文本 | 128 |

归一化规则：
- 字序：`养胎 = 胎养`、`冠沐 = 沐冠`、`衰旺 = 旺衰`、`墓死 = 死墓`
- 简称：`临 = 临官`、`沐 = 沐浴`、`生 = 长生`、`旺 = 帝旺`、`冠 = 冠带`
- 本项目按 `CS_IDX`（宫号→数组位）取值，第三方按宫号直接索引

## 2. 发现的缺陷（已修复）

首次测试：表级 72 项中 **6 项真实错误**（归一化后仍不同），全部是**本项目错、第三方对**，逐项按十二长生规则验算确认：

| 干 | 宫（地支） | 修复前 | 修复后 | 验算依据 |
|---|---|---|---|---|
| 乙 | 6（戌亥） | 墓养 | **死墓** | 乙木死在亥、墓在戌 |
| 丙 | 8（丑寅） | 长生 | **养生** | 丙火养在丑、长生在寅 |
| 戊 | 8（丑寅） | 长生 | **养生** | 同丙 |
| 庚 | 4（辰巳） | 长生 | **养生** | 庚金养在辰、长生在巳 |
| 癸 | 7（酉） | 死 | **病** | 癸水病在酉 |
| 癸 | 8（丑寅） | 冠临 | **沐冠** | 癸水冠带在丑、沐浴在寅 |

性质：不是实现差异，是**表数据错误**——每个宫有两个地支，原表在部分宫位漏写/写错了第二个状态。

修复位置（两份表必须同步）：
- `qimen_app/js/qimen_constants.js` 的 `C.CHANGSHENG`
- `qimen_app/js/yinpan_app.js` 的 `CHANGSHENG`

## 3. 修复后结果

```
表级 72 项，逐字差异 0（不再需要归一化）
盘级 128 项，差异 0
```

第 2 轮的 6 处修复只对齐了语义；随后按要求**完全对标第三方**，把显示文字也逐字改为第三方写法
（`养胎→胎养`、`临官→临`、`长生→生`、`帝旺→旺`、`沐浴→沐`、`冠沐→沐冠`、`衰旺→旺衰`、`墓死→死墓`）。
现在两表 72 项**逐字相同**，比较层无需任何归一化。

`甲` 行第三方没有（奇门盘面只用六仪三奇，甲不出现），保留原值作字典占位，不影响输出。

两份表交叉校验：0 差异。全盘型回归（时盘/刻盘/山向/穿壬/命理）不受影响，仍为各自原水平。

## 4. 复现

```bash
# 第三方实现路径一律由环境变量提供（源码不硬编码任何来源）
export QIMEN_THIRD_YINPAN_JS=/path/to/third-party/yinpan.js       # 时盘/刻盘
export QIMEN_THIRD_SHANXIANG_JS=/path/to/third-party/shanxiang.js # 山向
export QIMEN_THIRD_LIUREN_JS=/path/to/third-party/sixren.js           # 六壬
export QIMEN_THIRD_CHUANREN_JS=/path/to/third-party/chuanren.js   # 穿壬
export QIMEN_THIRD_MINGLI_JS=/path/to/third-party/mingli.js       # 命理
export QIMEN_THIRD_CLI_BIN=/path/to/third-party/bin               # 定局 CLI

node scripts/parity/test-changsheng.js            # 表级 + 盘级
node scripts/parity/test-changsheng.js --verbose  # 逐项输出
```

改动 `qimen_constants.js` / `yinpan_app.js` 后必须 `npm run build:bundle` 重建入库产物。
