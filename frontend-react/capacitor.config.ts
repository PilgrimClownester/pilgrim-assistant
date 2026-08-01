import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.firefly.assistant',
  appName: 'Firefly',
  webDir: 'dist',
  server: {
    // Firefly 的数据与模型仍运行在电脑端；蒲公英负责把这个私有地址送到手机。
    url: 'http://172.16.1.164:5174',
    cleartext: true,
    allowNavigation: ['172.16.1.164'],
  },
  android: {
    backgroundColor: '#120f24',
  },
};

export default config;
