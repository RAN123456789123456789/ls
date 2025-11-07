// editProfile.ts
import { getUserFromDatabase, getUserOpenId, getAvatarURL, uploadAvatarToCloud } from '../../utils/userService';
import { getBeijingTimeISOString } from '../../utils/util';

Page({
    data: {
        // 用户信息
        nickName: '',
        avatarUrl: '',
        avatarFileID: '', // 云存储fileID
        phoneNumber: '',
        department: '',
        email: '',

        // 原始数据（用于比较是否有变化）
        originalData: {} as any,

        // 加载状态
        loading: false,
    },

    onLoad() {
        this.loadUserData();
    },

    /**
     * 从数据库加载用户数据
     */
    async loadUserData() {
        try {
            wx.showLoading({
                title: '加载中...',
                mask: true,
            });

            const result = await getUserFromDatabase();

            if (result.success && result.data) {
                const userData = result.data;

                // 如果头像URL是云存储fileID，转换为临时访问URL
                let avatarUrl = userData.avatarUrl || '';
                if (avatarUrl && avatarUrl.startsWith('cloud://')) {
                    avatarUrl = await getAvatarURL(avatarUrl);
                }

                // 保存原始数据
                const originalData = {
                    nickName: userData.nickName || '',
                    avatarUrl: avatarUrl,
                    avatarFileID: userData.avatarUrl || '', // 保存原始fileID
                    phoneNumber: userData.phoneNumber || '',
                    department: userData.department || '',
                    email: userData.email || '',
                };

                this.setData({
                    nickName: originalData.nickName,
                    avatarUrl: originalData.avatarUrl,
                    avatarFileID: originalData.avatarFileID,
                    phoneNumber: originalData.phoneNumber,
                    department: originalData.department,
                    email: originalData.email,
                    originalData: originalData,
                });
            } else {
                wx.showToast({
                    title: '加载用户信息失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            console.error('加载用户数据失败:', error);
            wx.showToast({
                title: error.message || '加载失败',
                icon: 'none',
            });
        } finally {
            wx.hideLoading();
        }
    },

    /**
     * 昵称输入
     */
    onNickNameInput(e: any) {
        this.setData({
            nickName: e.detail.value,
        });
    },

    /**
     * 手机号输入（只允许数字，最多11位）
     */
    onPhoneNumberInput(e: any) {
        const phoneNumber = e.detail.value.replace(/\D/g, '').slice(0, 11); // 只保留数字，最多11位
        this.setData({
            phoneNumber: phoneNumber,
        });
    },

    /**
     * 部门输入
     */
    onDepartmentInput(e: any) {
        this.setData({
            department: e.detail.value,
        });
    },

    /**
     * 邮箱输入
     */
    onEmailInput(e: any) {
        this.setData({
            email: e.detail.value,
        });
    },

    /**
     * 选择头像
     */
    async onChooseAvatar(e: any) {
        // 处理用户取消选择的情况
        if (!e || !e.detail || !e.detail.avatarUrl) {
            console.log('用户取消了头像选择');
            return;
        }

        const { avatarUrl } = e.detail;
        console.log('选择头像:', avatarUrl);

        try {
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

            // 如果是本地临时路径，上传到云存储
            let finalAvatarUrl = avatarUrl;
            let finalAvatarFileID = '';

            if (avatarUrl && !avatarUrl.startsWith('http') && !avatarUrl.startsWith('cloud://')) {
                const uploadResult = await uploadAvatarToCloud(avatarUrl, openId);

                if (uploadResult.success && uploadResult.fileID) {
                    // 保存fileID（用于数据库存储）
                    finalAvatarFileID = uploadResult.fileID;
                    // 获取可访问的头像URL（用于页面显示）
                    finalAvatarUrl = uploadResult.tempFileURL || uploadResult.fileID;
                    if (finalAvatarUrl.startsWith('cloud://')) {
                        finalAvatarUrl = await getAvatarURL(finalAvatarUrl);
                    }
                } else {
                    wx.hideLoading();
                    wx.showToast({
                        title: uploadResult.message || '头像上传失败',
                        icon: 'none',
                    });
                    return;
                }
            } else if (avatarUrl && avatarUrl.startsWith('cloud://')) {
                // 如果已经是云存储fileID，直接使用
                finalAvatarFileID = avatarUrl;
                finalAvatarUrl = await getAvatarURL(avatarUrl);
            } else {
                // 其他情况（如http URL），保持原样
                finalAvatarFileID = avatarUrl;
            }

            // 更新页面显示
            this.setData({
                avatarUrl: finalAvatarUrl,
                avatarFileID: finalAvatarFileID,
            });

            wx.hideLoading();
        } catch (error: any) {
            wx.hideLoading();
            console.error('选择头像失败:', error);
            wx.showToast({
                title: error.message || '操作失败',
                icon: 'none',
            });
        }
    },

    /**
     * 验证手机号格式（11位）
     */
    validatePhoneNumber(phoneNumber: string): boolean {
        if (!phoneNumber) {
            return true; // 允许为空
        }
        // 必须是11位数字，且以1开头
        return /^1[3-9]\d{9}$/.test(phoneNumber);
    },

    /**
     * 验证邮箱格式
     */
    validateEmail(email: string): boolean {
        if (!email) {
            return true; // 允许为空
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    /**
     * 保存修改
     */
    async saveChanges() {
        // 验证手机号
        if (this.data.phoneNumber && !this.validatePhoneNumber(this.data.phoneNumber)) {
            wx.showToast({
                title: '请输入正确的11位手机号',
                icon: 'none',
            });
            return;
        }

        // 验证邮箱
        if (this.data.email && !this.validateEmail(this.data.email)) {
            wx.showToast({
                title: '请输入正确的邮箱地址',
                icon: 'none',
            });
            return;
        }

        // 检查是否有变化
        const hasChanges =
            this.data.nickName !== this.data.originalData.nickName ||
            this.data.avatarFileID !== this.data.originalData.avatarFileID ||
            this.data.phoneNumber !== this.data.originalData.phoneNumber ||
            this.data.department !== this.data.originalData.department ||
            this.data.email !== this.data.originalData.email;

        if (!hasChanges) {
            wx.showToast({
                title: '没有修改任何信息',
                icon: 'none',
            });
            return;
        }

        try {
            wx.showLoading({
                title: '保存中...',
                mask: true,
            });

            const openId = await getUserOpenId();
            if (!openId) {
                wx.hideLoading();
                wx.showToast({
                    title: '请先登录',
                    icon: 'none',
                });
                return;
            }

            // 准备更新数据
            const updateData: any = {
                updatedAt: getBeijingTimeISOString(),
            };

            // 只更新有变化的字段
            if (this.data.nickName !== this.data.originalData.nickName) {
                updateData.nickName = this.data.nickName;
            }
            if (this.data.avatarFileID !== this.data.originalData.avatarFileID) {
                // 保存云存储的fileID到数据库
                updateData.avatarUrl = this.data.avatarFileID || this.data.avatarUrl;
            }
            if (this.data.phoneNumber !== this.data.originalData.phoneNumber) {
                updateData.phoneNumber = this.data.phoneNumber;
            }
            if (this.data.department !== this.data.originalData.department) {
                updateData.department = this.data.department;
            }
            if (this.data.email !== this.data.originalData.email) {
                updateData.email = this.data.email;
            }

            // 更新数据库
            const db = (wx.cloud && wx.cloud.database) ? wx.cloud.database() : null;
            if (db) {
                try {
                    const userCollection = db.collection('user');
                    const queryResult = await userCollection.where({
                        openId: openId
                    }).get();

                    if (queryResult.data && queryResult.data.length > 0) {
                        await userCollection.doc(queryResult.data[0]._id).update({
                            data: updateData
                        });

                        // 同步到本地存储
                        const updatedUser = {
                            ...queryResult.data[0],
                            ...updateData,
                        };
                        wx.setStorageSync('user_info', updatedUser);

                        // 同步手机号到本地存储
                        if (updateData.phoneNumber !== undefined) {
                            wx.setStorageSync('phoneNumber', updateData.phoneNumber);
                        }

                        wx.hideLoading();
                        wx.showToast({
                            title: '保存成功',
                            icon: 'success',
                        });

                        // 延迟返回上一页，让用户看到成功提示
                        setTimeout(() => {
                            wx.navigateBack();
                        }, 1500);
                    } else {
                        wx.hideLoading();
                        wx.showToast({
                            title: '用户不存在',
                            icon: 'none',
                        });
                    }
                } catch (dbError: any) {
                    wx.hideLoading();
                    console.error('更新数据库失败:', dbError);
                    wx.showToast({
                        title: '保存失败，请重试',
                        icon: 'none',
                    });
                }
            } else {
                // 降级到本地存储
                const localUser = wx.getStorageSync('user_info') || {};
                const updatedUser = {
                    ...localUser,
                    ...updateData,
                    openId: openId,
                };
                wx.setStorageSync('user_info', updatedUser);

                if (updateData.phoneNumber !== undefined) {
                    wx.setStorageSync('phoneNumber', updateData.phoneNumber);
                }

                wx.hideLoading();
                wx.showToast({
                    title: '已保存到本地',
                    icon: 'success',
                });

                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
            }
        } catch (error: any) {
            wx.hideLoading();
            console.error('保存失败:', error);
            wx.showToast({
                title: error.message || '保存失败',
                icon: 'none',
            });
        }
    },
});

