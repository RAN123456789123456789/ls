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
                }
                wx.showToast({
                    title: message,
                    icon: 'none',
                    duration: 2000,
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
            const failCount = results.length - successCount;

            if (successCount > 0) {
                wx.showToast({
                    title: `成功授权${successCount}个`,
                    icon: 'success',
                });
                this.loadSubscribeStatus();
            }

            if (failCount > 0) {
                setTimeout(() => {
                    wx.showToast({
                        title: `${failCount}个授权失败`,
                        icon: 'none',
                    });
                }, 1500);
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


