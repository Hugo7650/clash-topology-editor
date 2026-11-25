# Clash Topology Editor

基于 Vue 3 + TypeScript + AntV X6 3.x 的 Clash / Mihomo 代理配置可视化编辑器原型。

## 功能

- 将 `proxies`、`proxy-groups`、`proxy-providers` 解析为拓扑节点。
- Proxy、Proxy Group、Proxy Provider 三种核心节点。
- Proxy → Group、Group → Group、Provider → Group、Proxy → Proxy（dialer-proxy）、Proxy → Provider（Provider 下载代理）关系建模。
- Group 任意层级嵌套；新建连线时验证引用类型、重复关系和循环引用。
- 节点拖动、端口连线、属性编辑、成员顺序调整。
- `select`、`url-test`、`fallback`、`load-balance`、`relay` 策略类型基础表单。
- 常见代理协议表单：SS、VMess、VLESS、Trojan、Hysteria2、TUIC、SOCKS5、HTTP、WireGuard 等。
- Provider 的 HTTP / File / Inline 基础属性编辑。
- 高级 JSON 属性编辑，保留未识别字段。
- YAML 粘贴/文件导入、源码模式、全部片段导出。
- 选中策略组后递归导出该组及其代理、子策略组和 Provider 依赖。
- 配置重复名称、悬空引用、空策略组和部分测速参数检查。

## 启动

需要 Node.js 20+（推荐 Node.js 22）。

```bash
pnpm install
pnpm run dev
```

打开终端显示的本地地址，默认 `http://localhost:5173`。

生产构建：

```bash
pnpm run build
pnpm run preview
```

## pnpm 安装说明

- `@antv/x6` 3.x 的入口不需要导入 `@antv/x6/dist/index.css`；本项目使用 X6 的 SVG attrs 和自己的 `src/style.css` 设置画布样式。
- 为兼容 pnpm 的严格依赖隔离，项目显式声明 `tslib`，供 X6 ESM 文件引用。
- pnpm 10 如果提示 `Ignored build scripts: esbuild`，这是依赖脚本审批提示，不是上述 CSS / `tslib` 解析错误的原因。只有后续确实出现 esbuild binary / install script 相关错误时，再运行 `pnpm approve-builds` 并批准 `esbuild`。

## 关系方向约定

画布采用“被引用对象 → 使用它的策略组”的方向：

- Proxy → Proxy Group：写入目标组的 `proxies`。
- Proxy Group → Proxy Group：表示嵌套组，写入目标组的 `proxies`。
- Proxy Provider → Proxy Group：写入目标组的 `use`。
- Proxy → Proxy：写入目标代理的 `dialer-proxy`。
- Proxy → Proxy Provider：写入 Provider 的 `proxy`（下载订阅时使用的代理）。

因此 Group→Group 嵌套通过实际配置引用表达，不依赖 X6 的视觉父子节点关系。X6 的节点位置只存于内存模型，不进入 YAML。

## 数据模型约定

- `ConfigEntity.raw` 保存完整配置属性，Schema 表单只编辑常用字段。
- `ConfigRelation` 是关系的唯一事实来源，导出时根据关系重建 `proxies` 和 `use`。
- 每条关系保留 `order`，成员上下移动会同步 YAML 数组顺序。
- `id` 是编辑器内部 ID，引用和序列化始终使用当前实体名称。
- DIRECT、REJECT 等内置目标显示为内置节点，不输出到 `proxies` 定义。
- 未解析引用显示为红色虚线节点，验证器会报告错误；可以在属性面板中将其解析为 Proxy、Group 或 Provider。

## 当前原型的边界

1. 本原型处理三个核心配置片段，不负责完整 Clash 配置的其他顶层部分（如 rules、dns、tun、listeners）。
2. 已知字段用表单编辑；高级/未知字段在 JSON 编辑器中处理。复杂嵌套结构建议使用源码模式。
3. YAML 解析后会保留未知数据字段，但注释、锚点、别名和原始格式不保证逐字节保留。
4. 未实现订阅 URL 拉取、内核测速、真实节点展开、内核版本自动探测和在线运行时校验。
5. 目前画布使用平铺节点 + 引用边；视觉容器折叠/嵌入尚未实现。这样可以避免把 X6 的 parent-child 结构误认为 Clash 的配置引用关系。
6. 不同 Mihomo / Clash 分支和版本的字段支持存在差异；正式使用前应增加目标内核版本 Schema 和 CI 验证。
7. 示例配置中的服务器地址和凭据均为占位内容，不能直接用于连接。

## 目录

```text
src/
  App.vue              页面、X6 画布、属性表单和导入导出交互
  main.ts              Vue 入口
  style.css            页面样式
  core/model.ts        配置领域模型、关系解析、校验和 YAML 序列化
```

## 后续建议

- 用 Mihomo 官方配置 Schema / 版本矩阵补齐每个协议与策略组字段。
- 为原始 YAML AST 增加注释、锚点和 alias 的 round-trip 保留策略。
- 增加撤销/重做 Command Service，统一记录模型变更与画布位置变更。
- 增加 DAG 自动布局、组折叠/展开、容器视图和大规模画布虚拟渲染。
- 增加单元测试：导入→导出语义一致、循环引用、重命名引用更新、依赖闭包导出。

## GitHub Pages 自动部署

仓库已配置 GitHub Actions 工作流：`.github/workflows/deploy.yml`。

- 推送到 `main` 分支后自动安装依赖、执行 `pnpm run build` 并发布 `dist/`。
- 可以在 GitHub 仓库的 **Actions → Deploy to GitHub Pages → Run workflow** 手动触发。
- Vite 的 `base` 已设置为 `/clash-topology-editor/`，适配项目站点路径。

首次启用时，请在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。完成首次成功部署后，站点地址为：

https://hugo7650.github.io/clash-topology-editor/

如需本地验证生产包：

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run preview
```
