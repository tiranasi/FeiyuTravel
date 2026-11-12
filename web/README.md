# 霓潮居 · 本机 HTML 游戏

2026-11-12 全息动画预览：<http://127.0.0.1:4173/web/hologram.html>。用户确认带鲸尾的线稿后要求8帧，并进一步要求简化内部线条。当前采用绘图工具生成的简化角色与半闭眼、闭眼关键帧，局部合成眼睛并添加轻微呼吸和鲸尾形变；8帧保存在 `assets/art/hologram/idle-v3-00.png` 至 `idle-v3-07.png`。完整来源与提示词见该目录的 `manifest.json`。

默认展示约3秒的8帧待机循环，也可切换4.2秒的扫描开场演出（示意时间轴，未连接真实加载进度）。运行时只请求并解码一次 `idle-v3-8.png`，复制为Canvas缓存后裁剪播放，不切换图片地址；图集为2048×1024、8个512×512单元，缓存RGBA体积8MiB，仅为理论图集字节数，非整机内存实测。逻辑视口480×320，电脑主画布2倍后台分辨率，未迁移眼镜。可暂停、重播、逐帧查看、拖动时间轴、循环和调整辉光。减少动态效果偏好默认静止；隐藏页面暂停。

渲染核心 `../lib/hologram-image.js` 不依赖DOM，浏览器外壳 `hologram-app.js`。旧纯路径实验 `../lib/hologram-art.js` 保留对照。运行 `npm run test:hologram` 验证8帧、缓存复用、播放、开场和窄屏。`node scripts/prepare-hologram-frames.mjs` 重建8帧图集；`node scripts/export-hologram-gif.mjs` 导出审阅GIF到 `../build/hologram-evidence/`。GIF仅供审阅，HTML不播放GIF。原游戏入口、存档和AIUI包保持独立。

**当前默认是精简版「霓潮」**，规则见 [POCKET.md](POCKET.md)。打开 http://127.0.0.1:4173/，保留聊天、主动观察和四个对话成就；聊天和物体输入均为本机演示，只有成就ID进入新的独立存档。旧存档完全保留。`npm run test:browser` 验证精简版，`npm run test:archive` 验证旧版。以下完整玩法说明属于历史原型，入口已改为 `/web/full-prototype.html`。

运行 `npm run dev`，打开 http://127.0.0.1:4173/ 。当前为“旅行青蛙＋桌宠”的可玩本机版本，先不迁移到眼镜。

- 家园照料、心情与能量、饭团补给、潮汐币和六个相伴心愿。
- 五种物体共感、重复相见记忆、首次灵感奖励及路线解锁。
- 三条远游路线、可选随身灵感、离线归来与一次性拆包。
- 三幅原创旅行明信片、三种纪念品及家园摆放。
- 全量长期回忆、个人偏好、搜索分类、置顶和可引用的回忆反馈。
- IndexedDB存档、v1升级、备份、导入导出、双窗口防覆盖。
- 原创赛博家园、青绿/紫色界面、缓存Canvas和高清本机渲染。

详细规则、资源与验收见 [GAMEPLAY.md](GAMEPLAY.md)，迁移边界见 [AIUI-MIGRATION.md](AIUI-MIGRATION.md)。

## 验证

`npm run test:web`：31项核心检查。

启动本机服务后运行 `npm run test:browser`：22项真实浏览器检查，使用隔离的Edge测试配置，不读写用户浏览器存档。覆盖完整三条路线、六个心愿、1200条回忆、v1迁移、双窗口冲突与窄屏布局。截图和报告位于 `build/game-evidence/`。

`npm run check`：检查现有AIUI页面。本轮没有重新安装或迁移眼镜。

## 文件

- `index.html`、`game.css`、`game-app.js`：本机游戏界面。
- `game-adapter.js`：本机Canvas缓存、场景资源及模拟视觉。
- `storage.js`：IndexedDB、v1回退和原子存档保护。
- `../lib/game-*.js`、`pet-content.js`：不依赖浏览器的共享玩法与绘制逻辑。
- `assets/art/`：四张原创插画、优化版本与完整提示词清单。
- `assets/icons.svg`：本项目原创界面图标。

浏览器存档按主机名、端口和浏览器配置隔离。物体输入为明确标注的模拟，当前不调用相机、定位或任何模型；真实识别以后只接眼镜自带模型。清理浏览器数据会删除本机存档，可从实验室导出备份。
