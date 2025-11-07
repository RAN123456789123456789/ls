// pages/adminReview/adminReview.ts
import { getAllBorrowRequests, reviewBorrowRequest, confirmBorrow, confirmReturn, BorrowRequestRecord, BorrowRequestStatus } from '../../utils/borrowRequestService';
import { isAdmin } from '../../utils/adminService';
import { getBeijingTime, formatDate } from '../../utils/util';
import {
    sendBorrowSuccessNotification,
    sendReturnSuccessNotification,
    sendOverdueReminderNotification
} from '../../utils/subscribeService';
import { getUserOpenId } from '../../utils/userService';

Page({
    data: {
        requests: [] as BorrowRequestRecord[],
        filteredRequests: [] as BorrowRequestRecord[], // 筛选后的申请列表
        loading: false,
        currentTab: 'pending' as 'pending' | 'approved' | 'borrowed' | 'returned',
        // 确认借出弹窗相关
        showBorrowModal: false,
        currentBorrowRequestId: '', // 当前要借出的申请ID
        archiveNumbers: [''] as string[], // 档号列表
        borrowReason: '', // 借出理由
    },

    onLoad() {
        // 检查是否是管理员
        if (!isAdmin()) {
            wx.showModal({
                title: '权限不足',
                content: '此功能仅限管理员使用',
                showCancel: false,
                success: () => {
                    wx.navigateBack();
                },
            });
            return;
        }
        this.loadRequests();
    },

    onShow() {
        if (isAdmin()) {
            this.loadRequests();
        }
    },

    /**
     * 检查并发送逾期提醒
     */
    async checkAndSendOverdueReminders(requests: BorrowRequestRecord[]) {
        const today = getBeijingTime();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDate(today);

        // 检查所有已借出但未归还的记录
        const borrowedRecords = requests.filter(r =>
            r.status === BorrowRequestStatus.BORROWED &&
            r.returnDate
        );

        for (const record of borrowedRecords) {
            if (!record.returnDate) continue;

            const returnDate = new Date(record.returnDate);
            returnDate.setHours(0, 0, 0, 0);

            // 检查是否已过期
            if (returnDate < today) {
                const overdueDays = Math.floor((today.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24));

                if (overdueDays > 0) {
                    // 检查今天是否已发送过逾期提醒
                    const reminderKey = `admin_${record.id}_overdue_${todayStr}`;
                    const sentReminders = wx.getStorageSync('sent_overdue_reminders') || {};

                    if (!sentReminders[reminderKey]) {
                        // 发送逾期提醒（不请求权限，后台发送）
                        try {
                            await sendOverdueReminderNotification(
                                record.openId,
                                record.bookName,
                                record.returnDate,
                                overdueDays,
                                record.id,
                                'pages/myBorrows/myBorrows',
                                false // 不请求权限，后台发送
                            );

                            // 记录已发送
                            sentReminders[reminderKey] = true;
                            wx.setStorageSync('sent_overdue_reminders', sentReminders);
                            console.log(`已发送逾期提醒: ${record.bookName}, 逾期${overdueDays}天`);
                        } catch (err: any) {
                            console.warn(`发送逾期提醒失败: ${record.bookName}`, err);
                        }
                    }
                }
            }
        }
    },

    /**
     * 加载借阅申请列表（从message集合同步）
     */
    async loadRequests() {
        this.setData({ loading: true });

        try {
            console.log('管理员审核页面：开始从message集合加载申请列表...');
            const result = await getAllBorrowRequests();

            if (result.success && result.data) {
                // 格式化日期时间
                const formattedRequests = result.data.map((req: BorrowRequestRecord) => {
                    return {
                        ...req,
                        formattedCreatedAt: this.formatDate(req.createdAt),
                    };
                });

                console.log(`管理员审核页面：成功加载${formattedRequests.length}条申请`);
                console.log('申请状态分布:', {
                    pending: formattedRequests.filter(r => r.status === 'pending').length,
                    approved: formattedRequests.filter(r => r.status === 'approved').length,
                    borrowed: formattedRequests.filter(r => r.status === 'borrowed').length,
                    returned: formattedRequests.filter(r => r.status === 'returned').length,
                    rejected: formattedRequests.filter(r => r.status === 'rejected').length,
                });

                // 检查并发送逾期提醒
                await this.checkAndSendOverdueReminders(formattedRequests);

                // 同时设置筛选后的列表
                const filtered = this.getFilteredRequestsFromData(formattedRequests, this.data.currentTab);
                console.log(`当前标签页"${this.data.currentTab}"筛选后显示${filtered.length}条申请`);

                this.setData({
                    requests: formattedRequests,
                    filteredRequests: filtered,
                });
            } else {
                console.error('管理员审核页面：加载失败', result.message);
                wx.showToast({
                    title: result.message || '加载失败',
                    icon: 'none',
                    duration: 2000,
                });
            }
        } catch (error: any) {
            console.error('管理员审核页面：加载申请列表异常:', error);
            wx.showToast({
                title: '加载失败，请稍后重试',
                icon: 'none',
                duration: 2000,
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 获取筛选后的申请列表（根据当前标签页）
     */
    getFilteredRequests(): BorrowRequestRecord[] {
        return this.data.filteredRequests;
    },

    /**
     * 从数据中筛选申请列表（辅助函数）
     */
    getFilteredRequestsFromData(requests: BorrowRequestRecord[], tab: string): BorrowRequestRecord[] {
        return requests.filter(r => r.status === tab);
    },

    /**
     * 获取状态文本
     */
    getStatusText(status: BorrowRequestStatus): string {
        const statusMap = {
            [BorrowRequestStatus.PENDING]: '待审核',
            [BorrowRequestStatus.APPROVED]: '已批准',
            [BorrowRequestStatus.REJECTED]: '已拒绝',
            [BorrowRequestStatus.BORROWED]: '已借出',
            [BorrowRequestStatus.RETURNED]: '已归还',
            [BorrowRequestStatus.COMPLETED]: '已完成',
        };
        return statusMap[status] || '未知';
    },

    /**
     * 获取状态样式类
     */
    getStatusClass(status: BorrowRequestStatus): string {
        const classMap = {
            [BorrowRequestStatus.PENDING]: 'status-pending',
            [BorrowRequestStatus.APPROVED]: 'status-approved',
            [BorrowRequestStatus.REJECTED]: 'status-rejected',
            [BorrowRequestStatus.BORROWED]: 'status-borrowed',
            [BorrowRequestStatus.RETURNED]: 'status-returned',
            [BorrowRequestStatus.COMPLETED]: 'status-completed',
        };
        return classMap[status] || '';
    },

    /**
     * 切换标签页
     */
    switchTab(e: any) {
        const tab = e.currentTarget.dataset.tab;
        const filtered = this.getFilteredRequestsFromData(this.data.requests, tab);
        console.log(`切换到标签页"${tab}"，显示${filtered.length}条申请`);
        this.setData({
            currentTab: tab,
            filteredRequests: filtered,
        });
    },

    /**
     * 审核申请
     */
    async onReview(e: any) {
        const { requestid, action } = e.currentTarget.dataset;
        const request = this.data.requests.find(r => r.id === requestid);

        if (!request) {
            return;
        }

        if (request.status !== BorrowRequestStatus.PENDING) {
            wx.showToast({
                title: '该申请已处理',
                icon: 'none',
            });
            return;
        }

        // 如果是拒绝，需要输入拒绝原因
        if (action === 'reject') {
            wx.showModal({
                title: '拒绝申请',
                content: `确定要拒绝《${request.bookName}》的借阅申请吗？`,
                editable: true,
                placeholderText: '请输入拒绝原因',
                success: async (res) => {
                    if (res.confirm) {
                        const adminRemark = res.content?.trim() || '申请已拒绝';

                        wx.showLoading({
                            title: '处理中...',
                        });

                        try {
                            const result = await reviewBorrowRequest(requestid, action, adminRemark);

                            if (result.success) {
                                wx.hideLoading();
                                wx.showToast({
                                    title: result.message || '已拒绝申请',
                                    icon: 'success',
                                });
                                // 刷新列表（从message集合同步最新数据）
                                console.log('审核操作完成，刷新申请列表...');
                                await this.loadRequests();
                            } else {
                                wx.hideLoading();
                                wx.showToast({
                                    title: result.message || '处理失败',
                                    icon: 'none',
                                });
                            }
                        } catch (error: any) {
                            wx.hideLoading();
                            console.error('审核失败:', error);
                            wx.showToast({
                                title: '处理失败，请稍后重试',
                                icon: 'none',
                            });
                        }
                    }
                },
            });
        } else {
            // 批准申请
            // 根据借阅类型显示不同的提示
            const borrowTypeText = request.borrowType === 'reference' ? '参考' :
                request.borrowType === 'copy' ? '复印' : '借出';
            let contentText = `确定要通过《${request.bookName}》的借阅申请吗？`;
            if (request.borrowType === 'reference') {
                contentText += '\n参考类型通过后，申请将直接完成（已归还）。';
            } else {
                contentText += '\n通过后，申请将进入"待借出"列表。';
            }

            wx.showModal({
                title: '通过申请',
                content: contentText,
                success: async (res) => {
                    if (res.confirm) {
                        wx.showLoading({
                            title: '处理中...',
                        });

                        try {
                            const result = await reviewBorrowRequest(requestid, action);

                            if (result.success) {
                                // 如果通过申请，发送订阅消息通知用户
                                if (action === 'approve' && result.data) {
                                    const approvedRequest = result.data;
                                    const userOpenId = approvedRequest.openId;

                                    // 格式化借阅日期和归还日期
                                    let borrowDateStr = '';
                                    let returnDateStr = '';

                                    if (approvedRequest.borrowDate) {
                                        borrowDateStr = approvedRequest.borrowDate;
                                    } else {
                                        borrowDateStr = formatDate(getBeijingTime());
                                    }

                                    if (approvedRequest.returnDate) {
                                        returnDateStr = approvedRequest.returnDate;
                                    } else {
                                        // 如果没有归还日期，根据借阅天数计算
                                        const borrowDays = approvedRequest.borrowDays || 7;
                                        const returnDate = new Date(getBeijingTime());
                                        returnDate.setDate(returnDate.getDate() + borrowDays);
                                        returnDateStr = formatDate(returnDate);
                                    }

                                    // 发送借阅成功通知（通过申请后，用户已可以借阅）
                                    try {
                                        await sendBorrowSuccessNotification(
                                            userOpenId,
                                            approvedRequest.bookName,
                                            borrowDateStr,
                                            returnDateStr,
                                            approvedRequest.id,
                                            'pages/myBorrows/myBorrows',
                                            false // 不请求权限，后台发送
                                        );
                                        console.log('已发送通过申请通知');
                                    } catch (subscribeError: any) {
                                        console.warn('发送通过申请通知失败:', subscribeError);
                                        // 订阅消息发送失败不影响操作
                                    }
                                }

                                wx.hideLoading();
                                wx.showToast({
                                    title: result.message || '已通过申请',
                                    icon: 'success',
                                });
                                // 刷新列表（从message集合同步最新数据）
                                console.log('审核操作完成，刷新申请列表...');
                                await this.loadRequests();
                            } else {
                                wx.hideLoading();
                                wx.showToast({
                                    title: result.message || '处理失败',
                                    icon: 'none',
                                });
                            }
                        } catch (error: any) {
                            wx.hideLoading();
                            console.error('审核失败:', error);
                            wx.showToast({
                                title: '处理失败，请稍后重试',
                                icon: 'none',
                            });
                        }
                    }
                },
            });
        }
    },

    /**
     * 查看申请详情
     */
    onViewDetail(e: any) {
        const { requestid } = e.currentTarget.dataset;
        const request = this.data.requests.find(r => r.id === requestid);

        if (!request) {
            return;
        }

        let content = `档案名称：${request.bookName}\n`;
        if (request.borrowType) {
            const borrowTypeText = request.borrowType === 'reference' ? '参考' :
                request.borrowType === 'copy' ? '复印' : '借出';
            content += `借阅类型：${borrowTypeText}\n`;
        }
        content += `借阅天数：${request.borrowDays}天\n`;
        if (request.name) content += `借阅人姓名：${request.name}\n`;
        if (request.phone) content += `电话：${request.phone}\n`;
        if (request.email) content += `邮箱：${request.email}\n`;
        if (request.department) content += `部门/院系：${request.department}\n`;
        if (request.reason) content += `借阅事由：${request.reason}\n`;
        if (request.remark) content += `备注：${request.remark}\n`;
        content += `申请时间：${this.formatDate(request.createdAt)}\n`;
        if (request.borrowDate) content += `借阅日期：${request.borrowDate}\n`;
        if (request.borrowTime) content += `借出时间：${this.formatDate(request.borrowTime)}\n`;
        if (request.returnDate) content += `归还日期：${request.returnDate}\n`;
        if (request.archiveNumbers && request.archiveNumbers.length > 0) {
            content += `档号：${request.archiveNumbers.join('、')}\n`;
        }
        if (request.borrowReason) content += `借出理由：${request.borrowReason}\n`;
        if (request.adminRemark) content += `审核备注：${request.adminRemark}\n`;
        content += `状态：${this.getStatusText(request.status)}`;

        wx.showModal({
            title: '申请详情',
            content: content,
            showCancel: false,
        });
    },

    /**
     * 格式化日期时间
     */
    formatDate(dateStr: string): string {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}`;
    },

    /**
     * 确认借出（打开弹窗表单）
     */
    confirmBorrowRecord(e: any) {
        const requestId = e.currentTarget.dataset.id;
        const request = this.data.requests.find(r => r.id === requestId);

        if (!request) {
            return;
        }

        // 打开弹窗，初始化表单数据
        this.setData({
            showBorrowModal: true,
            currentBorrowRequestId: requestId,
            archiveNumbers: [''],
            borrowReason: '',
        });
    },

    /**
     * 关闭确认借出弹窗
     */
    closeBorrowModal() {
        this.setData({
            showBorrowModal: false,
            currentBorrowRequestId: '',
            archiveNumbers: [''],
            borrowReason: '',
        });
    },

    /**
     * 阻止事件冒泡
     */
    stopPropagation() {
        // 阻止事件冒泡，防止点击内容区域关闭弹窗
    },

    /**
     * 添加档号输入框
     */
    addArchiveNumber() {
        const archiveNumbers = [...this.data.archiveNumbers, ''];
        this.setData({
            archiveNumbers: archiveNumbers,
        });
    },

    /**
     * 删除档号输入框
     */
    removeArchiveNumber(e: any) {
        const index = e.currentTarget.dataset.index;
        const archiveNumbers = [...this.data.archiveNumbers];
        archiveNumbers.splice(index, 1);
        // 如果删除后没有档号了，至少保留一个空输入框
        if (archiveNumbers.length === 0) {
            archiveNumbers.push('');
        }
        this.setData({
            archiveNumbers: archiveNumbers,
        });
    },

    /**
     * 档号输入
     */
    onArchiveNumberInput(e: any) {
        const index = e.currentTarget.dataset.index;
        const value = e.detail.value;
        const archiveNumbers = [...this.data.archiveNumbers];
        archiveNumbers[index] = value;
        this.setData({
            archiveNumbers: archiveNumbers,
        });
    },

    /**
     * 借出理由输入
     */
    onBorrowReasonInput(e: any) {
        this.setData({
            borrowReason: e.detail.value,
        });
    },

    /**
     * 确认借出（带档号和理由）
     */
    async confirmBorrowWithInfo() {
        // 验证档号
        const validArchiveNumbers = this.data.archiveNumbers.filter(num => num.trim() !== '');
        if (validArchiveNumbers.length === 0) {
            wx.showToast({
                title: '请至少输入一个档号',
                icon: 'none',
            });
            return;
        }

        // 验证理由
        if (!this.data.borrowReason || !this.data.borrowReason.trim()) {
            wx.showToast({
                title: '请输入借出理由',
                icon: 'none',
            });
            return;
        }

        const requestId = this.data.currentBorrowRequestId;
        const request = this.data.requests.find(r => r.id === requestId);

        if (!request) {
            wx.showToast({
                title: '申请不存在',
                icon: 'none',
            });
            return;
        }

        // 归还日期固定为今天（北京时间）
        const today = getBeijingTime();
        const returnDateStr = formatDate(today);

        wx.showLoading({
            title: '处理中...',
        });

        try {
            // 调用确认借出接口，传入档号和理由
            const result = await confirmBorrow(
                requestId,
                returnDateStr,
                validArchiveNumbers,
                this.data.borrowReason.trim()
            );

            if (result.success) {
                // 发送借阅成功订阅消息（包含档号和理由）
                if (result.data) {
                    const borrowRecord = result.data;
                    const userOpenId = borrowRecord.openId;

                    // 格式化借阅日期和归还日期
                    let borrowDateStr = '';
                    let finalReturnDateStr = returnDateStr;

                    if (borrowRecord.borrowTime) {
                        const borrowTime = new Date(borrowRecord.borrowTime);
                        borrowDateStr = formatDate(borrowTime);
                    } else if (borrowRecord.borrowDate) {
                        borrowDateStr = borrowRecord.borrowDate;
                    } else {
                        borrowDateStr = formatDate(getBeijingTime());
                    }

                    if (borrowRecord.returnDate) {
                        finalReturnDateStr = borrowRecord.returnDate;
                    }

                    // 发送订阅消息（包含档号和理由）
                    try {
                        await sendBorrowSuccessNotification(
                            userOpenId,
                            borrowRecord.bookName,
                            borrowDateStr,
                            finalReturnDateStr,
                            borrowRecord.id,
                            'pages/myBorrows/myBorrows',
                            false, // 不请求权限，后台发送
                            validArchiveNumbers,
                            this.data.borrowReason.trim()
                        );
                        console.log('已发送借阅成功通知（包含档号和理由）');
                    } catch (subscribeError: any) {
                        console.warn('发送借阅成功通知失败:', subscribeError);
                        // 订阅消息发送失败不影响操作
                    }
                }

                wx.hideLoading();
                wx.showToast({
                    title: result.message || '借出确认成功',
                    icon: 'success',
                });

                // 关闭弹窗
                this.closeBorrowModal();

                // 刷新列表（从message集合同步最新数据）
                console.log('借出确认完成，刷新申请列表...');
                await this.loadRequests();
            } else {
                wx.hideLoading();
                wx.showToast({
                    title: result.message || '操作失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            wx.hideLoading();
            console.error('确认借出失败:', error);
            wx.showToast({
                title: '操作失败，请稍后重试',
                icon: 'none',
            });
        }
    },

    /**
     * 确认归还
     */
    async confirmReturnRecord(e: any) {
        const requestId = e.currentTarget.dataset.id;
        const request = this.data.requests.find(r => r.id === requestId);

        if (!request) {
            return;
        }

        wx.showModal({
            title: '确认归还',
            content: `请确认《${request.bookName}》已归还且完好无损`,
            success: async (res) => {
                if (res.confirm) {
                    wx.showLoading({
                        title: '处理中...',
                    });

                    try {
                        // 确认归还（从message集合提取时间信息）
                        const result = await confirmReturn(requestId);

                        if (result.success) {
                            // 发送归还成功订阅消息（从message集合提取的时间信息）
                            if (result.data) {
                                const returnRecord = result.data;
                                const userOpenId = returnRecord.openId;

                                // 格式化归还日期（从message集合提取的returnTime或returnDate）
                                let returnDateStr = '';
                                if (returnRecord.returnTime) {
                                    // 从returnTime（ISO字符串）提取日期部分
                                    const returnTime = new Date(returnRecord.returnTime);
                                    returnDateStr = formatDate(returnTime);
                                } else if (returnRecord.returnDate) {
                                    returnDateStr = returnRecord.returnDate;
                                } else {
                                    // 使用当前日期
                                    returnDateStr = formatDate(getBeijingTime());
                                }

                                // 发送订阅消息（不请求权限，后台发送）
                                try {
                                    await sendReturnSuccessNotification(
                                        userOpenId,
                                        returnRecord.bookName,
                                        returnDateStr,
                                        returnRecord.id,
                                        'pages/myBorrows/myBorrows',
                                        false // 不请求权限，后台发送
                                    );
                                    console.log('已发送归还成功通知');
                                } catch (subscribeError: any) {
                                    console.warn('发送归还成功通知失败:', subscribeError);
                                    // 订阅消息发送失败不影响归还确认
                                }
                            }

                            wx.hideLoading();
                            wx.showToast({
                                title: result.message || '归还确认成功',
                                icon: 'success',
                            });
                            // 刷新列表（从message集合同步最新数据）
                            console.log('归还确认完成，刷新申请列表...');
                            await this.loadRequests();
                        } else {
                            wx.hideLoading();
                            wx.showToast({
                                title: result.message || '操作失败',
                                icon: 'none',
                            });
                        }
                    } catch (error: any) {
                        wx.hideLoading();
                        console.error('确认归还失败:', error);
                        wx.showToast({
                            title: '操作失败，请稍后重试',
                            icon: 'none',
                        });
                    }
                }
            },
        });
    },

    /**
     * 下拉刷新
     */
    onPullDownRefresh() {
        this.loadRequests().finally(() => {
            wx.stopPullDownRefresh();
        });
    },
});

