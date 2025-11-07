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
        department: '',
        email: '',
        loading: false,
        showEditNameModal: false,
        editNickName: '',
        tempAvatarUrl: '', // 临时头像URL（用于登录时）
        tempNickName: '', // 临时昵称（用于登录时）
        showPhoneInputModal: false, // 是否显示手机号输入弹窗
        inputPhoneNumber: '', // 输入的手机号
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
                    department: '',
                    email: '',
                });
            }
        } catch (error) {
            console.error('检查登录状态失败:', error);
        }
    },

    /**
     * 选择头像（直接触发微信原生头像选择器）
     * 选择头像后自动使用默认昵称"微信用户"完成登录
     */
    async onChooseAvatar(e: any) {
        // 处理用户取消选择的情况
        if (!e || !e.detail || !e.detail.avatarUrl) {
            console.log('用户取消了头像选择');
            return;
        }

        const { avatarUrl } = e.detail;
        console.log('选择头像:', avatarUrl);

        // 使用默认昵称"微信用户"
        const defaultNickName = '微信用户';

        console.log('开始登录，头像:', avatarUrl, '昵称:', defaultNickName);

        this.setData({ loading: true });

        try {
            // 如果头像需要上传到云存储，先上传
            let finalAvatarUrl = avatarUrl;
            const openId = await getUserOpenId();

            if (openId && avatarUrl && !avatarUrl.startsWith('http')) {
                // 如果是本地临时路径，上传到云存储
                wx.showLoading({
                    title: '上传头像中...',
                    mask: true,
                });

                const uploadResult = await uploadAvatarToCloud(avatarUrl, openId);
                wx.hideLoading();

                if (uploadResult.success && uploadResult.fileID) {
                    // 获取可访问的头像URL
                    finalAvatarUrl = uploadResult.tempFileURL || uploadResult.fileID;
                    if (finalAvatarUrl.startsWith('cloud://')) {
                        finalAvatarUrl = await getAvatarURL(finalAvatarUrl);
                    }
                } else {
                    wx.showToast({
                        title: uploadResult.message || '头像上传失败',
                        icon: 'none',
                    });
                    this.setData({ loading: false });
                    return;
                }
            }

            // 创建用户信息对象
            const userInfo: WechatMiniprogram.UserInfo = {
                nickName: defaultNickName,
                avatarUrl: finalAvatarUrl,
                country: '',
                province: '',
                city: '',
                language: '',
                gender: 0,
            };

            // 登录并保存到数据库
            const loginResult = await userLogin(userInfo);

            if (loginResult.success) {
                // 设置明确的登录标志
                wx.setStorageSync('is_user_logged_in', true);

                // 更新页面数据
                this.setData({
                    isLoggedIn: true,
                    userInfo: userInfo,
                    tempAvatarUrl: '',
                    tempNickName: '',
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
        } catch (error: any) {
            console.error('登录失败:', error);
            wx.showToast({
                title: error.message || '登录失败',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
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
     * 编辑资料 - 跳转到编辑资料页面
     */
    handleEditProfile() {
        wx.navigateTo({
            url: '/pages/editProfile/editProfile',
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

            console.log('手机号授权回调:', { errMsg, code, encryptedData: encryptedData ? '有' : '无', iv: iv ? '有' : '无' });

            if (errMsg === 'getPhoneNumber:ok') {
                wx.showLoading({
                    title: '绑定中...',
                    mask: true,
                });

                try {
                    // 解密手机号（优先使用code，新版本API）
                    // 如果code存在，使用新版本API；否则使用旧版本API（encryptedData + iv）
                    const decryptResult = await decryptPhoneNumber(
                        code || encryptedData || '', // 新版本使用code，旧版本使用encryptedData
                        code ? undefined : iv // 新版本不需要iv，旧版本需要iv
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
                            duration: 2000,
                        });
                    }
                } catch (error: any) {
                    wx.hideLoading();
                    console.error('解密手机号失败:', error);
                    wx.showToast({
                        title: error.message || '绑定失败，请重试',
                        icon: 'none',
                        duration: 2000,
                    });
                }
            } else if (errMsg === 'getPhoneNumber:fail user deny') {
                wx.showToast({
                    title: '用户拒绝授权',
                    icon: 'none',
                });
            } else if (errMsg === 'getPhoneNumber:fail no permission' || errMsg.includes('no permission')) {
                // 没有权限，提示用户手动输入
                console.warn('手机号授权权限不足:', errMsg);
                wx.showModal({
                    title: '⚠️ 无法使用手机号授权',
                    content: '当前小程序没有手机号授权权限。\n\n可能原因：\n1. 个人开发者小程序无法使用此功能\n2. 未在微信公众平台开通手机号授权权限\n3. 小程序未发布（需要体验版或正式版）\n\n解决方案：\n• 登录微信公众平台（mp.weixin.qq.com）\n• 开发 → 开发管理 → 接口设置\n• 开通"手机号快速验证组件"\n\n是否先手动输入手机号？',
                    confirmText: '手动输入',
                    cancelText: '取消',
                    success: (res) => {
                        if (res.confirm) {
                            this.showManualPhoneInput();
                        }
                    },
                });
            } else {
                console.error('手机号授权失败:', errMsg);
                wx.showToast({
                    title: `授权失败: ${errMsg}`,
                    icon: 'none',
                    duration: 3000,
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

    /**
     * 显示手动输入手机号弹窗
     */
    showManualPhoneInput() {
        this.setData({
            showPhoneInputModal: true,
            inputPhoneNumber: this.data.phoneNumber || '',
        });
    },

    /**
     * 关闭手机号输入弹窗
     */
    closePhoneInputModal() {
        this.setData({
            showPhoneInputModal: false,
            inputPhoneNumber: '',
        });
    },

    /**
     * 手机号输入
     */
    onPhoneNumberInput(e: any) {
        const phoneNumber = e.detail.value.replace(/\D/g, ''); // 只保留数字
        this.setData({
            inputPhoneNumber: phoneNumber,
        });
    },

    /**
     * 确认手动输入手机号
     */
    async confirmManualPhoneNumber() {
        const phoneNumber = this.data.inputPhoneNumber.trim();

        // 验证手机号格式
        if (!phoneNumber) {
            wx.showToast({
                title: '请输入手机号',
                icon: 'none',
            });
            return;
        }

        if (!/^1[3-9]\d{9}$/.test(phoneNumber)) {
            wx.showToast({
                title: '请输入正确的手机号',
                icon: 'none',
            });
            return;
        }

        try {
            wx.showLoading({
                title: '保存中...',
                mask: true,
            });

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
                                    phoneNumber: phoneNumber,
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
                phoneNumber: phoneNumber,
                showPhoneInputModal: false,
                inputPhoneNumber: '',
            });

            // 保存到本地存储
            wx.setStorageSync('phoneNumber', phoneNumber);

            wx.hideLoading();
            wx.showToast({
                title: '手机号保存成功',
                icon: 'success',
            });

            // 刷新用户信息
            await this.checkLoginStatus();
        } catch (error: any) {
            wx.hideLoading();
            console.error('保存手机号失败:', error);
            wx.showToast({
                title: error.message || '保存失败',
                icon: 'none',
            });
        }
    },
})

