# 旅行肥鱼（原大肥鱼显示测试）

2026-11-12 最新范围（优先于下方全部历史记录）：用户要求把本项目重构为 AIUI 桌宠游戏“旅行肥鱼”，属于放置旅行类型，内容原创，不复刻既有游戏。正式页面为 `pages/home/index`，独立 ID 为 `develop.rokid.agent.lvfeiyu-20261112`，权限为 network、microphone、audio、RECORD_AUDIO、CAMERA。设计、经济数值和真机证据见 `docs/LVFEIYU.md`。

## 已确认的 Q 版素材画风（2026-11-12，用户最新选择）

- 后续所有 Q 版角色动作、胸像表情、旅行/明信片姿态、首页 Q 版插画和道具图标，统一参考用户本次上传并明确喜欢的绿色版本：`docs/art-reference/qban-style-approved-20261112.png`。完整约定见 `docs/ART-HANDOFF-QBAN.md`。
- 画风锁定：纯黑背景、鲜亮绿色粗外轮廓、暗绿色填充块面、明显更暗且较细的内部线条；保留柔软圆润的 Q 版比例、长卷发和鲸尾体积感，细节简洁。内部线条亮度以确认图为准，保持这一版的明暗层级。
- 每次绘制同时提供上述已确认图（画风参考）和 `../output/references/dafeiyu-20261112/character-standard.png`（角色身份参考）。本次选择优先于此前的“正常色/白底原画再转换”要求，以及后续更亮内部绿线的未选中变体。
- 角色特征继续锁定：呆毛、鲸鳍耳、她左侧的蝴蝶结、围裙鲸鱼图案、鲸尾。参考图用来继承画风；角度、配饰左右、2048×1024 网格、统一比例和脚底基线仍按清单逐项验收。
- 原样保存确认图；技术适配时保留其亮外轮廓、暗内部线与填充的关系。画风确认已完成，尺寸/精确色值/基线和真机光学观感分别验收。载入页成年全息像仍沿用自身已有约定。

- 本轮 80 格源原画已绘齐，选用版本与 G1 第一格替换以 `../output/references/dafeiyu-20261112/qban-v2/manifest.json` 为准，预览入口为同目录 `素材预览.html`；绘制与检查结果见美术交接第 7 节。0.5.0 已由 `tools-art/qban.py` 原样取亮度接入游戏（`lib/qban-data.js`，不改色），另含 `extensions/photo-discover-8f/` 的 8 帧“看看”发现动画。

## 当前游戏约定

- 游戏内文字全部使用中文。
- 互动中的角色样貌必须来自用户确认的绿色 Q 版原画（qban-v2）。载入页的成年托腮全息像只用于载入动画。
- 精灵由 `tools-art/qban.py`（Q 版，`lib/qban-data.js`）和 `tools-art/convert.py`（全息像，`lib/sprite-data.js`）生成，不要手改。新增帧要加进 `lib/sprites.js` 的 `REQUIRED` 或 `LATER`。
- “看看”识图：相机实现移植自一眼顶真（`lib/camera.js`），只用无参数 `takePhoto()`，在按键回调里同步发起；视觉模型每次新建会话、用完销毁。
- 旅行通话（0.6.0）：她在外地时主页“呼唤”变“通话”，画面走 close 屏但 `v.close.call` 非空，底栏 `DOCK_CALL`（说话/看看/挂断），每次旅行 `CALLS_PER_TRIP` 次。全息波动参数在 `lib/draw.js` 的 `HOLO`，横带由 `lib/sprites.js` 预切（`STRIP_BANDS`），不要改回逐带 clip 重画（真机太慢）。
- 共享代码 `lib/app.js`、`game.js`、`content.js`、`scenes.js`、`title.js`、`draw.js`、`postcards.js`、`sprites.js`、`camera.js` 不依赖 DOM 或 localStorage，宿主能力（存储、聆听、模型、朗读）通过 `createApp(host)` 注入。新增 lib 文件要同时加进 `scripts/aix.mjs` 的 LIB 列表。
- 0.4.0 新增游戏首页与互动教程，TTS 用 `host.speech`。开始聆听前必须停播；主页自言自语不出声；不做常驻聆听（用户已明确不要）。系统唤醒词无法修改。
- 只使用真机已画出的 Canvas 方法；`npm run check` 会扫描禁用调用，并运行 `tests/lvfeiyu.test.mjs`。
- 本目录是 Git 仓库，远端为 GitHub `tiranasi/FeiyuTravel`。修改后运行 `npm run check`，然后提交并推送。`npm run install -- --params '{"debug":"fast"}'` 安装并以 120 倍时间启动；加 `"reset":"1"` 清档。
- 设备结论按“截图已渲染 / 日志已执行 / 佩戴者反馈”分别记录。
- 旧页面 `pages/canvas`、`pages/index` 以及 `web/` 下的旧原型和存档保留不删，但不再打包。

---

# 大肥鱼眼镜显示测试

2026-11-12 素材与动画更新（优先于下方纯路径实验）：用户认为纯Canvas人物不像参考图，明确改为Canvas播放预缓存图片，并要求使用绘图工具。已确认带鲸尾的绿色线稿造型，随后要求8帧与简化内部细线。当前本机hologram.html使用line-tail-simple-v3与idle-v3-8图集，自然眨眼、微呼吸、鲸尾轻摆；绘图提示词和处理来源见web/assets/art/hologram/manifest.json。不得将8帧说成8张独立绘制的全身动作，实际为绘图关键帧＋局部眼睛合成＋轻微形变。旧纯路径lib/hologram-art.js仅保留对照。HTML仍本机专用，不自动迁移或安装眼镜。

2026-11-12 加载动画实验：用户明确指定本次上传的托腮图片作为造型参考，要求人物、场景与特效全部由Canvas绘制，不加载PNG，先在本机HTML预览。该授权优先于下文素材只参考三视图的旧默认。实现位于lib/hologram-art.js、web/hologram-*，入口web/hologram.html；不得把纯路径重绘说成原图逐像素还原，不把演出时间轴说成真实加载进度。仅本机预览，独立于现有游戏存档和AIUI显示包。

2026-11-12 最新范围：默认本机入口简化为「当次对话＋主动看一眼＋四个成就」，代码 lib/pocket.js、web/pocket-*；只有成就ID持久化，不保存聊天、人物偏好或长期记忆。隐藏或结束会话时清空上下文。旧完整游戏入口 web/full-prototype.html 只保留回溯，旧存档不得删除或迁移成用户画像。用户已明确授权独立AIUI诊断、合理范围的自主设备调试和重启，probe/ 是独立agentId，不替换现有显示包。新增功能默认仍先在本机验证；此授权覆盖本轮实机诊断。

本项目包含独立 AIUI 真机显示实验与大肥鱼本机 HTML 游戏，不修改其他应用。已授权在本机先迭代完整内容和交互，之后再迁移至 AIUI；当前本机视觉采用明确标注的模拟输入，旅行是虚拟游戏，不声称已调用真实相机、定位或模型。

素材只参考角色三视图；动作由本次重新设计生成，不使用已有动作组。所有运行资源位于 assets、pages 和 lib。构建产物位于 build、dist，不提交设备日志或凭据。

修改后运行 npm run check；打包与设备运行分别报告。按键、计时器清理、图片透明度必须有可核对证据。设备的光学观感由佩戴者反馈，截图只证明渲染像素。

本机版入口 web/，共享状态、交互、渲染位于 lib/pet-*.js，浏览器能力只放在 web/browser-adapter.js 或本机外壳。共享代码不依赖 DOM、localStorage、浏览器图片对象或浏览器独有 Canvas 方法。运行 npm run test:web 验证持久化、离线结算、请求取消和兼容边界。HTML 开发版只在本机启动，不发布、不自动安装眼镜。web/ 和测试不会打入 AIX。

玩法版共享核心位于 lib/game-state.js、game-engine.js、game-render.js 与 pet-content.js；pet-* 保留为兼容导出。web/game-app.js、game-adapter.js、storage.js 属浏览器外壳。存档v2使用IndexedDB，必须保留v1升级兼容和原始记录，禁止用旧窗口覆盖新快照。美术生成来源与提示词保存在 web/assets/art/manifest.json。
