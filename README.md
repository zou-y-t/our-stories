# Our Stories

一张默认显示中国的互动旅行地图。搜索国家可自动聚焦；中国地图可从省份进入地级市，四个直辖市直接进入区县。点击地区从右侧打开故事抽屉，浏览过程中网址保持在 `/our-stories/`。

## 添加一段回忆

故事素材按下面的结构放在项目 `public` 目录中：

```text
public/
└── china/
    └── 四川省/
        └── 成都市/
            └── 2026-10-01/
                ├── doc.md
                └── imgs/
                    ├── 01.jpg
                    └── 02.jpg
```

中国的省份、市、区县目录已经一次性创建。新增行政区时可运行 `npm run places:init` 补建目录。日期目录使用实际出行日期 `YYYY-MM-DD`，可以只放 `doc.md`、只放 `imgs/` 照片，或者两者都放。Markdown 文件第一行可用 `title: 标题`，正文支持 Markdown。保存后运行 `npm run dev` 预览；发布前运行 `npm run build`，故事清单会自动生成。

直辖市的层级为 `public/china/北京市/朝阳区/日期/`，第二层是区县。

## 本地运行

```sh
npm install
npm run dev
```

## GitHub Pages

仓库名使用 `our-stories`，Pages 构建已配置在 GitHub Actions。推送到 `main` 后会构建并发布到 `https://zou-y-t.github.io/our-stories/`。在仓库设置的 Pages 页面选择 **GitHub Actions** 作为发布源。

## 地图数据

中国省份与地级市边界来自 `cn-atlas`（2023 版，ISC）；直辖市区县边界使用较早版本的 `china-map-geojson` 数据。港澳台在当前数据源中只有整区轮廓，暂以单个地区呈现。世界国界使用 `world-atlas` / Natural Earth 数据。主要湖泊目前使用示意轮廓，只用于地图配色展示，不作为精确地理边界。运行开发或构建命令时会生成分省地图文件，数据随构建产物一起发布，浏览地图不需要在线地图服务。
