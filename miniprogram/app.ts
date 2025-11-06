// app.ts
import { initSubscribeScheduler } from './utils/subscribeScheduler'
import { userLogin } from './utils/userService'

App<IAppOption>({
  globalData: {},
  onLaunch() {
    // 展示本地存储能力
    const logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 初始化云开发
    if (typeof wx.cloud !== 'undefined') {
      wx.cloud.init({
        env: 'cloud1-7guu33lf3f41e1a5',
        traceUser: true,
      })
    }

    // 登录并保存用户信息（只在用户明确登录时，不自动登录）
    // 注意：这里不自动调用 userLogin，因为用户可能已经退出登录
    // 用户需要主动点击"微信一键登录"才会真正登录
    wx.login({
      success: async (res) => {
        console.log('获取登录code:', res.code)
        // 不自动登录，避免退出登录后重新登录
        // 如果需要自动登录，会在用户明确授权后进行
      },
      fail: (err) => {
        console.error('wx.login失败:', err)
      }
    })

    // 初始化订阅消息调度器
    initSubscribeScheduler()
  },
  onShow() {
    // 每次小程序显示时检查是否需要发送提醒
    const { checkAndSendReturnReminders } = require('./utils/subscribeScheduler')
    checkAndSendReturnReminders()
  },
})