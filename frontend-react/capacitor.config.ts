import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.firefly.assistant',
  appName: 'Firefly',
  webDir: 'dist',
  server: {
    // 云端版直接加载同源生产站点；认证由 HttpOnly 安全会话完成。
    url: 'https://154.8.193.111',
    cleartext: false,
    allowNavigation: ['154.8.193.111'],
  },
  android: {
    backgroundColor: '#120f24',
  },
};

export default config;
