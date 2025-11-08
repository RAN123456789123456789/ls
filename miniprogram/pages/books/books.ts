// pages/books/books.ts
import { getBookList, BookInfo } from '../../utils/borrowService';
import { getMyBorrowRecords } from '../../utils/borrowService';
import { BorrowRecord } from '../../utils/subscribeScheduler';

Page({
    data: {
        // 可借阅图书列表
        availableBooks: [] as BookInfo[],
        // 已借阅记录列表
        borrowedRecords: [] as BorrowRecord[],
        loading: false,
        keyword: '',
        showSearch: false,
        // 当前选中的标签：'borrow' 借阅 或 'return' 还书
        currentTab: 'borrow' as 'borrow' | 'return',
    },

    onLoad() {
        this.loadData();
    },

    onShow() {
        // 如果从其他页面返回，刷新列表
        this.loadData();
    },

    /**
     * 加载数据（可借阅图书和已借阅记录）
     */
    async loadData() {
        this.setData({ loading: true });

        try {
            // 并行加载可借阅图书和已借阅记录
            const [booksResult, recordsResult] = await Promise.all([
                getBookList({
                    keyword: this.data.keyword || undefined,
                }),
                getMyBorrowRecords(),
            ]);

            // 处理可借阅图书
            if (booksResult.success && booksResult.data) {
                // 过滤出可借阅的图书（availableCount > 0）
                const available = booksResult.data.filter(book => book.availableCount > 0);
                console.log('可借阅图书数量:', available.length, available);
                this.setData({
                    availableBooks: available,
                });
            } else {
                console.log('获取图书列表失败:', booksResult.message);
                this.setData({
                    availableBooks: [],
                });
            }

            // 处理已借阅记录
            if (recordsResult.success && recordsResult.data) {
                // 按借阅日期倒序排序，并添加天数信息
                const sortedRecords = recordsResult.data.sort((a, b) => {
                    return new Date(b.borrowDate).getTime() - new Date(a.borrowDate).getTime();
                }).map((record: BorrowRecord) => {
                    const daysInfo = this.getDaysInfo(record.returnDate);
                    return {
                        ...record,
                        daysText: daysInfo.text,
                        daysType: daysInfo.type,
                    };
                });
                console.log('已借阅记录数量:', sortedRecords.length, sortedRecords);
                this.setData({
                    borrowedRecords: sortedRecords,
                });
            } else {
                console.log('获取借阅记录失败:', recordsResult.message);
                this.setData({
                    borrowedRecords: [],
                });
            }
        } catch (error: any) {
            console.error('加载数据失败:', error);
            wx.showToast({
                title: '加载失败，请稍后重试',
                icon: 'none',
            });
        } finally {
            this.setData({ loading: false });
        }
    },

    /**
     * 加载图书列表（兼容旧方法）
     */
    async loadBooks() {
        await this.loadData();
    },

    /**
     * 搜索图书
     */
    onSearchInput(e: any) {
        this.setData({
            keyword: e.detail.value,
        });
    },

    /**
     * 执行搜索
     */
    onSearchConfirm() {
        this.loadBooks();
    },

    /**
     * 清除搜索
     */
    onClearSearch() {
        this.setData({
            keyword: '',
            showSearch: false,
        });
        this.loadBooks();
    },

    /**
     * 切换搜索框显示
     */
    toggleSearch() {
        this.setData({
            showSearch: !this.data.showSearch,
            keyword: '',
        });
        if (!this.data.showSearch) {
            this.loadBooks();
        }
    },

    /**
     * 跳转到图书详情（借阅）
     */
    onBookTap(e: any) {
        const { bookid } = e.currentTarget.dataset;
        // 跳转到借阅申请页面
        wx.navigateTo({
            url: `/pages/borrowRequest/borrowRequest?bookId=${bookid}`,
        });
    },

    /**
     * 处理还书操作
     */
    async onReturnBook(e: any) {
        const { recordid, bookname } = e.currentTarget.dataset;

        wx.showModal({
            title: '确认归还',
            content: `确定要归还《${bookname}》吗？`,
            success: async (res) => {
                if (res.confirm) {
                    wx.showLoading({
                        title: '归还中...',
                    });

                    try {
                        const { returnBook } = require('../../utils/borrowService');
                        const { sendReturnSuccessNotification } = require('../../utils/subscribeService');
                        const { getUserOpenId } = require('../../utils/userService');

                        const result = await returnBook({
                            recordId: recordid,
                        });

                        if (result.success) {
                            // 发送归还成功通知
                            const openId = await getUserOpenId();
                            if (openId) {
                                const returnDate = new Date().toISOString().split('T')[0];
                                await sendReturnSuccessNotification(
                                    openId,
                                    bookname,
                                    returnDate,
                                    undefined,
                                    'pages/books/books'
                                );
                            }

                            wx.hideLoading();
                            wx.showToast({
                                title: '归还成功',
                                icon: 'success',
                            });

                            // 刷新列表
                            this.loadData();
                        } else {
                            wx.hideLoading();
                            wx.showToast({
                                title: result.message || '归还失败',
                                icon: 'none',
                            });
                        }
                    } catch (error: any) {
                        wx.hideLoading();
                        console.error('归还失败:', error);
                        wx.showToast({
                            title: '归还失败，请稍后重试',
                            icon: 'none',
                        });
                    }
                }
            },
        });
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
     * 切换标签
     */
    onTabChange(e: any) {
        const { tab } = e.currentTarget.dataset;
        if (tab && tab !== this.data.currentTab) {
            this.setData({
                currentTab: tab,
            });
        }
    },

    /**
     * 下拉刷新
     */
    onPullDownRefresh() {
        this.loadBooks().finally(() => {
            wx.stopPullDownRefresh();
        });
    },
});

