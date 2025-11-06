/**
 * 订阅消息工具类
 * 用于管理订阅消息的授权和发送
 */

// 订阅消息模板类型
export enum SubscribeMessageType {
    /** 借阅成功通知 */
    BORROW_SUCCESS = 'BORROW_SUCCESS',
    /** 归还提醒通知 */
    RETURN_REMINDER = 'RETURN_REMINDER',
    /** 逾期提醒通知 */
    OVERDUE_REMINDER = 'OVERDUE_REMINDER',
    /** 归还成功通知 */
    RETURN_SUCCESS = 'RETURN_SUCCESS',
}

// 订阅消息模板配置
// 
// ⚠️ 重要配置步骤：
// 1. 登录微信公众平台：https://mp.weixin.qq.com/
// 2. 进入"功能" -> "订阅消息"
// 3. 申请以下4个订阅消息模板，并将获取到的模板ID替换到下面的配置中
//
// 模板字段配置参考：
// - 借阅成功通知：图书名称(thing1)、借阅日期(date2)、归还日期(date3)、借阅编号(character_string4)
// - 归还提醒通知：图书名称(thing1)、归还日期(date2)、剩余天数(number3)、借阅编号(character_string4)
// - 逾期提醒通知：图书名称(thing1)、应归还日期(date2)、逾期天数(number3)、借阅编号(character_string4)
// - 归还成功通知：图书名称(thing1)、归还日期(date2)、借阅编号(character_string3)
//
// 4. 配置后端API地址（在 subscribeService.ts 中修改 API_BASE_URL）
// 5. 后端需要实现 POST /api/subscribe/send 接口来发送订阅消息
//
export const SUBSCRIBE_MESSAGE_TEMPLATES: Record<SubscribeMessageType, {
    templateId: string;
    title: string;
    description: string;
}> = {
    [SubscribeMessageType.BORROW_SUCCESS]: {
        templateId: 'Ya0w7HLKqR8sffQ8YsR5eWf8-5vTO7GKFjTTmvek-Dg', // ✅ 已配置：借阅成功通知
        title: '借阅成功通知',
        description: '当您成功借阅图书时，我们会及时通知您',
    },
    [SubscribeMessageType.RETURN_REMINDER]: {
        templateId: 'Ya0w7HLKqR8sffQ8YsR5eVKuxoGeRtCp-53iadgUMTg', // ✅ 已配置：归还提醒通知（使用归还成功模板）
        title: '归还提醒通知',
        description: '在归还日期前提醒您及时归还图书',
    },
    [SubscribeMessageType.OVERDUE_REMINDER]: {
        templateId: 'Ya0w7HLKqR8sffQ8YsR5efyuXdj_R1dubgURiRp2b8c', // ✅ 已配置：逾期提醒通知
        title: '逾期提醒通知',
        description: '当图书逾期时，我们会提醒您尽快归还',
    },
    [SubscribeMessageType.RETURN_SUCCESS]: {
        templateId: 'Ya0w7HLKqR8sffQ8YsR5eVKuxoGeRtCp-53iadgUMTg', // ✅ 已配置：归还成功通知
        title: '归还成功通知',
        description: '当您成功归还图书时，我们会及时通知您',
    },
};

// 订阅授权结果
export interface SubscribeAuthResult {
    success: boolean;
    type: SubscribeMessageType;
    templateId: string;
    errMsg?: string;
    errCode?: number;
}

// 订阅状态
export interface SubscribeStatus {
    type: SubscribeMessageType;
    authorized: boolean;
    templateId: string;
    title: string;
    description: string;
}

/**
 * 检查模板ID是否已配置
 * @param type 订阅消息类型
 * @returns 是否已配置
 */
function isTemplateIdConfigured(type: SubscribeMessageType): boolean {
    const templateId = SUBSCRIBE_MESSAGE_TEMPLATES[type].templateId;
    // 检查是否是占位符
    return templateId &&
        !templateId.startsWith('YOUR_') &&
        !templateId.includes('TEMPLATE_ID') &&
        templateId.length > 10; // 微信模板ID通常比较长
}

/**
 * 请求订阅消息授权
 * @param types 需要授权的订阅消息类型数组
 * @returns 授权结果数组
 */
export async function requestSubscribeMessage(
    types: SubscribeMessageType[]
): Promise<SubscribeAuthResult[]> {
    const results: SubscribeAuthResult[] = [];

    // 检查是否支持订阅消息
    if (!wx.canIUse('requestSubscribeMessage')) {
        wx.showToast({
            title: '当前微信版本不支持订阅消息',
            icon: 'none',
        });
        return results;
    }

    // 检查模板ID是否已配置
    const configuredTypes = types.filter(type => isTemplateIdConfigured(type));
    const unconfiguredTypes = types.filter(type => !isTemplateIdConfigured(type));

    // 如果有未配置的模板ID，返回失败结果
    unconfiguredTypes.forEach(type => {
        results.push({
            success: false,
            type,
            templateId: SUBSCRIBE_MESSAGE_TEMPLATES[type].templateId,
            errMsg: '模板ID未配置，请在微信公众平台申请订阅消息模板',
            errCode: -3,
        });
    });

    // 如果没有已配置的模板，直接返回
    if (configuredTypes.length === 0) {
        console.warn('所有订阅消息模板ID均未配置，请先在微信公众平台申请模板');
        return results;
    }

    // 构建模板ID数组（只包含已配置的）
    const tmplIds = configuredTypes.map(type => SUBSCRIBE_MESSAGE_TEMPLATES[type].templateId);

    try {
        const res = await new Promise<WechatMiniprogram.RequestSubscribeMessageSuccessCallbackResult>(
            (resolve, reject) => {
                wx.requestSubscribeMessage({
                    tmplIds,
                    success: resolve,
                    fail: reject,
                });
            }
        );

        // 处理授权结果（只处理已配置的模板）
        configuredTypes.forEach((type, index) => {
            const templateId = tmplIds[index];
            const status = res[templateId];

            results.push({
                success: status === 'accept',
                type,
                templateId,
                errMsg: status === 'accept' ? undefined : status,
                errCode: status === 'accept' ? undefined : (status === 'reject' ? -1 : -2),
            });
        });

        // 保存授权状态到本地存储
        saveSubscribeStatus(results);

        return results;
    } catch (error: any) {
        console.error('请求订阅消息授权失败:', error);

        // 检查是否是模板ID错误
        if (error.errCode === 20001 || (error.errMsg && error.errMsg.includes('template'))) {
            console.warn('订阅消息模板ID未配置或无效，请先在微信公众平台申请模板');
            // 不显示错误提示，因为这是配置问题，不是用户操作问题
        } else {
            wx.showToast({
                title: '授权失败，请稍后重试',
                icon: 'none',
            });
        }

        // 为已配置的模板添加错误结果
        configuredTypes.forEach(type => {
            results.push({
                success: false,
                type,
                templateId: SUBSCRIBE_MESSAGE_TEMPLATES[type].templateId,
                errMsg: error.errMsg || '未知错误',
                errCode: error.errCode,
            });
        });

        return results;
    }
}

/**
 * 保存订阅状态到本地存储
 */
function saveSubscribeStatus(results: SubscribeAuthResult[]): void {
    try {
        const savedStatus = wx.getStorageSync('subscribe_status') || {};

        results.forEach(result => {
            if (result.success) {
                savedStatus[result.type] = {
                    authorized: true,
                    authorizedAt: Date.now(),
                };
            }
        });

        wx.setStorageSync('subscribe_status', savedStatus);
    } catch (error) {
        console.error('保存订阅状态失败:', error);
    }
}

/**
 * 获取订阅状态
 * @returns 订阅状态数组
 */
export function getSubscribeStatus(): SubscribeStatus[] {
    const savedStatus = wx.getStorageSync('subscribe_status') || {};

    return Object.values(SubscribeMessageType).map(type => {
        const template = SUBSCRIBE_MESSAGE_TEMPLATES[type];
        const status = savedStatus[type] || {};

        return {
            type,
            authorized: status.authorized === true,
            templateId: template.templateId,
            title: template.title,
            description: template.description,
        };
    });
}

/**
 * 检查订阅状态
 * @param type 订阅消息类型
 * @returns 是否已授权
 */
export function checkSubscribeStatus(type: SubscribeMessageType): boolean {
    const savedStatus = wx.getStorageSync('subscribe_status') || {};
    return savedStatus[type]?.authorized === true;
}

/**
 * 清除订阅状态
 */
export function clearSubscribeStatus(): void {
    try {
        wx.removeStorageSync('subscribe_status');
    } catch (error) {
        console.error('清除订阅状态失败:', error);
    }
}

/**
 * 批量请求订阅授权（用于关键操作前）
 * @param types 需要授权的订阅消息类型数组
 * @param showGuide 是否显示引导提示
 */
export async function requestSubscribeBeforeAction(
    types: SubscribeMessageType[],
    showGuide: boolean = true
): Promise<boolean> {
    // 检查模板ID是否已配置
    const configuredTypes = types.filter(type => isTemplateIdConfigured(type));

    // 如果所有模板都未配置，直接返回true（不阻止操作）
    if (configuredTypes.length === 0) {
        console.warn('订阅消息模板ID未配置，跳过授权请求');
        return true; // 返回true，不阻止后续操作
    }

    // 检查是否已有授权（只检查已配置的模板）
    const needAuth = configuredTypes.filter(type => !checkSubscribeStatus(type));

    if (needAuth.length === 0) {
        return true; // 已有授权
    }

    if (showGuide) {
        const needAuthTitles = needAuth.map(type =>
            SUBSCRIBE_MESSAGE_TEMPLATES[type].title
        ).join('、');

        const res = await new Promise<boolean>((resolve) => {
            wx.showModal({
                title: '订阅消息',
                content: `为了及时通知您${needAuthTitles}，需要您的授权`,
                confirmText: '立即授权',
                cancelText: '稍后再说',
                success: (modalRes) => {
                    resolve(modalRes.confirm);
                },
                fail: () => {
                    resolve(false);
                },
            });
        });

        if (!res) {
            return false;
        }
    }

    // 请求授权
    const results = await requestSubscribeMessage(needAuth);

    // 过滤掉模板ID未配置的错误（这些不算真正的失败）
    const realFailures = results.filter(r => r.errCode !== -3);
    const allSuccess = realFailures.length === 0 || realFailures.every(r => r.success);

    if (allSuccess && realFailures.length > 0) {
        wx.showToast({
            title: '授权成功',
            icon: 'success',
        });
    } else if (!allSuccess) {
        const failedCount = realFailures.filter(r => !r.success).length;
        if (failedCount > 0) {
            wx.showToast({
                title: `${failedCount}个授权失败`,
                icon: 'none',
            });
        }
    }

    // 即使部分失败，也返回true，不阻止后续操作
    return true;
}


