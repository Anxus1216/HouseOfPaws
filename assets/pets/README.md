# 萌宠素材

`sprites/` 是当前游戏直接使用的厚线水粉素材。三只宠物各有 8 张 320×320 透明 PNG，共 24 张：`normal`、`happy`、`sleepy`、`need`、`feed`、`wash`、`play`、`rest`。文件名统一为 `pet_<cat|rabbit|dog>_<state>.png`，合计约 2.78 MiB。

素材从 `selected/` 的选定原图生成，奶糖沿用原版，糯米采用 B，团团采用 C。使用 [打包脚本](../../scripts/package-gouache-sprites.ps1)统一为透明正方形画布；在 PowerShell 中运行 `./scripts/package-gouache-sprites.ps1` 可重新生成。运行时按需加载，未加载完成或失败时仍由 Canvas 绘制角色。[原 Canvas 导出脚本](../../scripts/export-pets.mjs)仅生成 `legacy-sprites/` 参考图，不覆盖正式素材。

状态含义：

| 状态 | 用途 |
| --- | --- |
| normal | 待机、图鉴、领养页 |
| happy | 抚摸或照料成功 |
| sleepy | 精力偏低或休息 |
| need | 任一状态过低 |
| feed / wash / play / rest | 四种照料动作短暂反馈 |

`selected/` 的 24 张正式原图与[状态总览](selected/preview.html)随代码入库，可复现运行素材。`concepts/`、`style-explorations/` 和其他备选图是本地设计探索稿。它们只供开发设计参考，已在 `project.config.json` 中排除微信上传包；上传包仅包含 `sprites/` 运行素材。
