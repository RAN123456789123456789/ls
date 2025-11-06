// pages/login/login.ts
import { adminLogin } from '../../utils/adminService';

Page({
    data: {
        username: '',
        password: '',
        showPassword: false,
        loading: false,
    },

    onLoad() {
        // 检查是否已经登录
        const isAdminLoggedIn = wx.getStorageSync('admin_logged_in');
        if (isAdminLoggedIn) {
            // 已经登录，跳转到管理员界面
            wx.redirectTo({
                url: '/pages/admin/admin',
            });
        }
    },

    /**
     * 输入用户名
     */
    onUsernameInput(e: any) {
        this.setData({
            username: e.detail.value,
        });
    },

    /**
     * 输入密码
     */
    onPasswordInput(e: any) {
        this.setData({
            password: e.detail.value,
        });
    },

    /**
     * 切换密码显示/隐藏
     */
    togglePassword() {
        this.setData({
            showPassword: !this.data.showPassword,
        });
    },

    /**
     * 登录
     */
    async handleLogin() {
        const { username, password } = this.data;

        // 验证输入
        if (!username || !username.trim()) {
            wx.showToast({
                title: '请输入用户名',
                icon: 'none',
            });
            return;
        }

        if (!password || !password.trim()) {
            wx.showToast({
                title: '请输入密码',
                icon: 'none',
            });
            return;
        }

        this.setData({ loading: true });

        try {
            const result = await adminLogin(username.trim(), password.trim());

            if (result.success) {
                wx.showToast({
                    title: '登录成功',
                    icon: 'success',
                });

                // 跳转到管理员界面
                setTimeout(() => {
                    wx.redirectTo({
                        url: '/pages/admin/admin',
                    });
                }, 1500);
            } else {
                wx.showToast({
                    title: result.message || '登录失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            console.error('登录失败:', error);
            wx.showToast({
                title: error.message || '登录失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
    },
});






