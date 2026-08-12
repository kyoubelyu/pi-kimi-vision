# pi-kimi-vision

Pi 扩展:提供 `kimi_visual_check` 工具,用 kimi CLI 对图片(截图/渲染图/图纸)做独立视觉分析,作为主模型直接看图之外的交叉验证通道。

典型场景:agent-browser 截图后的 FE 视觉检查。

## 安装

```bash
# 固定 tag/commit 推荐(如 @v0.1.0)
pi install git:github.com/kyoubelyu/pi-kimi-vision@v0.1.0

# 或直接用默认分支(不推荐,更新不可控)
pi install git:github.com/kyoubelyu/pi-kimi-vision
```

也可临时试用(不写入 settings,仅当前运行):

```bash
pi -e git:github.com/kyoubelyu/pi-kimi-vision
```

## 前置依赖

目标机器需要已登录的 kimi-code CLI(约 `~/.kimi-code/bin/kimi`,OAuth 订阅):

```bash
# 安装 kimi CLI(如果还没有)
curl -fsSL https://kimi.com/code/install.sh | sh   # 具体安装方式以 kimi 官方文档为准
kimi  # 首次运行完成登录
```

可选:设置 `KIMI_CLI_PATH` 环境变量覆盖 kimi 可执行文件路径。

## 使用

扩展加载后,pi 会自动注册工具 `kimi_visual_check`(无需配置),模型会在需要时调用它,参数:

| 参数 | 必填 | 说明 |
|------|------|------|
| `imagePath` | 是 | 要分析图片的绝对路径 |
| `question` | 否 | 要问的问题;默认要求详细描述图片 |
| `additionalImagePaths` | 否 | 对照图片路径数组(如改动前后对比) |
| `model` | 否 | kimi 模型,默认 `kimi-code/kimi-for-coding`;可用 `kimi-code/k3` |

## 卸载

```bash
pi remove git:github.com/kyoubelyu/pi-kimi-vision
```

## 开发

```bash
git clone git@github.com:kyoubelyu/pi-kimi-vision.git
# 本地验证
pi -e ./pi-kimi-vision
```

修改后打 tag 发布新版本:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

## 说明

- 扩展运行时通过 `spawn` 调用 kimi CLI,使用 `--output-format stream-json` 解析回答。
- 本包只依赖 pi 自带的核心包(`@earendil-works/pi-coding-agent`、`typebox`,声明在 `peerDependencies`),无第三方运行时依赖。
