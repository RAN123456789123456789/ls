/**
 * 借阅服务
 * 处理借阅相关的API调用
 */

import { BorrowRecord, saveBorrowRecord, removeBorrowRecord } from './subscribeScheduler';
import { getUserOpenId } from './userService';

// API配置
// 使用云托管默认域名（临时方案，等待域名备案完成后可切换为自定义域名）
const API_BASE_URL = 'https://express-bec5-197615-5-1385276628.sh.run.tcloudbase.com/api';

// 图书信息接口
export interface BookInfo {
    id: string;
    name: string;
    author?: string;
    cover?: string;
    description?: string;
    isbn?: string;
    totalCount: number; // 总数量
    availableCount: number; // 可借数量
    category?: string;
}

// 借阅请求参数
export interface BorrowRequest {
    bookId: string;
    bookName: string;
    borrowDays?: number; // 借阅天数，默认7天
}

// 借阅响应
export interface BorrowResponse {
    success: boolean;
    message?: string;
    data?: {
        recordId: string;
        borrowNumber: string;
        borrowDate: string;
        returnDate: string;
    };
}

// 归还请求参数
export interface ReturnRequest {
    recordId: string;
}

// 归还响应
export interface ReturnResponse {
    success: boolean;
    message?: string;
}

/**
 * 获取图书列表
 */
export async function getBookList(params?: {
    keyword?: string;
    category?: string;
    page?: number;
    pageSize?: number;
}): Promise<{ success: boolean; data?: BookInfo[]; message?: string }> {
    try {
        // 如果 API_BASE_URL 是默认值，直接返回模拟数据
        if (API_BASE_URL === 'https://your-api-domain.com/api') {
            console.log('使用模拟数据（API未配置）');
            // 模拟网络延迟
            await new Promise(resolve => setTimeout(resolve, 300));
            return {
                success: true,
                data: getMockBookList(),
            };
        }

        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/book/list`,
                method: 'GET',
                data: params || {},
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
                fail: (err) => {
                    console.error('API请求失败:', err);
                    reject(err);
                },
            });
        });

        if (res.success) {
            return {
                success: true,
                data: res.data || [],
            };
        } else {
            // API返回失败，使用模拟数据
            console.log('API返回失败，使用模拟数据');
            return {
                success: true,
                data: getMockBookList(),
            };
        }
    } catch (error: any) {
        console.error('获取图书列表失败，使用模拟数据:', error);

        // 开发测试：返回模拟数据
        return {
            success: true,
            data: getMockBookList(),
        };
    }
}

/**
 * 获取图书详情
 */
export async function getBookDetail(bookId: string): Promise<{ success: boolean; data?: BookInfo; message?: string }> {
    try {
        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/book/detail`,
                method: 'GET',
                data: { bookId },
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

        if (res.success) {
            return {
                success: true,
                data: res.data,
            };
        } else {
            return {
                success: false,
                message: res.message || '获取图书详情失败',
            };
        }
    } catch (error: any) {
        console.error('获取图书详情失败:', error);
        return {
            success: false,
            message: error.message || '获取图书详情失败',
        };
    }
}

/**
 * 借阅图书
 */
export async function borrowBook(request: BorrowRequest): Promise<BorrowResponse> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const { getBeijingTime } = require('./util');
        const borrowDays = request.borrowDays || 7;
        const borrowDate = getBeijingTime();
        const returnDate = new Date(borrowDate);
        returnDate.setDate(returnDate.getDate() + borrowDays);

        const borrowDateStr = formatDate(borrowDate);
        const returnDateStr = formatDate(returnDate);

        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/borrow/create`,
                method: 'POST',
                data: {
                    openId,
                    bookId: request.bookId,
                    bookName: request.bookName,
                    borrowDate: borrowDateStr,
                    returnDate: returnDateStr,
                },
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

        if (res.success) {
            const recordId = res.data?.recordId || `record_${Date.now()}`;
            const borrowNumber = res.data?.borrowNumber || `BR${Date.now()}`;

            // 保存借阅记录到本地（用于定时提醒）
            const record: BorrowRecord = {
                id: recordId,
                bookName: request.bookName,
                borrowDate: borrowDateStr,
                returnDate: returnDateStr,
                borrowNumber,
                openId,
            };
            saveBorrowRecord(record);

            return {
                success: true,
                message: '借阅成功',
                data: {
                    recordId,
                    borrowNumber,
                    borrowDate: borrowDateStr,
                    returnDate: returnDateStr,
                },
            };
        } else {
            return {
                success: false,
                message: res.message || '借阅失败',
            };
        }
    } catch (error: any) {
        console.error('借阅图书失败:', error);

        // 开发测试：模拟借阅成功
        const borrowDays = request.borrowDays || 7;
        const borrowDate = getBeijingTime();
        const returnDate = new Date(borrowDate);
        returnDate.setDate(returnDate.getDate() + borrowDays);

        const borrowDateStr = formatDate(borrowDate);
        const returnDateStr = formatDate(returnDate);
        const recordId = `record_${Date.now()}`;
        const borrowNumber = `BR${Date.now()}`;

        const openId = await getUserOpenId();
        const record: BorrowRecord = {
            id: recordId,
            bookName: request.bookName,
            borrowDate: borrowDateStr,
            returnDate: returnDateStr,
            borrowNumber,
            openId: openId || '',
        };
        saveBorrowRecord(record);

        return {
            success: true,
            message: '借阅成功（模拟）',
            data: {
                recordId,
                borrowNumber,
                borrowDate: borrowDateStr,
                returnDate: returnDateStr,
            },
        };
    }
}

/**
 * 归还图书
 */
export async function returnBook(request: ReturnRequest): Promise<ReturnResponse> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/borrow/return`,
                method: 'POST',
                data: {
                    openId,
                    recordId: request.recordId,
                },
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

        if (res.success) {
            // 删除本地借阅记录
            removeBorrowRecord(request.recordId);

            return {
                success: true,
                message: '归还成功',
            };
        } else {
            return {
                success: false,
                message: res.message || '归还失败',
            };
        }
    } catch (error: any) {
        console.error('归还图书失败:', error);

        // 开发测试：模拟归还成功
        removeBorrowRecord(request.recordId);

        return {
            success: true,
            message: '归还成功（模拟）',
        };
    }
}

/**
 * 获取我的借阅记录
 */
export async function getMyBorrowRecords(): Promise<{ success: boolean; data?: BorrowRecord[]; message?: string }> {
    try {
        // 如果 API_BASE_URL 是默认值，直接使用本地存储
        if (API_BASE_URL === 'https://your-api-domain.com/api') {
            console.log('使用本地存储的借阅记录（API未配置）');
            const records = wx.getStorageSync('borrow_records') || [];
            const openId = await getUserOpenId();

            // 如果openId存在，过滤出该用户的记录；否则返回所有记录
            const myRecords = openId
                ? records.filter((r: BorrowRecord) => !r.openId || r.openId === openId || r.openId === '')
                : records;

            return {
                success: true,
                data: myRecords,
            };
        }

        const openId = await getUserOpenId();
        if (!openId) {
            // 如果openId为空，尝试从本地存储获取
            console.log('openId为空，从本地存储获取借阅记录');
            const records = wx.getStorageSync('borrow_records') || [];
            return {
                success: true,
                data: records,
            };
        }

        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/borrow/myRecords`,
                method: 'GET',
                data: { openId },
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

        if (res.success) {
            return {
                success: true,
                data: res.data || [],
            };
        } else {
            // API返回失败，尝试从本地存储获取
            const records = wx.getStorageSync('borrow_records') || [];
            const myRecords = records.filter((r: BorrowRecord) => r.openId === openId);
            return {
                success: true,
                data: myRecords,
            };
        }
    } catch (error: any) {
        console.error('获取借阅记录失败，使用本地存储:', error);

        // 开发测试：从本地存储获取
        try {
            const records = wx.getStorageSync('borrow_records') || [];
            const openId = await getUserOpenId();

            // 如果openId存在，过滤出该用户的记录；否则返回所有记录
            const myRecords = openId
                ? records.filter((r: BorrowRecord) => !r.openId || r.openId === openId || r.openId === '')
                : records;

            return {
                success: true,
                data: myRecords,
            };
        } catch (err) {
            return {
                success: true,
                data: [], // 即使出错也返回空数组，而不是失败
            };
        }
    }
}

/**
 * 格式化日期为 YYYY-MM-DD（使用北京时间）
 */
function formatDate(date: Date): string {
    const { formatDate: formatDateUtil } = require('./util');
    return formatDateUtil(date);
}

/**
 * 获取模拟图书列表（用于开发测试）
 */
function getMockBookList(): BookInfo[] {
    return [
        {
            id: '1',
            name: 'JavaScript高级程序设计',
            author: 'Matt Frisbie',
            cover: '', // 不使用外部图片，使用默认占位图
            description: 'JavaScript技术经典名著，深入讲解现代JavaScript开发的核心概念和实践技巧。',
            isbn: '9787115545381',
            totalCount: 10,
            availableCount: 5,
            category: '计算机',
        },
        {
            id: '2',
            name: 'TypeScript编程',
            author: 'Boris Cherny',
            cover: '',
            description: 'TypeScript全面指南，从基础到高级，帮助开发者掌握类型安全的JavaScript开发。',
            isbn: '9787115545689',
            totalCount: 8,
            availableCount: 3,
            category: '计算机',
        },
        {
            id: '3',
            name: '深入理解计算机系统',
            author: 'Randal E. Bryant',
            cover: '',
            description: '计算机系统经典教材，深入浅出地讲解计算机系统的工作原理和底层机制。',
            isbn: '9787111544937',
            totalCount: 15,
            availableCount: 8,
            category: '计算机',
        },
        {
            id: '4',
            name: 'Vue.js设计与实现',
            author: '霍春阳',
            cover: '',
            description: 'Vue.js框架的深入解析，帮助开发者理解Vue.js的设计思想和实现原理。',
            isbn: '9787115583864',
            totalCount: 12,
            availableCount: 6,
            category: '前端开发',
        },
        {
            id: '5',
            name: 'React技术揭秘',
            author: '卡颂',
            cover: '',
            description: 'React框架的深度解析，从源码角度理解React的工作原理和最佳实践。',
            isbn: '9787115568380',
            totalCount: 9,
            availableCount: 4,
            category: '前端开发',
        },
    ];
}

