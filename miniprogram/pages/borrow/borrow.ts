// borrow.ts
import { isUserLoggedIn } from '../../utils/userService';

Page({
    data: {},
    onLoad() { },
    // 借阅按钮点击事件
    handleBorrow() {
        console.log('点击借阅按钮');

        // 检查登录状态
        if (!isUserLoggedIn()) {
            wx.showModal({
                title: '提示',
                content: '请先登录后再进行借阅操作',
                showCancel: true,
                confirmText: '去登录',
                cancelText: '取消',
                success: (res) => {
                    if (res.confirm) {
                        // 跳转到个人中心页面进行登录
                        wx.switchTab({
                            url: '/pages/mine/mine',
                        });
                    }
                },
            });
            return;
        }

        wx.navigateTo({
            url: '/pages/borrowForm/borrowForm',
            success: () => {
                console.log('跳转成功');
            },
            fail: (err) => {
                console.error('跳转失败:', err);
                wx.showToast({
                    title: '跳转失败',
                    icon: 'none'
                });
            }
        });
    },
    // 归还按钮点击事件
    handleReturn() {
        console.log('点击归还按钮');

        // 检查登录状态
        if (!isUserLoggedIn()) {
            wx.showModal({
                title: '提示',
                content: '请先登录后再进行归还操作',
                showCancel: true,
                confirmText: '去登录',
                cancelText: '取消',
                success: (res) => {
                    if (res.confirm) {
                        // 跳转到个人中心页面进行登录
                        wx.switchTab({
                            url: '/pages/mine/mine',
                        });
                    }
                },
            });
            return;
        }

        wx.navigateTo({
            url: '/pages/myBorrows/myBorrows',
            success: () => {
                console.log('跳转到归还界面成功');
            },
            fail: (err) => {
                console.error('跳转失败:', err);
                wx.showToast({
                    title: '跳转失败',
                    icon: 'none'
                });
            }
        });
    },
    // 跳转到订阅消息管理页面
    goToSubscribe() {
        wx.navigateTo({
            url: '/pages/subscribe/subscribe',
            success: () => {
                console.log('跳转到订阅消息管理页面成功');
            },
            fail: (err) => {
                console.error('跳转失败:', err);
                wx.showToast({
                    title: '跳转失败',
                    icon: 'none'
                });
            }
        });
    }
})

