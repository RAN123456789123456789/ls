/**
 * 订阅消息发送服务
 * 用于调用后端API发送订阅消息
 */

import { SubscribeMessageType, SUBSCRIBE_MESSAGE_TEMPLATES, requestSubscribeMessage } from './subscribeMessage';

// 订阅消息数据接口
export interface SubscribeMessageData {
    /** 借阅成功通知数据 */
    borrowSuccess?: {
        bookName: string; // 图书名称
        borrowDate: string; // 借阅日期，格式：YYYY-MM-DD
        returnDate: string; // 归还日期，格式：YYYY-MM-DD
        borrowNumber?: string; // 借阅编号
    };

    /** 归还提醒通知数据 */
    returnReminder?: {
        bookName: string; // 图书名称
        returnDate: string; // 归还日期，格式：YYYY-MM-DD
        daysLeft: number; // 剩余天数
        borrowNumber?: string; // 借阅编号
    };

    /** 逾期提醒通知数据 */
    overdueReminder?: {
        bookName: string; // 图书名称
        returnDate: string; // 应归还日期，格式：YYYY-MM-DD
        overdueDays: number; // 逾期天数
        borrowNumber?: string; // 借阅编号
    };

    /** 归还成功通知数据 */
    returnSuccess?: {
        bookName: string; // 图书名称
        returnDate: string; // 归还日期，格式：YYYY-MM-DD
        borrowNumber?: string; // 借阅编号
    };
}

// 发送订阅消息的参数
export interface SendSubscribeMessageParams {
    type: SubscribeMessageType;
    openId: string; // 用户openId
    data: SubscribeMessageData;
    page?: string; // 点击消息后跳转的页面路径
}

// 后端API配置
// 
// ⚠️ 重要：请根据实际后端API地址修改
// 
// 后端需要实现以下接口：
// POST /api/subscribe/send
// 
// 请求参数：
// {
//   "openId": "用户openId",
//   "templateId": "订阅消息模板ID",
//   "page": "点击消息后跳转的页面路径（可选）",
//   "data": {
//     "thing1": { "value": "图书名称" },
//     "date2": { "value": "2024-01-01" },
//     ...
//   }
// }
//
// 后端需要使用 access_token 调用微信API发送订阅消息：
// POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=ACCESS_TOKEN
//
// 后端API配置
// 方式1：使用公网域名（HTTP请求）- 当前使用此方式
const API_BASE_URL = 'https://ranguofang.com/api'; // ⚠️ 已配置，如需修改请替换

// 方式2：使用云开发调用（推荐，更安全）
// 如果使用云开发调用，请取消下面的注释并注释掉上面的 HTTP 请求方式
// const USE_CLOUD_CONTAINER = true;
const CLOUD_ENV = 'prod-6gmcy24t5104ded1'; // 云环境ID（备用，用于云开发调用）
const CLOUD_SERVICE = 'express-bec5'; // 云服务名称（备用，用于云开发调用）

/**
 * 请求订阅消息权限（从底部弹出权限窗口）
 * @param types 需要请求权限的订阅消息类型数组
 * @returns 是否授权成功
 */
export async function requestSubscribePermission(
    types: SubscribeMessageType[]
): Promise<boolean> {
    try {
        // 检查是否支持订阅消息
        if (!wx.canIUse('requestSubscribeMessage')) {
            wx.showToast({
                title: '当前微信版本不支持订阅消息',
                icon: 'none',
            });
            return false;
        }

        // 请求权限（从底部弹出窗口）
        const results = await requestSubscribeMessage(types);
        const allSuccess = results.every(r => r.success);

        if (allSuccess) {
            return true;
        } else {
            const failedCount = results.filter(r => !r.success).length;
            console.warn(`${failedCount}个订阅消息授权失败`);
            return false;
        }
    } catch (error: any) {
        console.error('请求订阅消息权限失败:', error);
        return false;
    }
}

/**
 * 检查模板ID是否已配置
 */
function isTemplateIdConfigured(type: SubscribeMessageType): boolean {
    const templateId = SUBSCRIBE_MESSAGE_TEMPLATES[type].templateId;
    return templateId &&
        !templateId.startsWith('YOUR_') &&
        !templateId.includes('TEMPLATE_ID') &&
        templateId.length > 10;
}

/**
 * 发送订阅消息（调用后端API）
 * 注意：实际的订阅消息发送需要在后端完成，因为需要使用access_token
 * 这个方法会调用后端API，由后端调用微信API发送订阅消息
 * 发送前会自动请求权限（从底部弹出权限窗口）
 */
export async function sendSubscribeMessage(
    params: SendSubscribeMessageParams,
    requestPermission: boolean = true
): Promise<{ success: boolean; message?: string }> {
    const { type, openId, data, page } = params;
    const template = SUBSCRIBE_MESSAGE_TEMPLATES[type];

    // 检查模板ID是否已配置
    if (!isTemplateIdConfigured(type)) {
        console.warn(`订阅消息模板ID未配置: ${type}，跳过发送`);
        return {
            success: false,
            message: '订阅消息模板ID未配置',
        };
    }

    try {
        // 如果需要，先请求权限（从底部弹出权限窗口）
        if (requestPermission) {
            const hasPermission = await requestSubscribePermission([type]);
            if (!hasPermission) {
                return {
                    success: false,
                    message: '用户未授权订阅消息',
                };
            }
        }
        // 获取用户的openId（如果未提供）
        let userOpenId = openId;
        if (!userOpenId) {
            const loginRes = await new Promise<WechatMiniprogram.LoginSuccessCallbackResult>(
                (resolve, reject) => {
                    wx.login({
                        success: resolve,
                        fail: reject,
                    });
                }
            );

            // 调用后端接口获取openId
            // 这里需要根据实际后端接口实现
            // userOpenId = await getOpenIdFromServer(loginRes.code);
        }

        if (!userOpenId) {
            return {
                success: false,
                message: '无法获取用户ID',
            };
        }

        // 构建请求数据
        const requestData = {
            openId: userOpenId,
            templateId: template.templateId,
            page: page || 'pages/index/index',
            data: buildTemplateData(type, data),
        };

        // 调用后端API发送订阅消息
        // 优先使用云开发调用方式（如果配置了）
        let res: any;

        // @ts-ignore
        if (typeof USE_CLOUD_CONTAINER !== 'undefined' && USE_CLOUD_CONTAINER && wx.cloud && wx.cloud.callContainer) {
            // 使用云开发调用
            try {
                const cloudRes = await new Promise<any>((resolve, reject) => {
                    // @ts-ignore
                    wx.cloud.callContainer({
                        config: {
                            env: CLOUD_ENV || 'prod-6gmcy24t5104ded1',
                        },
                        path: '/api/subscribe/send',
                        method: 'POST',
                        header: {
                            'X-WX-SERVICE': CLOUD_SERVICE || 'express-bec5',
                            'content-type': 'application/json',
                        },
                        data: requestData,
                        success: resolve,
                        fail: reject,
                    });
                });
                res = cloudRes.data || cloudRes;
            } catch (cloudError: any) {
                console.error('云开发调用失败:', cloudError);
                throw cloudError;
            }
        } else {
            // 使用HTTP请求方式
            res = await new Promise<any>((resolve, reject) => {
                wx.request({
                    url: `${API_BASE_URL}/subscribe/send`,
                    method: 'POST',
                    data: requestData,
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
        }

        if (res.success) {
            return {
                success: true,
                message: '订阅消息发送成功',
            };
        } else {
            return {
                success: false,
                message: res.message || '发送失败',
            };
        }
    } catch (error: any) {
        console.error('发送订阅消息失败:', error);
        return {
            success: false,
            message: error.message || '发送失败，请稍后重试',
        };
    }
}

/**
 * 构建模板数据
 * 根据订阅消息类型和业务数据构建微信模板数据格式
 */
function buildTemplateData(
    type: SubscribeMessageType,
    data: SubscribeMessageData
): Record<string, { value: string }> {
    switch (type) {
        case SubscribeMessageType.BORROW_SUCCESS:
            if (!data.borrowSuccess) {
                throw new Error('缺少借阅成功数据');
            }
            return {
                thing1: { value: data.borrowSuccess.bookName }, // 图书名称
                date2: { value: data.borrowSuccess.borrowDate }, // 借阅日期
                date3: { value: data.borrowSuccess.returnDate }, // 归还日期
                character_string4: { value: data.borrowSuccess.borrowNumber || '' }, // 借阅编号（可选）
            };

        case SubscribeMessageType.RETURN_REMINDER:
            if (!data.returnReminder) {
                throw new Error('缺少归还提醒数据');
            }
            return {
                thing1: { value: data.returnReminder.bookName }, // 图书名称
                date2: { value: data.returnReminder.returnDate }, // 归还日期
                number3: { value: data.returnReminder.daysLeft.toString() }, // 剩余天数
                character_string4: { value: data.returnReminder.borrowNumber || '' }, // 借阅编号（可选）
            };

        case SubscribeMessageType.OVERDUE_REMINDER:
            if (!data.overdueReminder) {
                throw new Error('缺少逾期提醒数据');
            }
            return {
                thing1: { value: data.overdueReminder.bookName }, // 图书名称
                date2: { value: data.overdueReminder.returnDate }, // 应归还日期
                number3: { value: data.overdueReminder.overdueDays.toString() }, // 逾期天数
                character_string4: { value: data.overdueReminder.borrowNumber || '' }, // 借阅编号（可选）
            };

        case SubscribeMessageType.RETURN_SUCCESS:
            if (!data.returnSuccess) {
                throw new Error('缺少归还成功数据');
            }
            return {
                thing1: { value: data.returnSuccess.bookName }, // 图书名称
                date2: { value: data.returnSuccess.returnDate }, // 归还日期
                character_string3: { value: data.returnSuccess.borrowNumber || '' }, // 借阅编号（可选）
            };

        default:
            throw new Error(`未知的订阅消息类型: ${type}`);
    }
}

/**
 * 发送借阅成功通知
 * @param requestPermission 是否请求权限（默认true，从底部弹出权限窗口）
 */
export async function sendBorrowSuccessNotification(
    openId: string,
    bookName: string,
    borrowDate: string,
    returnDate: string,
    borrowNumber?: string,
    page?: string,
    requestPermission: boolean = true
): Promise<{ success: boolean; message?: string }> {
    return sendSubscribeMessage({
        type: SubscribeMessageType.BORROW_SUCCESS,
        openId,
        data: {
            borrowSuccess: {
                bookName,
                borrowDate,
                returnDate,
                borrowNumber,
            },
        },
        page,
    }, requestPermission);
}

/**
 * 发送归还提醒通知
 * @param requestPermission 是否请求权限（默认false，因为通常在后台自动发送）
 */
export async function sendReturnReminderNotification(
    openId: string,
    bookName: string,
    returnDate: string,
    daysLeft: number,
    borrowNumber?: string,
    page?: string,
    requestPermission: boolean = false
): Promise<{ success: boolean; message?: string }> {
    return sendSubscribeMessage({
        type: SubscribeMessageType.RETURN_REMINDER,
        openId,
        data: {
            returnReminder: {
                bookName,
                returnDate,
                daysLeft,
                borrowNumber,
            },
        },
        page,
    }, requestPermission);
}

/**
 * 发送逾期提醒通知
 * @param requestPermission 是否请求权限（默认false，因为通常在后台自动发送）
 */
export async function sendOverdueReminderNotification(
    openId: string,
    bookName: string,
    returnDate: string,
    overdueDays: number,
    borrowNumber?: string,
    page?: string,
    requestPermission: boolean = false
): Promise<{ success: boolean; message?: string }> {
    return sendSubscribeMessage({
        type: SubscribeMessageType.OVERDUE_REMINDER,
        openId,
        data: {
            overdueReminder: {
                bookName,
                returnDate,
                overdueDays,
                borrowNumber,
            },
        },
        page,
    }, requestPermission);
}

/**
 * 发送归还成功通知
 * @param requestPermission 是否请求权限（默认true，从底部弹出权限窗口）
 */
export async function sendReturnSuccessNotification(
    openId: string,
    bookName: string,
    returnDate: string,
    borrowNumber?: string,
    page?: string,
    requestPermission: boolean = true
): Promise<{ success: boolean; message?: string }> {
    return sendSubscribeMessage({
        type: SubscribeMessageType.RETURN_SUCCESS,
        openId,
        data: {
            returnSuccess: {
                bookName,
                returnDate,
                borrowNumber,
            },
        },
        page,
    }, requestPermission);
}


