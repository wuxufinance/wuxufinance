# 戊戌公开页面维护

正式网址：https://wuxufinance.github.io/wuxufinance/

源代码与发布分支：`wuxufinance/wuxufinance` 的 `main` 与 `gh-pages`。公开页面由 `scripts/build-public.mjs` 生成，完整课程继续由原有 Supabase 权限体系提供。

## 更新顺序

1. 核对已发布课程与原有稳定编号。仅将授权公开的标题、简介、目录标题、时长与数量写入 `content/public-catalog.json`。禁止写入正文、题目答案、学习记录或下载文件字节。
2. 更新 `content/course-plans.json` 中真实存在的规划。未发布讲次只显示规划文字，不生成正文链接。
3. 在 `content/public-content.mjs` 编辑公开专题，在 `content/tool-content.mjs` 编辑工具说明。金融假设、单位、模型边界及来源必须与计算一致。
4. 执行 `npm ci`、`npm run build`、`npm test`。用最新、位于仓库外的私有导出执行 `npm run audit:courses -- <path>` 和 `node scripts/check-private-boundary.mjs <path>`。
5. 检查桌面、平板和手机的正文、公式、表格、计算器错误输入、登录入口与旧片段链接，发布 `main` 和对应 `dist` 到 `gh-pages`。
6. 发布后核对真实部署提交、网站地图、代表页面、受限接口和课程版本。不要把部署完成表述为搜索收录或排名完成。

CI会重新构建并检查生成文件是否与源内容一致。保留原有 `gh-pages` 根目录的站点验证文件，不覆盖用户新增的验证配置。

## 地址与日期

课程介绍使用 `/courses/<series>/lesson-<number>/`；公开专题和工具使用各自固定路径。原有当前域名下的 `/#/course/...` 等书签由 `legacy-links.js` 转入 `/learn/#/...`。不要改变已发布路径的含义。

新专题首次发布日固定记录为实际创建日期，不使用“每次构建的今天”刷新全部日期。原课程发布日期未经核实时不补写。只有实质修订文章内容时才添加真实的修订日期，并相应维护该页的 `lastmod`。

## 抓取与验证

网站地图：https://wuxufinance.github.io/wuxufinance/sitemap.xml

项目路径的 `robots.txt` 是参考文件。搜索引擎按域名根目录 `https://wuxufinance.github.io/robots.txt` 读取抓取规则，当前项目仓库不能代替用户主页仓库控制这个根路径。本次检查根路径返回404，未发现阻止公开页面的规则。学习与管理页面独立声明 `noindex`，访问权限继续由服务端验证。

Google关于位置与状态码的说明：https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec

若以后希望在域名根提供robots文件，应先核对对应用户主页仓库或正式自定义域名的控制权，不要为了SEO擅自更改站点域名或开放受限正文。

## Search Console 操作

1. 登录 https://search.google.com/search-console/ ，选择或添加URL前缀属性 `https://wuxufinance.github.io/wuxufinance/`。
2. 使用已有且属于该属性的所有权验证。`gh-pages` 中原有Google验证文件保留；文件存在不等于当前账号已完成验证。
3. 在“站点地图”中提交 `sitemap.xml`，确认其完整地址为上面的正式地图地址。
4. 通过“网址检查”分别检查首页、三个课程系列、一个课程介绍、一个专题和一个工具页；查看“实时测试”与抓取的HTML。
5. 实时可访问、允许索引和已提交地图，不等于已经收录。只根据Search Console实际显示的结果报告索引情况。

旧用户名下的GitHub Pages项目网址不会因仓库更名自动获得站点级重定向；仅凭当前仓库不能配置另一域名的服务器301。本次兼容的是当前正式域名下原有有效的片段书签。
