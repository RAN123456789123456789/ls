// pages/borrowForm/borrowForm.ts
import { submitBorrowRequest, BorrowRequestForm } from '../../utils/borrowRequestService';
import { userLogin, isUserLoggedIn } from '../../utils/userService';
import { getBeijingTime, formatDate as formatDateUtil, getTodayBeijingDate } from '../../utils/util';
import { requestSubscribeBeforeAction, SubscribeMessageType } from '../../utils/subscribeMessage';

Page({
    data: {
        submitting: false,
        // 授权状态
        hasUserInfo: false,
        userInfo: {
            nickName: '',
            avatarUrl: '',
        },
        // 授权弹窗
        showAuthModal: false,
        // 登录检查标志，防止重复弹出
        loginCheckShown: false,
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
        // 日期选择器
        borrowDate: '', // 借阅日期 YYYY-MM-DD
        returnDate: '', // 归还日期 YYYY-MM-DD
        borrowDateTimestamp: 0,
        returnDateTimestamp: 0,
    },

    onLoad() {
        // 检查登录状态
        this.checkLoginAndInit();
    },

    /**
     * 检查登录状态并初始化页面
     */
    checkLoginAndInit() {
        if (!isUserLoggedIn()) {
            // 如果已经显示过登录提示，不再重复显示
            if (this.data.loginCheckShown) {
                return;
            }
            this.setData({ loginCheckShown: true });

            wx.showModal({
                title: '提示',
                content: '请先登录后再进行借阅操作',
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

        // 已登录，初始化页面
        // 初始化日期：借阅日期默认为今天（北京时间），归还日期默认为7天后
        const today = getBeijingTime();
        const returnDate = new Date(today);
        returnDate.setDate(returnDate.getDate() + 7);

        this.setData({
            borrowDate: formatDateUtil(today),
            returnDate: formatDateUtil(returnDate),
            borrowDateTimestamp: today.getTime(),
            returnDateTimestamp: returnDate.getTime(),
            'form.borrowDays': 7,
        });

        // 尝试获取用户信息
        this.checkUserInfo();

        // 检查是否需要显示授权弹窗
        this.checkAndShowAuthModal();
    },

    onShow() {
        // 每次显示时检查登录状态，如果用户登录后返回，重新初始化
        if (isUserLoggedIn() && this.data.loginCheckShown) {
            // 用户已登录，重新初始化页面
            this.setData({ loginCheckShown: false });
            const today = getBeijingTime();
            const returnDate = new Date(today);
            returnDate.setDate(returnDate.getDate() + 7);

            this.setData({
                borrowDate: formatDateUtil(today),
                returnDate: formatDateUtil(returnDate),
                borrowDateTimestamp: today.getTime(),
                returnDateTimestamp: returnDate.getTime(),
                'form.borrowDays': 7,
            });
            this.checkUserInfo();
        } else if (!isUserLoggedIn() && !this.data.loginCheckShown) {
            // 如果未登录且未显示过提示，重新检查
            this.checkLoginAndInit();
        }
    },

    /**
     * 检查并显示授权弹窗
     */
    checkAndShowAuthModal() {
        const { hasUserInfo } = this.data;
        // 如果缺少授权，显示授权弹窗
        if (!hasUserInfo) {
            this.setData({
                showAuthModal: true,
            });
        }
    },

    /**
     * 关闭授权弹窗
     */
    closeAuthModal() {
        this.setData({
            showAuthModal: false,
        });
    },

    /**
     * 检查用户信息授权状态
     */
    checkUserInfo() {
        const userInfo = wx.getStorageSync('userInfo');
        if (userInfo) {
            this.setData({
                hasUserInfo: true,
                userInfo: userInfo,
                'form.name': userInfo.nickName || '',
            });
        }
    },

    /**
     * 获取用户信息授权
     */
    async getUserProfile() {
        wx.getUserProfile({
            desc: '用于完善借阅信息',
            success: async (res) => {
                console.log('获取用户信息成功:', res);
                this.setData({
                    hasUserInfo: true,
                    userInfo: res.userInfo,
                    'form.name': res.userInfo.nickName || '',
                });
                // 保存到本地
                wx.setStorageSync('userInfo', res.userInfo);

                // 登录并保存用户信息到数据库
                try {
                    const loginResult = await userLogin(res.userInfo);
                    if (loginResult.success) {
                        console.log('用户信息已保存到数据库');
                    } else {
                        console.warn('保存用户信息到数据库失败:', loginResult.message);
                    }
                } catch (error) {
                    console.error('保存用户信息失败:', error);
                }

                wx.showToast({
                    title: '授权成功',
                    icon: 'success',
                });

                // 检查是否所有授权都已完成
                this.checkAuthComplete();
            },
            fail: (err) => {
                console.error('获取用户信息失败:', err);
                wx.showToast({
                    title: '授权失败',
                    icon: 'none',
                });
            },
        });
    },

    /**
     * 检查授权是否完成
     */
    checkAuthComplete() {
        const { hasUserInfo } = this.data;
        // 如果授权完成，可以关闭授权弹窗
        if (hasUserInfo) {
            // 延迟关闭，让用户看到成功提示
            setTimeout(() => {
                this.setData({
                    showAuthModal: false,
                });
            }, 500);
        }
    },

    /**
     * 选择借阅日期
     */
    onBorrowDateChange(e: any) {
        const date = e.detail.value;
        // 解析日期字符串 YYYY-MM-DD（避免时区问题）
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const timestamp = dateObj.getTime();
        this.setData({
            borrowDate: date,
            borrowDateTimestamp: timestamp,
        });
        // 自动计算归还日期（借阅日期 + 借阅天数）
        this.calculateReturnDate();
    },

    /**
     * 选择归还日期
     */
    onReturnDateChange(e: any) {
        const date = e.detail.value;
        // 解析日期字符串 YYYY-MM-DD（避免时区问题）
        const [year, month, day] = date.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const timestamp = dateObj.getTime();
        this.setData({
            returnDate: date,
            returnDateTimestamp: timestamp,
        });
        // 计算借阅天数
        this.calculateBorrowDays();
    },

    /**
     * 计算归还日期（基于借阅日期和借阅天数）
     */
    calculateReturnDate() {
        const { borrowDate, form } = this.data;
        if (!borrowDate) return;

        // 解析日期字符串 YYYY-MM-DD（避免时区问题）
        const [year, month, day] = borrowDate.split('-').map(Number);
        const borrowDateObj = new Date(year, month - 1, day);
        const returnDateObj = new Date(borrowDateObj);
        returnDateObj.setDate(returnDateObj.getDate() + form.borrowDays);

        const returnDateStr = this.formatDate(returnDateObj);
        this.setData({
            returnDate: returnDateStr,
            returnDateTimestamp: returnDateObj.getTime(),
        });
    },

    /**
     * 计算借阅天数（基于借阅日期和归还日期）
     */
    calculateBorrowDays() {
        const { borrowDate, returnDate } = this.data;
        if (!borrowDate || !returnDate) return;

        // 解析日期字符串 YYYY-MM-DD（避免时区问题）
        const [borrowYear, borrowMonth, borrowDay] = borrowDate.split('-').map(Number);
        const [returnYear, returnMonth, returnDay] = returnDate.split('-').map(Number);
        const borrowDateObj = new Date(borrowYear, borrowMonth - 1, borrowDay);
        const returnDateObj = new Date(returnYear, returnMonth - 1, returnDay);
        const days = Math.ceil((returnDateObj.getTime() - borrowDateObj.getTime()) / (1000 * 60 * 60 * 24));

        if (days > 0) {
            this.setData({
                'form.borrowDays': days,
                returnDateTimestamp: returnDateObj.getTime(),
            });
        }
    },

    /**
     * 选择借阅天数
     */
    onBorrowDaysChange(e: any) {
        const index = parseInt(e.detail.value) || 0;
        const daysOptions = [7, 14, 21, 30];
        const days = daysOptions[index] || 7;
        this.setData({
            'form.borrowDays': days,
        });
        // 重新计算归还日期
        this.calculateReturnDate();
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
     * 格式化日期为 YYYY-MM-DD（使用北京时间）
     */
    formatDate(date: Date): string {
        return formatDateUtil(date);
    },

    /**
     * 提交表单
     */
    async onSubmit() {
        const { form, borrowDate, returnDate, hasUserInfo } = this.data;

        // 基本验证 - 如果缺少授权，显示授权弹窗
        if (!hasUserInfo) {
            this.setData({
                showAuthModal: true,
            });
            wx.showToast({
                title: '请先完成信息授权',
                icon: 'none',
            });
            return;
        }

        if (!form.name) {
            wx.showModal({
                title: '提示',
                content: '请先完成基本信息授权（姓名）',
                showCancel: false,
                success: () => {
                    this.setData({
                        showAuthModal: true,
                    });
                }
            });
            return;
        }

        if (!borrowDate || !returnDate) {
            wx.showToast({
                title: '请选择借阅和归还日期',
                icon: 'none',
            });
            return;
        }

        // 验证归还日期不能早于借阅日期
        const borrowDateObj = new Date(borrowDate + 'T00:00:00');
        const returnDateObj = new Date(returnDate + 'T00:00:00');
        if (returnDateObj <= borrowDateObj) {
            wx.showToast({
                title: '归还日期必须晚于借阅日期',
                icon: 'none',
            });
            return;
        }

        // 如果没有选择图书，使用默认值
        if (!form.bookId) {
            form.bookId = 'default';
            form.bookName = '档案借阅';
        }

        this.setData({ submitting: true });

        try {
            // 请求订阅消息授权（可选，不强制）
            // 在借阅前请求授权，以便后续发送借阅成功和归还提醒通知
            try {
                await requestSubscribeBeforeAction([
                    SubscribeMessageType.BORROW_SUCCESS,
                    SubscribeMessageType.RETURN_REMINDER,
                ], true); // 显示引导提示
            } catch (subscribeError) {
                // 订阅授权失败不影响借阅申请提交
                console.warn('订阅消息授权失败，继续提交申请:', subscribeError);
            }

            // 提交表单数据，借阅日期和归还日期会通过borrowDays计算
            // 实际存储时会由后端或本地存储逻辑处理
            const result = await submitBorrowRequest(form);

            if (result.success) {
                console.log('借阅申请提交成功');

                // 如果后端返回的数据包含日期信息，保存额外的日期信息到本地
                if (result.data) {
                    const records = wx.getStorageSync('borrow_requests') || [];
                    const recordIndex = records.findIndex((r: any) => r.id === result.data!.id);
                    if (recordIndex >= 0) {
                        records[recordIndex].borrowDate = borrowDate;
                        records[recordIndex].returnDate = returnDate;
                        wx.setStorageSync('borrow_requests', records);
                    }
                }

                wx.showModal({
                    title: '提交成功',
                    content: '您的借阅申请已提交，等待管理员审核。审核结果将通过订阅消息通知您。',
                    showCancel: false,
                    confirmText: '知道了',
                    success: () => {
                        // 返回借阅页面
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

