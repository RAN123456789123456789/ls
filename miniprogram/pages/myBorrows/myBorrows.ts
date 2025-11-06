// pages/myBorrows/myBorrows.ts
import { getMyBorrowRequests, BorrowRequestRecord, BorrowRequestStatus } from '../../utils/borrowRequestService';
import { sendReturnSuccessNotification } from '../../utils/subscribeService';
import { getUserOpenId, isUserLoggedIn } from '../../utils/userService';

Page({
    data: {
        records: [] as BorrowRequestRecord[],
        loading: false,
        loginCheckShown: false, // 登录检查标志，防止重复弹出
    },

    onLoad() {
        // 检查登录状态
        this.checkLoginAndLoad();
    },

    /**
     * 检查登录状态并加载数据
     */
    checkLoginAndLoad() {
        if (!isUserLoggedIn()) {
            // 如果已经显示过登录提示，不再重复显示
            if (this.data.loginCheckShown) {
                return;
            }
            this.setData({ loginCheckShown: true });

            wx.showModal({
                title: '提示',
                content: '请先登录后再查看借阅记录',
                showCancel: true,
                confirmText: '去登录',
                cancelText: '取消',
                success: (res) => {
                    this.setData({ loginCheckShown: false });
                    if (res.confirm) {
                        // 跳转到个人中心页面进行登录
                        wx.switchTab({
                            url: '/pages/mine/mine',
                        });
                    } else {
                        // 用户取消，返回上一页
                        wx.navigateBack();
                    }
                },
                fail: () => {
                    this.setData({ loginCheckShown: false });
                    // 如果模态框显示失败，直接返回上一页
                    wx.navigateBack();
                },
            });
            return;
        }

        // 已登录，加载记录
        this.loadRecords();
    },

    onShow() {
        // 每次显示时检查登录状态
        if (!isUserLoggedIn()) {
            // 如果未登录，清空记录
            this.setData({
                records: [],
            });
            // 如果未显示过提示，重新检查
            if (!this.data.loginCheckShown) {
                this.checkLoginAndLoad();
            }
            return;
        }

        // 已登录，重置标志并刷新记录
        if (this.data.loginCheckShown) {
            this.setData({ loginCheckShown: false });
        }
        // 每次显示时刷新
        this.loadRecords();
    },

    /**
     * 加载借阅记录（从message集合读取）
     */
    async loadRecords() {
        this.setData({ loading: true });

        try {
            console.log('归还界面：从message集合加载我的借阅记录...');
            const result = await getMyBorrowRequests();

            if (result.success && result.data) {
                // 显示所有状态的记录（从数据库读取，只显示当前用户的）
                // 按创建时间倒序排序，并添加天数信息和状态文本
                const sortedRecords = result.data.sort((a, b) => {
                    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    return dateB - dateA;
                }).map((record: BorrowRequestRecord) => {
                    const daysInfo = record.returnDate ? this.getDaysInfo(record.returnDate) : { text: '-', type: 'normal' as const };
                    return {
                        ...record,
                        daysText: daysInfo.text,
                        daysType: daysInfo.type,
                        statusText: this.getStatusText(record.status),
                    };
                });

                console.log(`我的借阅记录：加载到${sortedRecords.length}条记录`);

                this.setData({
                    records: sortedRecords,
                });
            } else {
                wx.showToast({
                    title: result.message || '加载失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            console.error('加载借阅记录失败:', error);
            wx.showToast({
                title: '加载失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 计算剩余天数或逾期天数
     */
    getDaysInfo(returnDate: string): { text: string; type: 'normal' | 'warning' | 'danger' } {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const returnDateObj = new Date(returnDate);
        returnDateObj.setHours(0, 0, 0, 0);

        const diffTime = returnDateObj.getTime() - today.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return {
                text: `逾期${Math.abs(diffDays)}天`,
                type: 'danger',
            };
        } else if (diffDays === 0) {
            return {
                text: '今天到期',
                type: 'warning',
            };
        } else if (diffDays <= 3) {
            return {
                text: `剩余${diffDays}天`,
                type: 'warning',
            };
        } else {
            return {
                text: `剩余${diffDays}天`,
                type: 'normal',
            };
        }
    },

    /**
     * 获取状态文本
     */
    getStatusText(status: BorrowRequestStatus): string {
        const statusMap = {
            [BorrowRequestStatus.PENDING]: '待审核',
            [BorrowRequestStatus.APPROVED]: '同意',
            [BorrowRequestStatus.REJECTED]: '拒绝',
            [BorrowRequestStatus.BORROWED]: '已借出',
            [BorrowRequestStatus.RETURNED]: '已归还',
            [BorrowRequestStatus.COMPLETED]: '已完成',
        };
        return statusMap[status] || '未知';
    },

    /**
     * 申请归还图书（提交归还申请）
     */
    async onReturn(e: any) {
        // 检查登录状态
        if (!isUserLoggedIn()) {
            wx.showModal({
                title: '提示',
                content: '请先登录后再进行归还操作',
                showCancel: true,
                confirmText: '去登录',
                cancelText: '取消',
                success: (res) => {
                    if (res.confirm) {
                        // 跳转到个人中心页面进行登录
                        wx.switchTab({
                            url: '/pages/mine/mine',
                        });
                    }
                },
            });
            return;
        }

        const { recordid, bookname } = e.currentTarget.dataset;
        const record = this.data.records.find(r => r.id === recordid);

        if (!record) {
            return;
        }

        // 检查状态，只有已借出的才能申请归还
        if (record.status !== BorrowRequestStatus.BORROWED) {
            wx.showToast({
                title: '该记录状态不允许归还',
                icon: 'none',
            });
            return;
        }

        wx.showModal({
            title: '申请归还',
            content: `确定要申请归还《${bookname}》吗？\n管理员确认后即可完成归还。`,
            success: async (res) => {
                if (res.confirm) {
                    wx.showLoading({
                        title: '提交归还申请中...',
                    });

                    try {
                        // 调用归还申请接口（更新message集合状态为"待归还"或直接设置为"已归还"）
                        // 这里我们更新message集合，将状态改为RETURNED（已归还）
                        const { confirmReturn } = require('../../utils/borrowRequestService');
                        const result = await confirmReturn(recordid);

                        if (result.success) {
                            // 发送归还成功通知
                            const openId = await getUserOpenId();
                            if (openId && result.data) {
                                const returnDate = result.data.returnDate || new Date().toISOString().split('T')[0];
                                try {
                                    await sendReturnSuccessNotification(
                                        openId,
                                        bookname,
                                        returnDate,
                                        recordid,
                                        'pages/myBorrows/myBorrows',
                                        true // 请求权限
                                    );
                                } catch (subscribeError: any) {
                                    console.warn('发送归还成功通知失败:', subscribeError);
                                }
                            }

                            wx.hideLoading();
                            wx.showToast({
                                title: '归还申请已提交',
                                icon: 'success',
                            });

                            // 刷新列表
                            await this.loadRecords();
                        } else {
                            wx.hideLoading();
                            wx.showToast({
                                title: result.message || '归还申请失败',
                                icon: 'none',
                            });
                        }
                    } catch (error: any) {
                        wx.hideLoading();
                        console.error('归还申请失败:', error);
                        wx.showToast({
                            title: '归还申请失败，请稍后重试',
                            icon: 'none',
                        });
                    }
                }
            },
        });
    },

    /**
     * 跳转到图书列表
     */
    goToBooks() {
        wx.switchTab({
            url: '/pages/books/books',
        });
    },

    /**
     * 下拉刷新
     */
    onPullDownRefresh() {
        this.loadRecords().finally(() => {
            wx.stopPullDownRefresh();
        });
    },
});

