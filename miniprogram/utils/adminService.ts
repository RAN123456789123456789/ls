/**
 * 管理员服务
 * 处理管理员相关功能
 */

// 管理员账户配置
// 注意：在实际项目中，应该从后端获取管理员列表和密码
const ADMIN_ACCOUNTS: { [username: string]: string } = {
    'ls123': '123456',
    // 可以在这里添加更多管理员账户
    // 'admin2': 'password2',
};

// 管理员配置
// 注意：在实际项目中，应该从后端获取管理员列表
const ADMIN_OPENIDS: string[] = [
    // 在这里添加管理员的openId
    // 'admin_openid_1',
    // 'admin_openid_2',
];

/**
 * 管理员账户密码登录
 * @param username 用户名
 * @param password 密码
 */
export async function adminLogin(username: string, password: string): Promise<{ success: boolean; message?: string }> {
    try {
        // 验证账户密码
        if (ADMIN_ACCOUNTS[username] === password) {
            // 登录成功，设置管理员标识
            wx.setStorageSync('admin_logged_in', true);
            wx.setStorageSync('admin_username', username);
            wx.setStorageSync('is_admin', true);

            return {
                success: true,
                message: '登录成功',
            };
        } else {
            return {
                success: false,
                message: '账户或密码错误',
            };
        }
    } catch (error: any) {
        console.error('管理员登录失败:', error);
        return {
            success: false,
            message: error.message || '登录失败',
        };
    }
}

/**
 * 管理员退出登录
 */
export function adminLogout(): void {
    try {
        wx.removeStorageSync('admin_logged_in');
        wx.removeStorageSync('admin_username');
        wx.removeStorageSync('is_admin');
    } catch (error) {
        console.error('管理员退出登录失败:', error);
    }
}

/**
 * 检查当前用户是否是管理员
 */
export function isAdmin(): boolean {
    try {
        // 检查是否通过账户密码登录
        const adminLoggedIn = wx.getStorageSync('admin_logged_in');
        if (adminLoggedIn === true) {
            return true;
        }

        const openId = wx.getStorageSync('user_openId');
        if (!openId) {
            return false;
        }

        // 检查是否是配置的管理员
        if (ADMIN_OPENIDS.includes(openId)) {
            return true;
        }

        // 检查本地是否标记为管理员（用于开发测试）
        const isAdminFlag = wx.getStorageSync('is_admin');
        return isAdminFlag === true;
    } catch (error) {
        console.error('检查管理员身份失败:', error);
        return false;
    }
}

/**
 * 设置管理员身份（用于开发测试）
 */
export function setAdmin(isAdmin: boolean): void {
    try {
        wx.setStorageSync('is_admin', isAdmin);
    } catch (error) {
        console.error('设置管理员身份失败:', error);
    }
}

/**
 * 清除管理员身份
 */
export function clearAdmin(): void {
    try {
        wx.removeStorageSync('is_admin');
        wx.removeStorageSync('admin_logged_in');
        wx.removeStorageSync('admin_username');
    } catch (error) {
        console.error('清除管理员身份失败:', error);
    }
}


