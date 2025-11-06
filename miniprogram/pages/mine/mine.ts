// mine.ts
import { userLogin, getUserFromDatabase, clearUserCache, getUserOpenId, uploadAvatarToCloud, updateUserProfile, getAvatarURL, decryptPhoneNumber } from '../../utils/userService';
import { getBeijingTimeISOString } from '../../utils/util';

Page({
    data: {
        isLoggedIn: false,
        userInfo: {
            nickName: '',
            avatarUrl: '',
        },
        phoneNumber: '',
        studentId: '',
        department: '',
        email: '',
        loading: false,
        showEditNameModal: false,
        editNickName: '',
    },

    onLoad() {
        this.checkLoginStatus();
    },

    onShow() {
        // 每次显示页面时刷新用户信息
        this.checkLoginStatus();
    },

    /**
     * 检查登录状态
     */
    async checkLoginStatus() {
        try {
            // 首先检查明确的退出登录标志
            const isLoggedInFlag = wx.getStorageSync('is_user_logged_in');
            if (isLoggedInFlag === false) {
                // 明确标记为未登录，不继续检查
                this.setData({
                    isLoggedIn: false,
                    userInfo: {
                        nickName: '',
                        avatarUrl: '',
                    },
                    phoneNumber: '',
                    studentId: '',
                    department: '',
                    email: '',
                });
                return;
            }

            const openId = await getUserOpenId();
            if (openId) {
                // 检查是否有用户信息（需要明确的登录标志或有昵称）
                const localUserInfo = wx.getStorageSync('userInfo');
                const userInfo2 = wx.getStorageSync('user_info');

                // 只有存在用户信息且有昵称时才认为已登录
                if (localUserInfo?.nickName || userInfo2?.nickName) {
                    // 尝试从数据库获取用户信息
                    const result = await getUserFromDatabase();
                    if (result.success && result.data) {
                        const userData = result.data;
                        // 如果头像URL是云存储fileID，转换为临时访问URL
                        let avatarUrl = userData.avatarUrl || '';
                        if (avatarUrl && avatarUrl.startsWith('cloud://')) {
                            avatarUrl = await getAvatarURL(avatarUrl);
                        }

                        this.setData({
                            isLoggedIn: true,
                            userInfo: {
                                nickName: userData.nickName || '',
                                avatarUrl: avatarUrl,
                            },
                            phoneNumber: userData.phoneNumber || '',
                            studentId: userData.studentId || '',
                            department: userData.department || '',
                            email: userData.email || '',
                        });
                    } else {
                        // 从本地存储获取
                        const phoneNumber = wx.getStorageSync('phoneNumber');
                        if (localUserInfo?.nickName) {
                            // 处理本地存储的头像URL
                            let avatarUrl = localUserInfo?.avatarUrl || '';
                            if (avatarUrl && avatarUrl.startsWith('cloud://')) {
                                avatarUrl = await getAvatarURL(avatarUrl);
                            }

                            this.setData({
                                isLoggedIn: true,
                                userInfo: {
                                    nickName: localUserInfo.nickName || '',
                                    avatarUrl: avatarUrl,
                                },
                                phoneNumber: phoneNumber || '',
                            });
                        }
                    }
                } else {
                    // 没有用户信息，设置为未登录
                    this.setData({
                        isLoggedIn: false,
                        userInfo: {
                            nickName: '',
                            avatarUrl: '',
                        },
                        phoneNumber: '',
                        studentId: '',
                        department: '',
                        email: '',
                    });
                }
            } else {
                // 没有openId，设置为未登录
                this.setData({
                    isLoggedIn: false,
                    userInfo: {
                        nickName: '',
                        avatarUrl: '',
                    },
                    phoneNumber: '',
                    studentId: '',
                    department: '',
                    email: '',
                });
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
        }
    },

    /**
     * 微信一键登录
     */
    handleWechatLogin() {
        console.log('点击微信一键登录');

        // 先询问用户是否使用微信头像
        wx.showModal({
            title: '使用微信头像',
            content: '是否授权使用您的微信头像和昵称？\n\n选择"使用"将获取微信头像\n选择"不使用"将使用默认头像',
            confirmText: '使用',  // 不超过4个中文字符
            cancelText: '不使用',  // 不超过4个中文字符
            showCancel: true,
            success: (modalRes) => {
                console.log('对话框用户选择:', modalRes.confirm ? '使用微信头像' : '使用默认头像');

                // 用户做出选择后再设置loading状态
                this.setData({ loading: true });

                if (modalRes.confirm) {
                    // 用户同意使用微信头像，立即获取用户信息授权（必须在用户点击事件中调用）
                    this.getUserProfileWithAvatar();
                } else {
                    // 用户选择使用默认头像，立即获取昵称（必须在用户点击事件中调用）
                    this.getUserProfileWithoutAvatar();
                }
            },
            fail: (err) => {
                console.error('显示对话框失败:', err);
                // 对话框失败，默认使用微信头像
                this.setData({ loading: true });
                this.getUserProfileWithAvatar();
            },
        });
    },

    /**
     * 获取用户信息（使用微信头像）
     */
    getUserProfileWithAvatar() {
        wx.getUserProfile({
            desc: '用于完善用户信息',
            success: async (res) => {
                console.log('获取用户信息成功:', res);

                // 登录并保存到数据库
                const loginResult = await userLogin(res.userInfo);

                if (loginResult.success) {
                    // 设置明确的登录标志
                    wx.setStorageSync('is_user_logged_in', true);

                    // 更新页面数据
                    this.setData({
                        isLoggedIn: true,
                        userInfo: res.userInfo,
                    });

                    wx.showToast({
                        title: '登录成功',
                        icon: 'success',
                    });

                    // 刷新用户信息
                    await this.checkLoginStatus();
                } else {
                    wx.showToast({
                        title: loginResult.message || '登录失败',
                        icon: 'none',
                    });
                }
                this.setData({ loading: false });
            },
            fail: (err) => {
                console.error('获取用户信息失败:', err);
                wx.showToast({
                    title: '授权失败',
                    icon: 'none',
                });
                this.setData({ loading: false });
            },
        });
    },

    /**
     * 获取用户信息（不使用微信头像，使用默认头像）
     */
    getUserProfileWithoutAvatar() {
        wx.getUserProfile({
            desc: '用于完善用户信息',
            success: async (res) => {
                console.log('获取用户信息成功（不使用头像）:', res);

                // 创建用户信息，但使用默认头像
                const userInfoWithoutAvatar: WechatMiniprogram.UserInfo = {
                    nickName: res.userInfo.nickName,
                    avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0', // 默认头像
                    country: res.userInfo.country,
                    province: res.userInfo.province,
                    city: res.userInfo.city,
                    language: res.userInfo.language,
                    gender: res.userInfo.gender,
                };

                // 登录并保存到数据库
                const loginResult = await userLogin(userInfoWithoutAvatar);

                if (loginResult.success) {
                    // 设置明确的登录标志
                    wx.setStorageSync('is_user_logged_in', true);

                    // 更新页面数据
                    this.setData({
                        isLoggedIn: true,
                        userInfo: userInfoWithoutAvatar,
                    });

                    wx.showToast({
                        title: '登录成功',
                        icon: 'success',
                    });

                    // 刷新用户信息
                    await this.checkLoginStatus();
                } else {
                    wx.showToast({
                        title: loginResult.message || '登录失败',
                        icon: 'none',
                    });
                }
                this.setData({ loading: false });
            },
            fail: (err) => {
                console.error('获取用户信息失败:', err);
                // 如果获取昵称也失败，使用默认信息登录
                const defaultUserInfo: WechatMiniprogram.UserInfo = {
                    nickName: '微信用户',
                    avatarUrl: 'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0',
                    country: '',
                    province: '',
                    city: '',
                    language: '',
                    gender: 0,
                };

                userLogin(defaultUserInfo).then((loginResult) => {
                    if (loginResult.success) {
                        wx.setStorageSync('is_user_logged_in', true);
                        this.setData({
                            isLoggedIn: true,
                            userInfo: defaultUserInfo,
                        });
                        wx.showToast({
                            title: '登录成功',
                            icon: 'success',
                        });
                        this.checkLoginStatus();
                    } else {
                        wx.showToast({
                            title: '登录失败',
                            icon: 'none',
                        });
                    }
                    this.setData({ loading: false });
                });
            },
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
                    clearUserCache();
                    this.setData({
                        isLoggedIn: false,
                        userInfo: {
                            nickName: '',
                            avatarUrl: '',
                        },
                        phoneNumber: '',
                        studentId: '',
                        department: '',
                        email: '',
                    });
                    wx.showToast({
                        title: '已退出登录',
                        icon: 'success',
                    });
                }
            },
        });
    },

    /**
     * 跳转到管理员登录页面
     */
    goToAdminLogin() {
        wx.navigateTo({
            url: '/pages/login/login',
        });
    },

    /**
     * 编辑资料（暂时保留，可以扩展其他编辑功能）
     */
    handleEditProfile() {
        wx.showToast({
            title: '点击头像或昵称可编辑',
            icon: 'none',
            duration: 2000,
        });
    },

    /**
     * 编辑头像
     */
    async handleEditAvatar() {
        try {
            // 选择图片
            const chooseResult = await new Promise<WechatMiniprogram.ChooseImageSuccessCallbackResult | null>(
                (resolve, reject) => {
                    wx.chooseImage({
                        count: 1,
                        sizeType: ['compressed'],
                        sourceType: ['album', 'camera'],
                        success: resolve,
                        fail: (err) => {
                            // 如果用户取消选择，不显示错误
                            if (err.errMsg && err.errMsg.includes('cancel')) {
                                console.log('用户取消了头像选择');
                                resolve(null);
                            } else {
                                reject(err);
                            }
                        },
                    });
                }
            );

            // 用户取消了选择
            if (!chooseResult || !chooseResult.tempFilePaths || chooseResult.tempFilePaths.length === 0) {
                return;
            }

            const tempFilePath = chooseResult.tempFilePaths[0];

            // 显示上传中提示
            wx.showLoading({
                title: '上传中...',
                mask: true,
            });

            // 获取openId
            const openId = await getUserOpenId();
            if (!openId) {
                wx.hideLoading();
                wx.showToast({
                    title: '请先登录',
                    icon: 'none',
                });
                return;
            }

            // 上传到云存储
            const uploadResult = await uploadAvatarToCloud(tempFilePath, openId);

            if (uploadResult.success && uploadResult.fileID) {
                // 更新用户信息（保存fileID到数据库）
                const updateResult = await updateUserProfile(uploadResult.fileID);

                wx.hideLoading();

                if (updateResult.success && updateResult.data) {
                    // 获取可访问的头像URL
                    let avatarUrl = uploadResult.tempFileURL || uploadResult.fileID;
                    if (avatarUrl.startsWith('cloud://')) {
                        avatarUrl = await getAvatarURL(avatarUrl);
                    }

                    // 更新页面显示
                    this.setData({
                        userInfo: {
                            nickName: updateResult.data.nickName || this.data.userInfo.nickName,
                            avatarUrl: avatarUrl,
                        },
                    });

                    wx.showToast({
                        title: '头像更新成功',
                        icon: 'success',
                    });
                } else {
                    wx.showToast({
                        title: updateResult.message || '更新失败',
                        icon: 'none',
                    });
                }
            } else {
                wx.hideLoading();
                wx.showToast({
                    title: uploadResult.message || '上传失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            wx.hideLoading();
            console.error('编辑头像失败:', error);
            wx.showToast({
                title: error.message || '操作失败',
                icon: 'none',
            });
        }
    },

    /**
     * 编辑名称
     */
    handleEditName() {
        this.setData({
            showEditNameModal: true,
            editNickName: this.data.userInfo.nickName || '',
        });
    },

    /**
     * 关闭编辑名称弹窗
     */
    closeEditNameModal() {
        this.setData({
            showEditNameModal: false,
            editNickName: '',
        });
    },

    /**
     * 阻止事件冒泡
     */
    stopPropagation() {
        // 阻止事件冒泡，防止点击内容区域关闭弹窗
    },

    /**
     * 昵称输入
     */
    onNickNameInput(e: any) {
        this.setData({
            editNickName: e.detail.value,
        });
    },

    /**
     * 确认修改名称
     */
    async confirmEditName() {
        const nickName = this.data.editNickName.trim();

        if (!nickName) {
            wx.showToast({
                title: '昵称不能为空',
                icon: 'none',
            });
            return;
        }

        if (nickName.length > 20) {
            wx.showToast({
                title: '昵称不能超过20个字符',
                icon: 'none',
            });
            return;
        }

        try {
            wx.showLoading({
                title: '更新中...',
                mask: true,
            });

            // 更新用户信息
            const updateResult = await updateUserProfile(undefined, nickName);

            wx.hideLoading();

            if (updateResult.success && updateResult.data) {
                // 更新页面显示
                this.setData({
                    userInfo: {
                        nickName: updateResult.data.nickName || nickName,
                        avatarUrl: this.data.userInfo.avatarUrl,
                    },
                    showEditNameModal: false,
                    editNickName: '',
                });

                wx.showToast({
                    title: '昵称更新成功',
                    icon: 'success',
                });
            } else {
                wx.showToast({
                    title: updateResult.message || '更新失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            wx.hideLoading();
            console.error('更新昵称失败:', error);
            wx.showToast({
                title: error.message || '操作失败',
                icon: 'none',
            });
        }
    },

    /**
     * 设置手机号
     */
    async handleSetPhoneNumber(e: any) {
        try {
            const { errMsg, code, encryptedData, iv } = e.detail;

            if (errMsg === 'getPhoneNumber:ok' && code) {
                wx.showLoading({
                    title: '绑定中...',
                    mask: true,
                });

                // 解密手机号
                const decryptResult = await decryptPhoneNumber(
                    encryptedData,
                    iv
                );

                wx.hideLoading();

                if (decryptResult.success && decryptResult.phoneNumber) {
                    // 更新用户信息到数据库
                    const openId = await getUserOpenId();
                    if (openId) {
                        const db = (wx.cloud && wx.cloud.database) ? wx.cloud.database() : null;
                        if (db) {
                            try {
                                const userCollection = db.collection('user');
                                const queryResult = await userCollection.where({
                                    openId: openId
                                }).get();

                                if (queryResult.data && queryResult.data.length > 0) {
                                    await userCollection.doc(queryResult.data[0]._id).update({
                                        data: {
                                            phoneNumber: decryptResult.phoneNumber,
                                            updatedAt: getBeijingTimeISOString(),
                                        }
                                    });
                                }
                            } catch (dbError) {
                                console.warn('更新数据库失败:', dbError);
                            }
                        }
                    }

                    // 更新本地显示
                    this.setData({
                        phoneNumber: decryptResult.phoneNumber,
                    });

                    // 保存到本地存储
                    wx.setStorageSync('phoneNumber', decryptResult.phoneNumber);

                    wx.showToast({
                        title: '手机号绑定成功',
                        icon: 'success',
                    });

                    // 刷新用户信息
                    await this.checkLoginStatus();
                } else {
                    wx.showToast({
                        title: decryptResult.message || '绑定失败',
                        icon: 'none',
                    });
                }
            } else if (errMsg === 'getPhoneNumber:fail user deny') {
                wx.showToast({
                    title: '用户拒绝授权',
                    icon: 'none',
                });
            } else {
                wx.showToast({
                    title: '授权失败，请重试',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            wx.hideLoading();
            console.error('设置手机号失败:', error);
            wx.showToast({
                title: error.message || '操作失败',
                icon: 'none',
            });
        }
    },
})

