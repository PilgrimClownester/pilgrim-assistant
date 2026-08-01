# Firefly Android 云端版

## 安装

手机访问以下地址下载安装：

```text
https://154.8.193.111/downloads/Firefly-Android-cloud-v1.1.apk
```

版本为 `1.1-cloud`。它直接连接 Firefly 云服务器，不再依赖电脑、局域网或贝锐蒲公英。

如果旧测试版签名一致，可直接覆盖安装；Android 提示签名不一致时，先卸载旧版再安装。卸载只会清除手机端会话，云端数据不会删除。

## 登录与更新

- 用户名默认为 `firefly`，密码与云端网页登录一致。
- 登录成功后服务器写入 Secure、HttpOnly 会话 Cookie，APK 内没有硬编码密码。
- 会话默认保持 30 天，可在 App 右下角主动退出。
- App 载入云端生产页面，绝大多数 UI 和功能更新不需要重新安装 APK。
- 网络断开或服务器不可达时会显示重新连接页面，不会误删云端数据。

## 安全说明

- App 只允许访问 `https://154.8.193.111`，Android 明文 HTTP 已关闭。
- IP 使用 Let's Encrypt 可信证书；服务器定时续期。
- 当前 APK 是调试签名的自用版本。若未来上架应用商店，需要改用长期保存的 release keystore 并提高 versionCode。
