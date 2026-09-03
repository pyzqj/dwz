# ⚡ EdgeLink (极连) - 智能短网址与微信群活码边缘系统

<div align="center">

![EdgeLink Banner](https://img.shields.io/badge/Architecture-EdgeOne%20Cloud%20Native-blue?style=for-the-badge&logo=cloud)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)
![Status](https://img.shields.io/badge/Deployment-100%25%20Free%20Tier%20Ready-brightgreen?style=for-the-badge)
![API](https://img.shields.io/badge/Open%20API-GET%20%7C%20POST-orange?style=for-the-badge)

**专为私域流量与裂变营销打造的高性能、轻量化无服务器边缘调度系统。**  
支持 **短网址智能分流** 与 **高可用微信群活码轮换** 两大核心业务场景。

[在线体验 (自定义域名)](https://d.pyz.me) &bull; [管理控制台演示](https://d.pyz.me/console/) &bull; [GitHub 开源仓库](https://github.com/pyzqj/dwz)

</div>

---

> [!TIP]
> **🎉 100% 免费部署支持**：本项目完全适配 **腾讯云 EdgeOne Pages (Makers)**，可使用 EdgeOne 提供的**永久免费版套餐（Free Tier）**零元部署上线！包含免费边缘计算配额、免费分布式 KV 数据库、免费 Blob 对象存储及全球 CDN 加速与免费 SSL 证书，无需购买任何云服务器或域名证书。

---

## 🌟 核心功能特性

### 1. 🔗 智能短网址（dwz）
- **⚡ 一键极速生成**：在控制台直接粘贴长链接，系统自动解析域名特征生成短链，并**秒级自动复制短网址到剪贴板**，一气呵成；
- **多场景分流模式（高级选项）**：
  1. **通用直接跳转**：全平台极速 302 重定向，毫秒级响应；
  2. **仅限微信内访问**：防恶意刷量与非目标群体爬取，非微信扫码展示友好提示；
  3. **仅限 iOS / Android 访问**：按移动操作系统定向分流下载；
  4. **仅限手机浏览器访问**：微信内打开时自动呼出右上角「在浏览器打开」引导遮罩，有效避免网页在微信内置环境中被拦截屏蔽；
  5. **多设备智能分流**：单个短链接根据访客设备分流至不同目标地址（Android / iOS / Windows）；
- **访问统计与管控**：实时统计全站累计 PV 与今日独立访问量，支持短链一键启停开关、计数清零、二维码展示与**高清 PNG 二维码图片一键下载**；
- **⚡ 开放 API 支持**：
  - 支持 `format=text` 纯文本极速直出模式，可秒级无缝接入 **iOS 快捷指令 (Shortcuts)**、**Alfred**、**Raycast**、命令行终端或企业内部系统；
  - 完善的 API Key 安全鉴权，支持在控制台一键复制与重置 Key。

---

### 2. 👥 高可用微信群活码（qun）
- **一站式极速创建**：表单支持拖拽或批量选择多张微信群二维码，直观配置各群的进群阈值（如满 200 人自动平滑切换到下一群）与群主备用微信；
- **子码池动态轮换**：支持添加无限个微信群子码，进客数满设定阈值后自动切换下一顺位群码，群码失效前自动预警；
- **🔄 7 天防重复进群去重（Edge Cookie）**：老用户在 7 天内重复扫码时，固定展示首次扫码进入的群二维码，杜绝同一用户重复占位加群；
- **🛡️ 微信官方安全认证绿标**：落地页顶部呈现微信安全认证条，显著消除访客疑虑，大幅提高微信内进群转化率；
- **👤 客服微信个人二维码兜底**：当所有微信群子码全部满员时，系统自动无缝切换至客服微信二维码与提示语，杜绝推广流量损耗；
- **📱 高清二维码下载与真机模拟器**：支持一键导出高清活码 PNG 图片至手机或电脑相册，后台内置 iPhone 真机模拟器，无需扫码即可直接预览真实微信环境下的进群效果。

---

### 3. 🖼️ 素材库（零配置自动托管）
- 调用官方 Blob SDK，系统首次上传图片时由 SDK 自动创建 Store，无需在控制台繁琐配置存储桶；
- 跨 Store 自动寻址与全盘图片发现，无论通过后台上传还是控制台直接上传的素材，均可在素材库统一管理并一键复制 CDN 直链。

---

## 🚀 腾讯云 EdgeOne 免费部署教程

### 第一步：Fork 或克隆仓库
将本仓库代码 Fork 到您自己的 GitHub 账号下：
```bash
git clone https://github.com/pyzqj/dwz.git
```

### 第二步：在 EdgeOne Pages 创建项目
1. 访问并登录 [腾讯云 EdgeOne 控制台](https://edgeone.ai/)（或腾讯云中国站 EdgeOne）；
2. 点击左侧菜单 **Pages > 新建项目**；
3. 授权连接您的 GitHub 账号，选择刚刚 Fork 的 `dwz` 仓库；
4. 构建设置保持默认即可（本项目为云原生架构，框架预设选择“无 / None”，输出目录留空）。

### 第三步：绑定 KV 键值数据库（免费）
1. 在 EdgeOne 控制台左侧进入 **存储 > KV 存储**，点击「新建命名空间」，起名为 `dwz_kv`；
2. 返回您的 Pages 项目，进入 **项目设置 > 存储绑定**；
3. 点击「添加绑定」，选择刚才创建的 `dwz_kv`，**变量名称务必填写 `DWZ_KV`** 并保存。

### 第四步：存储桶说明（完全零配置）
- **无需手动创建存储桶**：系统在首次上传群二维码或素材时，将通过 SDK 自动初始化 Store，全程全自动化零运维。

### 第五步：绑定自定义域名（推荐）
1. 在 Pages 项目的 **自定义域名** 页面，绑定您自己的域名（例如 `d.pyz.me`）；
2. 按照页面提示添加 CNAME 解析；
3. 解析生效后，即可通过全球边缘网络直连访问，零拦截、低延迟！

---

## 🔑 管理后台初始登录

- **管理后台地址**：`https://你的域名/console/`
- **默认管理员账号**：`admin`
- **默认管理员密码**：`admin123`

> 登录后，强烈建议在后台左侧 **⚙️ 系统设置** 中修改为高强度的管理员新密码。

---

## ⚡ 短网址开放 API 使用指南

### 1. 极速 GET 请求（返回纯文本，推荐用于快捷指令/Alfred）
```bash
curl "https://你的域名/api/dwz/create?api_key=YOUR_API_KEY&url=https://example.com/item/123&format=text"
```
**输出结果**：
```text
https://你的域名/yg1pfj
```

### 2. 标准 POST 请求（JSON 格式响应）
```bash
curl -X POST "https://你的域名/api/dwz/create" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"url": "https://example.com/item/123"}'
```
**输出结果**：
```json
{
  "code": 200,
  "msg": "创建短网址成功",
  "data": {
    "key": "yg1pfj",
    "url": "https://example.com/item/123",
    "shortUrl": "https://你的域名/yg1pfj"
  }
}
```

### 3. Python 接入示例
```python
import requests

API_KEY = "你的_API_KEY"
DOMAIN = "https://你的域名"

response = requests.post(
    f"{DOMAIN}/api/dwz/create",
    headers={"X-API-Key": API_KEY},
    json={"url": "https://example.com/my-article"}
)
print("生成的短网址:", response.json()["data"]["shortUrl"])
```

---

## 📁 目录结构说明

```text
├── functions/                   # 边缘函数目录 (V8 极速无服务器引擎)
│   ├── api/                     # 核心业务 REST API (/api/*)
│   ├── s/                       # 短网址毫秒级重定向 (/s/:key)
│   ├── qun/                     # 群活码轮换落地页 (/qun/:qid)
│   └── utils/                   # KV & Blob 统一存储适配器与鉴权核心
├── console/                     # 现代化响应式管理控制台 SPA
│   ├── index.html               # 控制台单页结构
│   ├── style.css                # 深度适配移动端的现代化样式系统
│   └── app.js                   # 控制台业务流转与多端交互控制器
├── index.html                   # 极速轻量官网首页 (自带 GitHub 仓库直链)
├── static/                      # 基础静态资源
├── package.json                 # 项目依赖 (@edgeone/pages-blob)
└── README.md                    # 项目说明文档
```

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源协议，欢迎自由修改、二次开发与商用。如果对您有所帮助，欢迎在 GitHub 上点一个 ⭐️ Star 支持！
