// pages/borrowRequest/borrowRequest.ts
import { submitBorrowRequest, BorrowRequestForm } from '../../utils/borrowRequestService';
import { getBookDetail, BookInfo } from '../../utils/borrowService';

Page({
    data: {
        bookId: '',
        book: null as BookInfo | null,
        loading: false,
        submitting: false,
        borrowDaysIndex: 0,
        borrowDaysOptions: [7, 14, 21, 30],
        // 表单数据
        form: {
            bookId: '',
            bookName: '',
            borrowDays: 7,
            name: '',
            phone: '',
            email: '',
            department: '',
            reason: '',
            remark: '',
        } as BorrowRequestForm,
    },

    onLoad(options: any) {
        const { bookId, borrowDays } = options;
        if (bookId) {
            this.setData({
                'form.bookId': bookId,
                'form.borrowDays': borrowDays ? parseInt(borrowDays) : 7,
            });
            this.loadBookDetail();
        } else {
            wx.showToast({
                title: '参数错误',
                icon: 'none',
            });
            setTimeout(() => {
                wx.navigateBack();
            }, 1500);
        }
    },

    /**
     * 加载图书详情
     */
    async loadBookDetail() {
        this.setData({ loading: true });

        try {
            const result = await getBookDetail(this.data.form.bookId);

            if (result.success && result.data) {
                this.setData({
                    book: result.data,
                    'form.bookName': result.data.name,
                });
            } else {
                wx.showToast({
                    title: result.message || '加载失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            console.error('加载图书详情失败:', error);
            wx.showToast({
                title: '加载失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 选择借阅天数
     */
    onBorrowDaysChange(e: any) {
        const index = parseInt(e.detail.value) || 0;
        const days = [7, 14, 21, 30][index] || 7;
        this.setData({
            'form.borrowDays': days,
        });
    },

    /**
     * 输入框变化
     */
    onInputChange(e: any) {
        const { field } = e.currentTarget.dataset;
        const value = e.detail.value;
        this.setData({
            [`form.${field}`]: value,
        });
    },

    /**
     * 提交申请
     */
    async onSubmit() {
        const { form } = this.data;

        // 基本验证
        if (!form.bookId || !form.bookName) {
            wx.showToast({
                title: '图书信息错误',
                icon: 'none',
            });
            return;
        }

        this.setData({ submitting: true });

        try {
            const result = await submitBorrowRequest(form);

            if (result.success) {
                wx.showModal({
                    title: '提交成功',
                    content: '您的借阅申请已提交，等待管理员审核。审核结果将通过订阅消息通知您。',
                    showCancel: false,
                    confirmText: '知道了',
                    success: () => {
                        // 返回上一页
                        wx.navigateBack();
                    },
                });
            } else {
                wx.showToast({
                    title: result.message || '提交失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            console.error('提交申请失败:', error);
            wx.showToast({
                title: '提交失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ submitting: false });
        }
    },
});

