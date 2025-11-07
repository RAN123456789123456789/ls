/**
 * 用户服务
 * 处理用户登录、获取openId等操作
 */

import { getBeijingTimeISOString } from './util';

// 用户信息接口
export interface UserInfo {
    openId: string;
    nickName?: string;
    avatarUrl?: string;
    phoneNumber?: string;
    department?: string;
    email?: string;
    createdAt?: string;
    updatedAt?: string;
}

// 数据库用户信息接口
export interface DBUserInfo {
    _id?: string;
    _openid?: string;
    openId: string;
    nickName?: string;
    avatarUrl?: string;
    phoneNumber?: string;
    department?: string;
    email?: string;
    createdAt?: string;
    updatedAt?: string;
}

// API配置
// 注意：请根据实际后端API地址修改
// 使用云托管默认域名（临时方案，等待域名备案完成后可切换为自定义域名）
const API_BASE_URL = 'https://express-bec5-197615-5-1385276628.sh.run.tcloudbase.com/api';

/**
 * 获取用户openId
 * 通过wx.login获取code，然后调用后端API换取openId
 */
export async function getUserOpenId(): Promise<string> {
    try {
        // 如果 API_BASE_URL 是默认值，直接生成或返回临时openId
        if (API_BASE_URL === 'https://your-api-domain.com/api') {
            let tempOpenId = wx.getStorageSync('temp_openId');
            if (!tempOpenId) {
                // 生成一个基于时间戳的临时openId
                tempOpenId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                wx.setStorageSync('temp_openId', tempOpenId);
                wx.setStorageSync('user_openId', tempOpenId);
                console.log('生成临时openId:', tempOpenId);
            }
            return tempOpenId;
        }

        // 检查缓存中是否有openId
        const cachedOpenId = wx.getStorageSync('user_openId');
        if (cachedOpenId) {
            return cachedOpenId;
        }

        // 获取登录code
        const loginRes = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>(
            (resolve, reject) => {
                wx.login({
                    success: resolve,
                    fail: reject,
                });
            }
        );

        // 调用后端API获取openId
        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/user/getOpenId`,
                method: 'POST',
                data: {
                    code: loginRes.code,
                },
                header: {
                    'content-type': 'application/json',
                },
                success: (res) => {
                    if (res.statusCode === 200) {
                        resolve(res.data);
                    } else {
                        reject(new Error(`请求失败: ${res.statusCode}`));
                    }
                },
                fail: reject,
            });
        });

        if (res.success && res.data?.openId) {
            // 缓存openId
            wx.setStorageSync('user_openId', res.data.openId);
            return res.data.openId;
        } else {
            throw new Error(res.message || '获取openId失败');
        }
    } catch (error: any) {
        console.error('获取openId失败:', error);

        // 如果后端API不可用，生成一个临时openId用于开发测试
        // 首先检查是否有缓存的临时openId
        let tempOpenId = wx.getStorageSync('temp_openId');
        if (!tempOpenId) {
            // 生成一个基于时间戳的临时openId
            tempOpenId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            wx.setStorageSync('temp_openId', tempOpenId);
            wx.setStorageSync('user_openId', tempOpenId); // 同时保存到user_openId
        } else {
            // 如果已有临时openId，也保存到user_openId
            wx.setStorageSync('user_openId', tempOpenId);
        }

        console.log('使用临时openId:', tempOpenId);
        return tempOpenId;
    }
}

/**
 * 初始化云数据库（如果使用云开发）
 */
function initCloudDB() {
    try {
        // 检查是否支持云开发且已初始化
        if (typeof wx.cloud === 'undefined' || !wx.cloud.database) {
            return null;
        }

        // 尝试获取数据库实例
        const db = wx.cloud.database();

        // 验证数据库是否可用（通过检查config属性）
        if (!db || !db.config) {
            return null;
        }

        return db;
    } catch (error) {
        console.warn('云数据库未初始化或配置错误:', error);
        return null;
    }
}

/**
 * 保存用户信息到数据库
 * @param userInfo 用户信息
 */
export async function saveUserToDatabase(userInfo: UserInfo): Promise<{ success: boolean; message?: string; data?: DBUserInfo }> {
    try {
        const db = initCloudDB();

        // 如果没有云数据库，保存到本地存储
        if (!db) {
            console.log('云数据库未配置，保存到本地存储');
            const now = getBeijingTimeISOString();
            const localUser = {
                ...userInfo,
                createdAt: userInfo.createdAt || now,
                updatedAt: now,
            };
            wx.setStorageSync('user_info', localUser);
            return {
                success: true,
                message: '用户信息已保存到本地',
                data: localUser as DBUserInfo,
            };
        }

        // 使用云数据库保存
        try {
            const userCollection = db.collection('user');
            const now = getBeijingTimeISOString();

            // 重要：优先使用云开发的 _openid 查询用户，确保同一微信账号每次登录都能找到同一用户
            // 云开发在启用权限控制时会自动添加 _openid 条件，这是微信官方提供的唯一标识

            let existingUser: DBUserInfo | null = null;

            // 方案1：先尝试用 openId 查询（兼容性更好）
            try {
                const queryResultByOpenId = await userCollection.where({
                    openId: userInfo.openId
                }).get();

                if (queryResultByOpenId.data && queryResultByOpenId.data.length > 0) {
                    existingUser = queryResultByOpenId.data[0];
                }
            } catch (queryError: any) {
                console.warn('使用 openId 查询失败，尝试其他方式:', queryError);
            }

            // 方案2：如果通过 openId 查询不到，尝试直接查询当前用户（云开发会自动添加 _openid 条件）
            if (!existingUser) {
                try {
                    let queryResult = await userCollection.get();

                    if (queryResult.data && queryResult.data.length > 0) {
                        // 优先查找 openId 匹配的用户
                        existingUser = queryResult.data.find((user: DBUserInfo) => user.openId === userInfo.openId) as DBUserInfo;

                        // 如果没找到 openId 匹配的，取第一条（因为权限控制，只会返回当前用户的数据）
                        if (!existingUser) {
                            existingUser = queryResult.data[0] as DBUserInfo;
                        }
                    }
                } catch (getError: any) {
                    console.warn('直接查询当前用户失败:', getError);
                }
            }

            let result;

            if (existingUser) {
                // 用户已存在，更新信息
                // 如果 openId 不一致，先更新 openId 字段以保持一致性
                if (existingUser.openId !== userInfo.openId) {
                    console.log('发现 openId 不一致，更新 openId 字段', {
                        oldOpenId: existingUser.openId,
                        newOpenId: userInfo.openId
                    });
                }
                const updateData: any = {
                    updatedAt: now,
                };

                // 如果 openId 不一致，更新 openId 字段
                if (existingUser.openId !== userInfo.openId) {
                    updateData.openId = userInfo.openId;
                }

                // 只更新有值的字段
                if (userInfo.nickName) updateData.nickName = userInfo.nickName;
                if (userInfo.avatarUrl) updateData.avatarUrl = userInfo.avatarUrl;
                if (userInfo.phoneNumber) updateData.phoneNumber = userInfo.phoneNumber;
                if (userInfo.department) updateData.department = userInfo.department;
                if (userInfo.email) updateData.email = userInfo.email;

                result = await userCollection.doc(existingUser._id).update({
                    data: updateData
                });

                return {
                    success: true,
                    message: '用户信息已更新',
                    data: {
                        ...existingUser,
                        ...updateData,
                    } as DBUserInfo,
                };
            } else {
                // 用户不存在，创建新用户
                const newUser: any = {
                    openId: userInfo.openId,
                    nickName: userInfo.nickName || '',
                    avatarUrl: userInfo.avatarUrl || '',
                    phoneNumber: userInfo.phoneNumber || '',
                    department: userInfo.department || '',
                    email: userInfo.email || '',
                    createdAt: now,
                    updatedAt: now,
                };

                result = await userCollection.add({
                    data: newUser
                });

                return {
                    success: true,
                    message: '用户信息已创建',
                    data: {
                        _id: result._id,
                        ...newUser,
                    } as DBUserInfo,
                };
            }
        } catch (dbError: any) {
            // 云数据库操作失败，降级到本地存储
            console.warn('云数据库操作失败，使用本地存储:', dbError);
            throw dbError; // 抛出错误，让外层catch处理
        }
    } catch (error: any) {
        console.error('保存用户信息到数据库失败:', error);

        // 失败时保存到本地存储作为备份
        try {
            const now = getBeijingTimeISOString();
            const localUser = {
                ...userInfo,
                createdAt: userInfo.createdAt || now,
                updatedAt: now,
            };
            wx.setStorageSync('user_info', localUser);
            return {
                success: true,
                message: '数据库保存失败，已保存到本地',
                data: localUser as DBUserInfo,
            };
        } catch (localError) {
            return {
                success: false,
                message: error.message || '保存用户信息失败',
            };
        }
    }
}

/**
 * 用户登录并保存到数据库
 * @param userProfile 用户授权信息（可选）
 * @param phoneNumber 手机号（可选）
 */
export async function userLogin(userProfile?: WechatMiniprogram.UserInfo, phoneNumber?: string): Promise<{ success: boolean; message?: string; data?: DBUserInfo }> {
    try {
        // 获取openId
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '获取openId失败',
            };
        }

        // 先检查数据库中是否已有该用户信息
        // 用户唯一性：通过 openId 字段保证，登录时会先查询数据库中是否已有该用户
        console.log('登录时检查数据库中是否已有用户信息，openId:', openId);
        const dbUserResult = await getUserFromDatabase(openId);

        let existingUserData: DBUserInfo | null = null;
        if (dbUserResult.success && dbUserResult.data) {
            // 数据库中已有该用户，同步所有数据到本地
            // 这样可以确保用户每次登录都能获取到之前保存的所有信息（昵称、头像、手机号、部门、邮箱等）
            console.log('数据库中已有用户信息，同步到本地:', dbUserResult.data);
            existingUserData = dbUserResult.data;

            // 同步所有数据到本地存储
            wx.setStorageSync('user_info', existingUserData);
            wx.setStorageSync('user_openId', openId);

            // 如果有昵称和头像，也单独保存
            if (existingUserData.nickName) {
                wx.setStorageSync('userInfo', {
                    nickName: existingUserData.nickName,
                    avatarUrl: existingUserData.avatarUrl || '',
                });
            }
            if (existingUserData.phoneNumber) {
                wx.setStorageSync('phoneNumber', existingUserData.phoneNumber);
            }

            // 设置登录标志
            if (existingUserData.nickName) {
                wx.setStorageSync('is_user_logged_in', true);
            }
        }

        // 构建要更新的用户信息（合并数据库中的数据和新的授权信息）
        const userInfo: UserInfo = {
            openId,
            // 优先使用新的授权信息（如果提供），否则使用数据库中的数据
            // 这样可以确保新上传的头像不会被数据库中的旧头像覆盖
            nickName: userProfile?.nickName || existingUserData?.nickName || '',
            avatarUrl: userProfile?.avatarUrl || existingUserData?.avatarUrl || '',
            phoneNumber: phoneNumber || existingUserData?.phoneNumber || '',
            department: existingUserData?.department || '',
            email: existingUserData?.email || '',
        };

        // 如果有新的授权信息（userProfile或phoneNumber），更新数据库
        const hasNewInfo = (userProfile && userProfile.nickName) || phoneNumber;
        if (hasNewInfo) {
            console.log('有新的用户信息，更新数据库');
            // 保存到数据库（会更新或创建）
            const result = await saveUserToDatabase(userInfo);

            if (result.success && result.data) {
                // 更新本地存储（使用数据库返回的最新数据）
                wx.setStorageSync('user_info', result.data);
                wx.setStorageSync('user_openId', openId);

                // 设置明确的登录标志（只有在有用户信息时才设置为true）
                if (userProfile && userProfile.nickName) {
                    wx.setStorageSync('is_user_logged_in', true);
                }

                // 如果有用户信息，也单独保存
                if (userProfile) {
                    wx.setStorageSync('userInfo', userProfile);
                }
                if (phoneNumber) {
                    wx.setStorageSync('phoneNumber', phoneNumber);
                }

                return result;
            } else {
                // 更新失败，但已有数据库数据，返回数据库数据
                if (existingUserData) {
                    return {
                        success: true,
                        message: '数据库更新失败，但已同步现有数据',
                        data: existingUserData,
                    };
                }
                return result;
            }
        } else {
            // 没有新的授权信息，但已从数据库同步了数据
            if (existingUserData) {
                return {
                    success: true,
                    message: '已同步数据库中的用户信息',
                    data: existingUserData,
                };
            } else {
                // 既没有数据库数据，也没有新授权信息，创建基本用户记录
                const result = await saveUserToDatabase(userInfo);
                if (result.success && result.data) {
                    wx.setStorageSync('user_info', result.data);
                    wx.setStorageSync('user_openId', openId);
                }
                return result;
            }
        }
    } catch (error: any) {
        console.error('用户登录失败:', error);
        return {
            success: false,
            message: error.message || '登录失败',
        };
    }
}

/**
 * 从数据库获取用户信息
 * @param openId 用户openId（可选，默认使用当前登录用户）
 */
export async function getUserFromDatabase(openId?: string): Promise<{ success: boolean; data?: DBUserInfo; message?: string }> {
    try {
        const db = initCloudDB();

        // 如果没有云数据库，从本地存储获取
        if (!db) {
            const localUser = wx.getStorageSync('user_info');
            if (localUser) {
                return {
                    success: true,
                    data: localUser as DBUserInfo,
                };
            }
            return {
                success: false,
                message: '未找到用户信息',
            };
        }

        // 从云数据库获取
        try {
            const targetOpenId = openId || await getUserOpenId();
            if (!targetOpenId) {
                return {
                    success: false,
                    message: '未获取到openId',
                };
            }

            const userCollection = db.collection('user');

            // 重要：优先使用云开发的 _openid 查询用户，确保同一微信账号每次登录都能找到同一用户
            // 云开发在启用权限控制时会自动添加 _openid 条件，这是微信官方提供的唯一标识
            // 如果只使用自定义的 openId 查询，当 openId 和 _openid 不一致时，可能查询不到已存在的用户

            // 方案1：先尝试用 openId 查询（兼容性更好）
            try {
                const queryResult = await userCollection.where({
                    openId: targetOpenId
                }).get();

                if (queryResult.data && queryResult.data.length > 0) {
                    const userData = queryResult.data[0] as DBUserInfo;
                    wx.setStorageSync('user_info', userData);
                    return {
                        success: true,
                        data: userData,
                    };
                }
            } catch (queryError: any) {
                console.warn('使用 openId 查询失败，尝试其他方式:', queryError);
            }

            // 方案2：直接查询当前用户（云开发会自动添加 _openid 条件）
            // 这样可以确保同一微信账号每次登录都能找到同一用户
            try {
                let result = await userCollection.get();

                // 如果查询到数据，检查是否有匹配的用户
                if (result.data && result.data.length > 0) {
                    // 优先查找 openId 匹配的用户
                    let userData = result.data.find((user: DBUserInfo) => user.openId === targetOpenId) as DBUserInfo;

                    // 如果没找到 openId 匹配的，取第一条（因为权限控制，只会返回当前用户的数据）
                    if (!userData) {
                        userData = result.data[0] as DBUserInfo;
                        // 如果 openId 不一致，更新 openId 字段以保持一致性
                        if (userData.openId !== targetOpenId) {
                            console.log('发现 openId 不一致，更新 openId 字段', {
                                oldOpenId: userData.openId,
                                newOpenId: targetOpenId
                            });
                            try {
                                // 更新 openId 字段
                                await userCollection.doc(userData._id).update({
                                    data: {
                                        openId: targetOpenId
                                    }
                                });
                                userData.openId = targetOpenId;
                            } catch (updateError: any) {
                                console.warn('更新 openId 失败:', updateError);
                            }
                        }
                    }

                    // 同步到本地存储
                    wx.setStorageSync('user_info', userData);
                    return {
                        success: true,
                        data: userData,
                    };
                }
            } catch (getError: any) {
                console.warn('直接查询当前用户失败:', getError);
            }

            // 方案3：未找到用户，尝试从本地存储获取
            const localUser = wx.getStorageSync('user_info');
            if (localUser) {
                return {
                    success: true,
                    data: localUser as DBUserInfo,
                };
            }

            return {
                success: false,
                message: '未找到用户信息',
            };
        } catch (dbError: any) {
            // 云数据库操作失败，降级到本地存储
            console.warn('云数据库查询失败，使用本地存储:', dbError);
            throw dbError; // 抛出错误，让外层catch处理
        }
    } catch (error: any) {
        // 失败时尝试从本地存储获取
        const localUser = wx.getStorageSync('user_info');
        if (localUser) {
            return {
                success: true,
                data: localUser as DBUserInfo,
            };
        }

        // 静默失败，不显示错误信息
        return {
            success: false,
            message: '未找到用户信息',
        };
    }
}

/**
 * 清除用户信息缓存
 */
export function clearUserCache(): void {
    try {
        wx.removeStorageSync('user_openId');
        wx.removeStorageSync('user_info');
        wx.removeStorageSync('userInfo');
        wx.removeStorageSync('phoneNumber');
        // 设置明确的退出登录标志
        wx.setStorageSync('is_user_logged_in', false);
    } catch (error) {
        console.error('清除用户缓存失败:', error);
    }
}

/**
 * 检查用户是否已登录
 */
export function isUserLoggedIn(): boolean {
    // 检查明确的登录标志
    const isLoggedIn = wx.getStorageSync('is_user_logged_in');
    if (isLoggedIn === false) {
        return false; // 明确标记为未登录
    }
    // 如果有用户信息和昵称，认为已登录
    const userInfo = wx.getStorageSync('userInfo');
    const userInfo2 = wx.getStorageSync('user_info');
    return !!(userInfo?.nickName || userInfo2?.nickName);
}

/**
 * 解密手机号
 * @param encryptedData 加密数据
 * @param iv 初始向量
 * @returns 解密后的手机号
 */
export async function decryptPhoneNumber(
    codeOrEncryptedData: string,
    ivOrCode?: string
): Promise<{ success: boolean; phoneNumber?: string; message?: string }> {
    try {
        // 判断是新版本（code）还是旧版本（encryptedData）
        // code通常较短（<100字符），encryptedData通常很长（>200字符）
        const isNewVersion = codeOrEncryptedData && codeOrEncryptedData.length < 100 && !ivOrCode;

        // 如果 API 未配置，生成模拟手机号用于开发测试
        if (API_BASE_URL === 'https://your-api-domain.com/api') {
            console.log('API未配置，使用模拟手机号');
            // 生成一个模拟手机号（格式：138****8888）
            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const phoneNumber = `138****${randomSuffix}`;

            // 保存到本地存储
            wx.setStorageSync('phoneNumber', phoneNumber);

            return {
                success: true,
                phoneNumber: phoneNumber,
            };
        }

        // 获取openId
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        // 准备请求数据
        const requestData: any = {
            openId,
        };

        if (isNewVersion) {
            // 新版本：使用code
            requestData.code = codeOrEncryptedData;
            console.log('使用新版本手机号授权API（code）');
        } else {
            // 旧版本：使用encryptedData和iv
            requestData.encryptedData = codeOrEncryptedData;
            requestData.iv = ivOrCode;
            console.log('使用旧版本手机号授权API（encryptedData + iv）');
        }

        // 调用后端API解密手机号
        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/user/decryptPhone`,
                method: 'POST',
                data: requestData,
                header: {
                    'content-type': 'application/json',
                },
                success: (res) => {
                    console.log('解密手机号API响应:', res);
                    if (res.statusCode === 200) {
                        resolve(res.data);
                    } else {
                        reject(new Error(`请求失败: ${res.statusCode}`));
                    }
                },
                fail: (err) => {
                    console.error('请求失败:', err);
                    reject(err);
                },
            });
        });

        if (res.success && res.data?.phoneNumber) {
            // 保存到本地存储
            wx.setStorageSync('phoneNumber', res.data.phoneNumber);
            return {
                success: true,
                phoneNumber: res.data.phoneNumber,
            };
        } else {
            return {
                success: false,
                message: res.message || '解密手机号失败',
            };
        }
    } catch (error: any) {
        console.error('解密手机号失败:', error);

        // 开发测试：生成模拟手机号（仅在开发环境）
        if (API_BASE_URL.includes('localhost') || API_BASE_URL.includes('127.0.0.1')) {
            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const phoneNumber = `138****${randomSuffix}`;
            wx.setStorageSync('phoneNumber', phoneNumber);
            return {
                success: true,
                phoneNumber: phoneNumber,
            };
        }

        return {
            success: false,
            message: error.message || '解密手机号失败，请重试',
        };
    }
}

/**
 * 将云存储fileID转换为临时访问URL
 * @param fileID 云存储文件ID
 * @returns 临时访问URL
 */
export async function getAvatarURL(fileID: string): Promise<string> {
    try {
        // 如果不是云存储路径，直接返回
        if (!fileID || !fileID.startsWith('cloud://')) {
            return fileID;
        }

        // 检查云存储是否可用
        if (typeof wx.cloud === 'undefined' || !wx.cloud.getTempFileURL) {
            return fileID;
        }

        // 获取临时访问URL
        const urlResult = await wx.cloud.getTempFileURL({
            fileList: [fileID],
        });

        if (urlResult.fileList && urlResult.fileList.length > 0) {
            return urlResult.fileList[0].tempFileURL || fileID;
        }

        return fileID;
    } catch (error) {
        console.warn('获取头像URL失败:', error);
        return fileID;
    }
}

/**
 * 上传头像到云存储
 * @param filePath 本地文件路径
 * @param openId 用户openId
 * @returns 云存储文件ID和临时访问URL
 */
export async function uploadAvatarToCloud(
    filePath: string,
    openId: string
): Promise<{ success: boolean; fileID?: string; tempFileURL?: string; message?: string }> {
    try {
        // 检查云存储是否可用
        if (typeof wx.cloud === 'undefined' || !wx.cloud.uploadFile) {
            return {
                success: false,
                message: '云存储未初始化',
            };
        }

        // 生成云存储路径：user/{openId}/{timestamp}.jpg
        const timestamp = Date.now();
        const cloudPath = `user/${openId}/${timestamp}.jpg`;

        // 上传文件到云存储
        const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: filePath,
        });

        if (uploadResult.fileID) {
            // 获取临时访问URL
            let tempFileURL = '';
            try {
                const urlResult = await wx.cloud.getTempFileURL({
                    fileList: [uploadResult.fileID],
                });
                if (urlResult.fileList && urlResult.fileList.length > 0) {
                    tempFileURL = urlResult.fileList[0].tempFileURL || uploadResult.fileID;
                }
            } catch (urlError) {
                console.warn('获取临时URL失败，使用fileID:', urlError);
                tempFileURL = uploadResult.fileID;
            }

            return {
                success: true,
                fileID: uploadResult.fileID,
                tempFileURL: tempFileURL,
            };
        } else {
            return {
                success: false,
                message: '上传失败，未返回文件ID',
            };
        }
    } catch (error: any) {
        console.error('上传头像到云存储失败:', error);
        return {
            success: false,
            message: error.message || '上传头像失败',
        };
    }
}

/**
 * 更新用户头像和名称
 * @param avatarUrl 头像URL（云存储fileID或临时URL）
 * @param nickName 昵称
 * @returns 更新结果
 */
export async function updateUserProfile(
    avatarUrl?: string,
    nickName?: string
): Promise<{ success: boolean; message?: string; data?: DBUserInfo }> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '未获取到openId，请先登录',
            };
        }

        const db = initCloudDB();
        const updateData: any = {
            updatedAt: getBeijingTimeISOString(),
        };

        // 只更新提供的字段
        if (avatarUrl !== undefined) {
            updateData.avatarUrl = avatarUrl;
        }
        if (nickName !== undefined) {
            updateData.nickName = nickName;
        }

        // 如果没有云数据库，更新本地存储
        if (!db) {
            const localUser = wx.getStorageSync('user_info') || {};
            const updatedUser = {
                ...localUser,
                ...updateData,
                openId: openId,
            };
            wx.setStorageSync('user_info', updatedUser);
            return {
                success: true,
                message: '用户信息已更新到本地',
                data: updatedUser as DBUserInfo,
            };
        }

        // 使用云数据库更新
        try {
            const userCollection = db.collection('user');

            // 重要：优先使用云开发的 _openid 查询用户，确保同一微信账号每次登录都能找到同一用户
            // 直接查询当前用户（云开发会自动添加 _openid 条件）
            let queryResult = await userCollection.get();

            let existingUser: DBUserInfo | null = null;

            if (queryResult.data && queryResult.data.length > 0) {
                // 优先查找 openId 匹配的用户
                existingUser = queryResult.data.find((user: DBUserInfo) => user.openId === openId) as DBUserInfo;

                // 如果没找到 openId 匹配的，取第一条（因为权限控制，只会返回当前用户的数据）
                if (!existingUser) {
                    existingUser = queryResult.data[0] as DBUserInfo;
                }
            }

            // 如果通过 _openid 查询不到，尝试用 openId 查询（兼容旧数据）
            if (!existingUser) {
                const queryResultByOpenId = await userCollection.where({
                    openId: openId
                }).get();

                if (queryResultByOpenId.data && queryResultByOpenId.data.length > 0) {
                    existingUser = queryResultByOpenId.data[0];
                }
            }

            if (existingUser) {
                // 用户存在，更新信息
                // 如果 openId 不一致，更新 openId 字段以保持一致性
                if (existingUser.openId !== openId) {
                    console.log('发现 openId 不一致，更新 openId 字段', {
                        oldOpenId: existingUser.openId,
                        newOpenId: openId
                    });
                    updateData.openId = openId;
                }
                await userCollection.doc(existingUser._id).update({
                    data: updateData
                });

                const updatedUser = {
                    ...existingUser,
                    ...updateData,
                } as DBUserInfo;

                // 同步到本地存储
                wx.setStorageSync('user_info', updatedUser);

                return {
                    success: true,
                    message: '用户信息已更新',
                    data: updatedUser,
                };
            } else {
                // 用户不存在，创建新用户
                const newUser: any = {
                    openId: openId,
                    nickName: nickName || '',
                    avatarUrl: avatarUrl || '',
                    phoneNumber: '',
                    department: '',
                    email: '',
                    createdAt: getBeijingTimeISOString(),
                    updatedAt: getBeijingTimeISOString(),
                };

                const result = await userCollection.add({
                    data: newUser
                });

                const createdUser = {
                    _id: result._id,
                    ...newUser,
                } as DBUserInfo;

                // 同步到本地存储
                wx.setStorageSync('user_info', createdUser);

                return {
                    success: true,
                    message: '用户信息已创建',
                    data: createdUser,
                };
            }
        } catch (dbError: any) {
            console.warn('云数据库更新失败，使用本地存储:', dbError);
            // 降级到本地存储
            const localUser = wx.getStorageSync('user_info') || {};
            const updatedUser = {
                ...localUser,
                ...updateData,
                openId: openId,
            };
            wx.setStorageSync('user_info', updatedUser);
            return {
                success: true,
                message: '数据库更新失败，已更新到本地',
                data: updatedUser as DBUserInfo,
            };
        }
    } catch (error: any) {
        console.error('更新用户信息失败:', error);
        return {
            success: false,
            message: error.message || '更新用户信息失败',
        };
    }
}

