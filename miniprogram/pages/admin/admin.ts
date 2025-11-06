// pages/admin/admin.ts
import { isAdmin, adminLogout } from '../../utils/adminService';

Page({
    data: {
        isAdminUser: false,
    },

    onLoad() {
        // 检查是否是管理员
        if (!isAdmin()) {
            wx.showModal({
                title: '权限不足',
                content: '此功能仅限管理员使用',
                showCancel: false,
                success: () => {
                    wx.navigateBack();
                },
            });
            return;
        }
        this.setData({
            isAdminUser: true,
        });
    },

    onShow() {
        // 每次显示时检查管理员状态
        if (!isAdmin()) {
            wx.showModal({
                title: '权限不足',
                content: '请重新登录',
                showCancel: false,
                success: () => {
                    wx.redirectTo({
                        url: '/pages/login/login',
                    });
                },
            });
            return;
        }
    },

    /**
     * 跳转到审核页面
     */
    goToReview() {
        wx.navigateTo({
            url: '/pages/adminReview/adminReview',
        });
    },

    /**
     * 退出登录
     */
    handleLogout() {
        wx.showModal({
            title: '提示',
            content: '确定要退出登录吗？',
            success: (res) => {
                if (res.confirm) {
                    adminLogout();
                    wx.showToast({
                        title: '已退出登录',
                        icon: 'success',
                    });
                    setTimeout(() => {
                        wx.redirectTo({
                            url: '/pages/login/login',
                        });
                    }, 1500);
                }
            },
        });
    },
});






