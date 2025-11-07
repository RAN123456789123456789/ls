// pages/subscribe/subscribe.ts
import {
    SubscribeMessageType,
    getSubscribeStatus,
    requestSubscribeMessage,
    SubscribeStatus,
} from '../../utils/subscribeMessage';
import { testCheckAndSendReturnReminders } from '../../utils/subscribeScheduler';

Page({
    data: {
        subscribeList: [] as SubscribeStatus[],
        loading: false,
        testing: false,
        testResult: null as {
            success: boolean;
            totalRecords: number;
            recordsChecked: number;
            remindersToSend: Array<{
                bookName: string;
                returnDate: string;
                daysLeft: number;
                openId: string;
                alreadySent: boolean;
                authorized: boolean;
            }>;
            sentCount: number;
            message?: string;
        } | null,
    },

    onLoad() {
        this.loadSubscribeStatus();
    },

    onShow() {
        this.loadSubscribeStatus();
    },

    /**
     * 加载订阅状态
     */
    loadSubscribeStatus() {
        const subscribeList = getSubscribeStatus();
        this.setData({
            subscribeList,
        });
    },

    /**
     * 请求订阅授权
     */
    async onRequestSubscribe(e: any) {
        const { type } = e.currentTarget.dataset;

        if (!type) {
            wx.showToast({
                title: '参数错误',
                icon: 'none',
            });
            return;
        }

        this.setData({ loading: true });

        try {
            const results = await requestSubscribeMessage([type as SubscribeMessageType]);
            const result = results[0];

            if (result.success) {
                wx.showToast({
                    title: '授权成功',
                    icon: 'success',
                });
                this.loadSubscribeStatus();
            } else {
                let message = '授权失败';
                if (result.errMsg === 'reject') {
                    message = '您拒绝了授权';
                } else if (result.errMsg === 'ban') {
                    message = '该功能被禁用';
                } else if (result.errMsg === 'filter') {
                    message = '该订阅消息被过滤，请稍后再试';
                } else if (result.errCode === -3) {
                    message = '模板ID未配置';
                } else if (result.errMsg) {
                    message = `授权失败：${result.errMsg}`;
                }
                wx.showToast({
                    title: message,
                    icon: 'none',
                    duration: 2500,
                });
            }
        } catch (error: any) {
            console.error('请求订阅授权失败:', error);
            wx.showToast({
                title: '授权失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 批量授权所有订阅
     */
    async onRequestAllSubscribe() {
        const needAuth = this.data.subscribeList.filter(item => !item.authorized);

        if (needAuth.length === 0) {
            wx.showToast({
                title: '已全部授权',
                icon: 'success',
            });
            return;
        }

        this.setData({ loading: true });

        try {
            const types = needAuth.map(item => item.type);
            const results = await requestSubscribeMessage(types);

            const successCount = results.filter(r => r.success).length;
            const failResults = results.filter(r => !r.success);
            const failCount = failResults.length;

            if (successCount > 0) {
                wx.showToast({
                    title: `成功授权${successCount}个`,
                    icon: 'success',
                });
                this.loadSubscribeStatus();
            }

            if (failCount > 0) {
                // 找出失败的具体项
                const failedTitles = failResults.map(result => {
                    const item = this.data.subscribeList.find(s => s.type === result.type);
                    return item ? item.title : result.type;
                });

                // 延迟显示失败提示，避免与成功提示重叠
                setTimeout(() => {
                    let failMessage = `${failCount}个授权失败`;

                    // 如果只有一个失败，显示具体名称
                    if (failCount === 1 && failedTitles.length > 0) {
                        failMessage = `${failedTitles[0]}授权失败`;

                        // 根据错误类型给出更具体的提示
                        const failResult = failResults[0];
                        if (failResult.errMsg === 'reject') {
                            failMessage = `您拒绝了${failedTitles[0]}的授权`;
                        } else if (failResult.errMsg === 'ban') {
                            failMessage = `${failedTitles[0]}功能被禁用`;
                        }
                    }

                    wx.showToast({
                        title: failMessage,
                        icon: 'none',
                        duration: 3000,
                    });
                }, successCount > 0 ? 1500 : 0);
            }
        } catch (error: any) {
            console.error('批量授权失败:', error);
            wx.showToast({
                title: '授权失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 测试：手动触发检查归还提醒
     */
    async onTestCheckReminders() {
        this.setData({ testing: true, testResult: null });

        try {
            const result = await testCheckAndSendReturnReminders();
            this.setData({ testResult: result });

            wx.showToast({
                title: result.message || '检查完成',
                icon: result.success ? 'success' : 'none',
                duration: 3000,
            });
        } catch (error: any) {
            console.error('测试检查失败:', error);
            wx.showToast({
                title: '测试失败，请查看控制台',
                icon: 'none',
                duration: 2000,
            });
        } finally {
            this.setData({ testing: false });
        }
    },
});


