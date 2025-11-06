// pages/bookDetail/bookDetail.ts
import { getBookDetail, borrowBook, BookInfo } from '../../utils/borrowService';
import { requestSubscribeBeforeAction, SubscribeMessageType } from '../../utils/subscribeMessage';
import { sendBorrowSuccessNotification } from '../../utils/subscribeService';
import { getUserOpenId, isUserLoggedIn } from '../../utils/userService';

Page({
    data: {
        bookId: '',
        book: null as BookInfo | null,
        loading: false,
        borrowing: false,
        borrowDays: 7,
        borrowDaysOptions: [7, 14, 21, 30],
        borrowDaysIndex: 0, // 默认选择7天（索引0）
    },

    onLoad(options: any) {
        const { bookId } = options;
        if (bookId) {
            this.setData({ bookId });
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
            const result = await getBookDetail(this.data.bookId);

            if (result.success && result.data) {
                this.setData({
                    book: result.data,
                });
            } else {
                wx.showToast({
                    title: result.message || '加载失败',
                    icon: 'none',
                });
                setTimeout(() => {
                    wx.navigateBack();
                }, 1500);
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
        const days = this.data.borrowDaysOptions[index] || 7;
        this.setData({
            borrowDaysIndex: index,
            borrowDays: days,
        });
    },

    /**
     * 借阅图书
     */
    async onBorrow() {
        const { book, borrowDays } = this.data;

        if (!book) {
            return;
        }

        // 检查登录状态
        if (!isUserLoggedIn()) {
            wx.showModal({
                title: '提示',
                content: '请先登录后再进行借阅操作',
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

        if (book.availableCount <= 0) {
            wx.showToast({
                title: '图书已借完',
                icon: 'none',
            });
            return;
        }

        // 请求订阅授权
        const authorized = await requestSubscribeBeforeAction([
            SubscribeMessageType.BORROW_SUCCESS,
            SubscribeMessageType.RETURN_REMINDER,
        ]);

        this.setData({ borrowing: true });

        try {
            // 执行借阅
            const result = await borrowBook({
                bookId: book.id,
                bookName: book.name,
                borrowDays,
            });

            if (result.success && result.data) {
                // 发送借阅成功通知
                if (authorized) {
                    const openId = await getUserOpenId();
                    if (openId) {
                        await sendBorrowSuccessNotification(
                            openId,
                            book.name,
                            result.data.borrowDate,
                            result.data.returnDate,
                            result.data.borrowNumber,
                            'pages/myBorrows/myBorrows'
                        );
                    }
                }

                wx.showModal({
                    title: '借阅成功',
                    content: `借阅编号：${result.data.borrowNumber}\n归还日期：${result.data.returnDate}`,
                    showCancel: false,
                    confirmText: '查看我的借阅',
                    success: (res) => {
                        if (res.confirm) {
                            wx.redirectTo({
                                url: '/pages/myBorrows/myBorrows',
                            });
                        } else {
                            wx.navigateBack();
                        }
                    },
                });
            } else {
                wx.showToast({
                    title: result.message || '借阅失败',
                    icon: 'none',
                });
            }
        } catch (error: any) {
            console.error('借阅失败:', error);
            wx.showToast({
                title: '借阅失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ borrowing: false });
        }
    },
});

