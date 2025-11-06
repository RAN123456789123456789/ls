/**
 * 借阅申请服务
 * 处理借阅申请的提交和管理
 */

import { getUserOpenId } from './userService';
import { getBeijingTimeISOString, formatDate as formatDateUtil, getBeijingTime } from './util';
import { sendBorrowSuccessNotification } from './subscribeService';

// API配置
const API_BASE_URL = 'https://ranguofang.com/api'; // 请替换为实际的后端API地址

/**
 * 初始化云数据库（如果使用云开发）
 */
function initCloudDB() {
    try {
        // 检查是否支持云开发且已初始化
        if (typeof wx.cloud === 'undefined' || !wx.cloud.database) {
            return null;
        }

        // 尝试获取数据库实例
        const db = wx.cloud.database();

        // 验证数据库是否可用（通过检查config属性）
        if (!db || !db.config) {
            return null;
        }

        return db;
    } catch (error) {
        console.warn('云数据库未初始化或配置错误:', error);
        return null;
    }
}

// 借阅申请状态
export enum BorrowRequestStatus {
    PENDING = 'pending', // 待审核
    APPROVED = 'approved', // 已批准
    REJECTED = 'rejected', // 已拒绝
    BORROWED = 'borrowed', // 已借出
    RETURNED = 'returned', // 已归还
    COMPLETED = 'completed', // 已完成（兼容旧状态）
}

// 借阅申请表单数据
export interface BorrowRequestForm {
    bookId: string;
    bookName: string;
    borrowDays: number;
    // 个人信息（非必填）
    name?: string; // 姓名
    phone?: string; // 电话
    email?: string; // 邮箱
    studentId?: string; // 学号/工号
    department?: string; // 部门/院系
    reason?: string; // 借阅原因
    remark?: string; // 备注
}

// 借阅申请记录
export interface BorrowRequestRecord {
    id: string;
    bookId: string;
    bookName: string;
    openId: string;
    borrowDays: number;
    borrowDate?: string; // 借阅日期（格式：YYYY-MM-DD）
    returnDate?: string; // 归还日期（格式：YYYY-MM-DD）
    borrowTime?: string; // 借出时间（ISO 字符串，北京时间）
    returnTime?: string; // 归还时间（ISO 字符串，北京时间）
    status: BorrowRequestStatus;
    // 个人信息
    name?: string;
    phone?: string;
    email?: string;
    studentId?: string;
    department?: string;
    reason?: string;
    remark?: string;
    // 审核信息
    adminOpenId?: string; // 审核管理员
    adminRemark?: string; // 审核备注
    createdAt: string; // 申请时间（ISO 字符串，北京时间）
    updatedAt: string; // 更新时间（ISO 字符串，北京时间）
}

/**
 * 提交借阅申请
 */
export async function submitBorrowRequest(
    form: BorrowRequestForm
): Promise<{ success: boolean; message?: string; data?: BorrowRequestRecord }> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const db = initCloudDB();
        const now = getBeijingTimeISOString();

        // 准备借阅申请数据
        const recordData: any = {
            bookId: form.bookId,
            bookName: form.bookName,
            openId,
            borrowDays: form.borrowDays,
            status: BorrowRequestStatus.PENDING,
            name: form.name || '',
            phone: form.phone || '',
            email: form.email || '',
            studentId: form.studentId || '',
            department: form.department || '',
            reason: form.reason || '',
            remark: form.remark || '',
            createdAt: now,
            updatedAt: now,
        };

        // 如果云数据库可用，保存到云数据库的 message 集合
        if (db) {
            try {
                console.log('保存借阅申请到云数据库 message 集合');
                const messageCollection = db.collection('message');
                const result = await messageCollection.add({
                    data: recordData
                });

                const record: BorrowRequestRecord = {
                    id: result._id,
                    ...recordData,
                };

                // 同时保存到本地存储作为备份
                const requests = wx.getStorageSync('borrow_requests') || [];
                requests.push(record);
                wx.setStorageSync('borrow_requests', requests);

                return {
                    success: true,
                    message: '申请已提交，等待管理员审核',
                    data: record,
                };
            } catch (dbError: any) {
                console.warn('云数据库保存失败，使用本地存储:', dbError);
                // 降级到本地存储
            }
        }

        // 如果 API 未配置或云数据库不可用，保存到本地存储
        if (API_BASE_URL === 'https://your-api-domain.com/api' || !db) {
            console.log('保存借阅申请到本地存储（API未配置或云数据库不可用）');

            const record: BorrowRequestRecord = {
                id: `request_${Date.now()}`,
                ...recordData,
            };

            // 保存到本地存储
            const requests = wx.getStorageSync('borrow_requests') || [];
            requests.push(record);
            wx.setStorageSync('borrow_requests', requests);

            return {
                success: true,
                message: '申请已提交，等待管理员审核',
                data: record,
            };
        }

        // 调用后端API
        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/borrow/request`,
                method: 'POST',
                data: {
                    openId,
                    ...form,
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
            return {
                success: true,
                message: '申请已提交，等待管理员审核',
                data: res.data,
            };
        } else {
            return {
                success: false,
                message: res.message || '提交申请失败',
            };
        }
    } catch (error: any) {
        console.error('提交借阅申请失败:', error);

        // 错误处理：尝试保存到本地存储
        try {
            const openId = await getUserOpenId();
            const now = getBeijingTimeISOString();
            const record: BorrowRequestRecord = {
                id: `request_${Date.now()}`,
                bookId: form.bookId,
                bookName: form.bookName,
                openId: openId || '',
                borrowDays: form.borrowDays,
                status: BorrowRequestStatus.PENDING,
                name: form.name || '',
                phone: form.phone || '',
                email: form.email || '',
                studentId: form.studentId || '',
                department: form.department || '',
                reason: form.reason || '',
                remark: form.remark || '',
                createdAt: now,
                updatedAt: now,
            };

            const requests = wx.getStorageSync('borrow_requests') || [];
            requests.push(record);
            wx.setStorageSync('borrow_requests', requests);

            return {
                success: true,
                message: '申请已提交（已保存到本地）',
                data: record,
            };
        } catch (localError) {
            return {
                success: false,
                message: error.message || '提交申请失败',
            };
        }
    }
}

/**
 * 获取所有借阅申请（管理员使用）
 * 从message集合读取数据
 */
export async function getAllBorrowRequests(): Promise<{
    success: boolean;
    data?: BorrowRequestRecord[];
    message?: string;
}> {
    try {
        const db = initCloudDB();

        // 优先从message集合读取
        if (db) {
            try {
                console.log('正在从message集合获取借阅申请列表...');
                const messageCollection = db.collection('message');

                // 尝试查询，如果失败会抛出异常
                const result = await messageCollection.orderBy('createdAt', 'desc').get();

                console.log(`message集合查询成功，返回${result.data.length}条记录`);

                if (result.data && result.data.length > 0) {
                    const records: BorrowRequestRecord[] = result.data.map((item: any) => ({
                        id: item._id,
                        bookId: item.bookId || '',
                        bookName: item.bookName || '',
                        openId: item.openId || '',
                        borrowDays: item.borrowDays || 7,
                        borrowDate: item.borrowDate,
                        returnDate: item.returnDate,
                        borrowTime: item.borrowTime, // 从message集合提取的借出时间
                        returnTime: item.returnTime, // 从message集合提取的归还时间
                        status: item.status || BorrowRequestStatus.PENDING,
                        name: item.name,
                        phone: item.phone,
                        email: item.email,
                        studentId: item.studentId,
                        department: item.department,
                        reason: item.reason,
                        remark: item.remark,
                        adminOpenId: item.adminOpenId, // 审核管理员信息
                        adminRemark: item.adminRemark, // 审核备注
                        createdAt: item.createdAt || '',
                        updatedAt: item.updatedAt || '',
                    }));

                    // 同步到本地存储以保持一致性
                    wx.setStorageSync('borrow_requests', records);

                    console.log(`✅ 成功从message集合同步${records.length}条借阅申请到管理员界面`);

                    return {
                        success: true,
                        data: records,
                    };
                } else {
                    console.log('message集合为空，返回空数组');
                    // 同步空数组到本地存储
                    wx.setStorageSync('borrow_requests', []);
                    return {
                        success: true,
                        data: [],
                    };
                }
            } catch (dbError: any) {
                console.error('❌ 从message集合读取失败:', dbError);
                console.error('错误详情:', {
                    errMsg: dbError.errMsg,
                    errCode: dbError.errCode,
                    stack: dbError.stack,
                });
                // 继续执行，尝试从本地存储获取
            }
        } else {
            console.warn('⚠️ 云数据库未初始化，无法从message集合读取');
        }

        // 如果 API 未配置或云数据库不可用，从本地存储获取
        if (API_BASE_URL === 'https://your-api-domain.com/api' || !db) {
            const requests = wx.getStorageSync('borrow_requests') || [];
            // 按创建时间倒序排序
            const sorted = requests.sort((a: BorrowRequestRecord, b: BorrowRequestRecord) => {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            });
            return {
                success: true,
                data: sorted,
            };
        }

        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/borrow/requests`,
                method: 'GET',
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
            return {
                success: false,
                message: res.message || '获取申请列表失败',
            };
        }
    } catch (error: any) {
        console.error('获取借阅申请失败:', error);
        // 错误处理：从本地存储获取
        try {
            const requests = wx.getStorageSync('borrow_requests') || [];
            return {
                success: true,
                data: requests,
            };
        } catch (localError) {
            return {
                success: false,
                message: '获取申请列表失败',
            };
        }
    }
}

/**
 * 获取我的借阅申请
 */
export async function getMyBorrowRequests(): Promise<{
    success: boolean;
    data?: BorrowRequestRecord[];
    message?: string;
}> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const db = initCloudDB();

        // 如果云数据库可用，从云数据库的 message 集合读取
        if (db) {
            try {
                console.log('从云数据库 message 集合获取我的借阅申请');
                const messageCollection = db.collection('message');
                const result = await messageCollection
                    .where({
                        openId: openId
                    })
                    .orderBy('createdAt', 'desc')
                    .get();

                const records: BorrowRequestRecord[] = result.data.map((item: any) => ({
                    id: item._id,
                    bookId: item.bookId || '',
                    bookName: item.bookName || '',
                    openId: item.openId || '',
                    borrowDays: item.borrowDays || 7,
                    borrowDate: item.borrowDate,
                    returnDate: item.returnDate,
                    borrowTime: item.borrowTime,
                    returnTime: item.returnTime,
                    status: item.status || BorrowRequestStatus.PENDING,
                    name: item.name,
                    phone: item.phone,
                    email: item.email,
                    studentId: item.studentId,
                    department: item.department,
                    reason: item.reason,
                    remark: item.remark,
                    adminOpenId: item.adminOpenId,
                    adminRemark: item.adminRemark,
                    createdAt: item.createdAt || '',
                    updatedAt: item.updatedAt || '',
                }));

                return {
                    success: true,
                    data: records,
                };
            } catch (dbError: any) {
                console.warn('云数据库查询失败，使用本地存储:', dbError);
                // 降级到本地存储
            }
        }

        // 从本地存储获取
        const requests = wx.getStorageSync('borrow_requests') || [];
        const myRequests = requests.filter(
            (r: BorrowRequestRecord) => r.openId === openId
        ).sort((a: BorrowRequestRecord, b: BorrowRequestRecord) => {
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        return {
            success: true,
            data: myRequests,
        };
    } catch (error: any) {
        console.error('获取我的借阅申请失败:', error);
        return {
            success: false,
            message: '获取申请列表失败',
        };
    }
}

/**
 * 审核借阅申请（管理员操作）
 * 从message集合读取数据，审核后同步返回到message集合
 */
export async function reviewBorrowRequest(
    requestId: string,
    action: 'approve' | 'reject',
    adminRemark?: string
): Promise<{ success: boolean; message?: string; data?: BorrowRequestRecord }> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const db = initCloudDB();
        const now = getBeijingTimeISOString();

        // 如果云数据库可用，从message集合读取并更新
        if (db) {
            try {
                console.log('从message集合读取并更新借阅申请审核结果');
                const messageCollection = db.collection('message');

                // 先获取原记录（从message集合读取）
                const doc = await messageCollection.doc(requestId).get();
                if (!doc.data) {
                    return {
                        success: false,
                        message: '申请不存在',
                    };
                }

                const originalData = doc.data;

                // 确定状态值
                const newStatus = action === 'approve' ? BorrowRequestStatus.APPROVED : BorrowRequestStatus.REJECTED;
                console.log('审核操作:', action, '当前状态:', originalData.status, '新状态:', newStatus);

                const updateData: any = {
                    status: newStatus,
                    adminOpenId: openId,
                    adminRemark: adminRemark || '',
                    updatedAt: now,
                };

                // 如果通过，设置借阅日期和归还日期（使用北京时间）
                if (action === 'approve') {
                    const borrowDate = getBeijingTime();
                    const returnDate = new Date(borrowDate);
                    const borrowDays = originalData.borrowDays || 7;
                    returnDate.setDate(returnDate.getDate() + borrowDays);
                    updateData.borrowDate = formatDateUtil(borrowDate);
                    updateData.returnDate = formatDateUtil(returnDate);
                    console.log('通过审核，设置借阅日期:', updateData.borrowDate, '归还日期:', updateData.returnDate);
                }

                // 同步返回到message集合
                console.log('准备更新message集合，requestId:', requestId);
                console.log('更新数据:', JSON.stringify(updateData, null, 2));
                console.log('状态字段值:', updateData.status, '类型:', typeof updateData.status);

                const updateResult = await messageCollection.doc(requestId).update({
                    data: updateData
                });

                console.log('数据库更新结果:', updateResult);
                console.log('更新结果统计:', updateResult.stats);

                // 等待一小段时间确保更新完成
                await new Promise(resolve => setTimeout(resolve, 200));

                // 验证更新是否成功（重新查询确认）
                const verifyDoc = await messageCollection.doc(requestId).get();
                console.log('验证查询结果:', verifyDoc.data);
                console.log('期望状态:', newStatus, '实际状态:', verifyDoc.data?.status);

                if (!verifyDoc.data) {
                    console.error('验证失败：文档不存在');
                    throw new Error('数据库更新验证失败：文档不存在');
                }

                if (verifyDoc.data.status !== newStatus) {
                    console.error('数据库更新验证失败');
                    console.error('期望状态:', newStatus, '类型:', typeof newStatus);
                    console.error('实际状态:', verifyDoc.data.status, '类型:', typeof verifyDoc.data.status);
                    console.error('状态是否相等:', verifyDoc.data.status === newStatus);
                    throw new Error(`数据库更新验证失败：期望状态 ${newStatus}，实际状态 ${verifyDoc.data.status}`);
                }

                console.log('数据库状态更新验证成功，状态已更新为:', newStatus);

                // 构建完整的更新后记录
                const updatedRecord: BorrowRequestRecord = {
                    id: requestId,
                    bookId: originalData.bookId || '',
                    bookName: originalData.bookName || '',
                    openId: originalData.openId || '',
                    borrowDays: originalData.borrowDays || 7,
                    borrowDate: updateData.borrowDate,
                    returnDate: updateData.returnDate,
                    borrowTime: originalData.borrowTime,
                    returnTime: originalData.returnTime,
                    status: updateData.status,
                    name: originalData.name,
                    phone: originalData.phone,
                    email: originalData.email,
                    studentId: originalData.studentId,
                    department: originalData.department,
                    reason: originalData.reason,
                    remark: originalData.remark,
                    adminOpenId: openId,
                    adminRemark: adminRemark || '',
                    createdAt: originalData.createdAt || '',
                    updatedAt: now,
                };

                // 同时更新本地存储以保持一致性
                const requests = wx.getStorageSync('borrow_requests') || [];
                const index = requests.findIndex((r: BorrowRequestRecord) => r.id === requestId);
                if (index >= 0) {
                    requests[index] = updatedRecord;
                } else {
                    requests.push(updatedRecord);
                }
                wx.setStorageSync('borrow_requests', requests);

                console.log('审核结果已同步到message集合:', {
                    requestId,
                    action,
                    status: updateData.status,
                });

                return {
                    success: true,
                    message: action === 'approve' ? '已通过申请' : '已拒绝申请',
                    data: updatedRecord,
                };
            } catch (dbError: any) {
                console.error('云数据库更新失败:', dbError);
                // 抛出错误，让外层处理
                throw dbError;
            }
        }

        // 如果 API 未配置或云数据库不可用，更新本地存储
        if (API_BASE_URL === 'https://your-api-domain.com/api' || !db) {
            const requests = wx.getStorageSync('borrow_requests') || [];
            const index = requests.findIndex((r: BorrowRequestRecord) => r.id === requestId);

            if (index >= 0) {
                const request = requests[index];
                request.status = action === 'approve'
                    ? BorrowRequestStatus.APPROVED
                    : BorrowRequestStatus.REJECTED;
                request.adminOpenId = openId;
                request.adminRemark = adminRemark;
                request.updatedAt = now;

                // 如果通过，设置借阅日期和归还日期（使用北京时间）
                if (action === 'approve') {
                    const borrowDate = getBeijingTime();
                    const returnDate = new Date(borrowDate);
                    returnDate.setDate(returnDate.getDate() + request.borrowDays);
                    request.borrowDate = formatDateUtil(borrowDate);
                    request.returnDate = formatDateUtil(returnDate);
                }

                requests[index] = request;
                wx.setStorageSync('borrow_requests', requests);

                return {
                    success: true,
                    message: action === 'approve' ? '已通过申请' : '已拒绝申请',
                    data: request,
                };
            } else {
                return {
                    success: false,
                    message: '申请不存在',
                };
            }
        }

        // 调用后端API
        const res = await new Promise<any>((resolve, reject) => {
            wx.request({
                url: `${API_BASE_URL}/borrow/request/review`,
                method: 'POST',
                data: {
                    requestId,
                    action,
                    adminOpenId: openId,
                    adminRemark,
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
            return {
                success: true,
                message: action === 'approve' ? '已通过申请' : '已拒绝申请',
            };
        } else {
            return {
                success: false,
                message: res.message || '审核失败',
            };
        }
    } catch (error: any) {
        console.error('审核借阅申请失败:', error);
        return {
            success: false,
            message: '审核失败，请稍后重试',
        };
    }
}

/**
 * 确认借出（管理员操作）
 * 从message集合读取数据，确认后同步返回到message集合
 * @param requestId 申请ID
 * @param dueDate 归还日期（格式：YYYY-MM-DD）
 */
export async function confirmBorrow(
    requestId: string,
    dueDate: string
): Promise<{ success: boolean; message?: string; data?: BorrowRequestRecord }> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const db = initCloudDB();
        const now = getBeijingTimeISOString();

        // 如果云数据库可用，从message集合读取并更新
        if (db) {
            try {
                console.log('从message集合读取并更新借出确认结果');
                const messageCollection = db.collection('message');

                // 先获取原记录（从message集合读取）
                const doc = await messageCollection.doc(requestId).get();
                if (!doc.data) {
                    return {
                        success: false,
                        message: '申请不存在',
                    };
                }

                const originalData = doc.data;

                // 计算借阅日期（使用北京时间，默认为当天）
                const today = getBeijingTime();
                const borrowDate = formatDateUtil(today);

                console.log('确认借出操作:', {
                    requestId,
                    currentStatus: originalData.status,
                    newStatus: BorrowRequestStatus.BORROWED,
                    borrowDate,
                    returnDate: dueDate,
                    todayBeijingTime: today.toISOString(),
                });

                // 验证归还日期格式
                const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
                if (!dateRegex.test(dueDate)) {
                    throw new Error(`归还日期格式错误: ${dueDate}，应为 YYYY-MM-DD 格式`);
                }

                const updateData: any = {
                    status: BorrowRequestStatus.BORROWED,
                    borrowDate: borrowDate, // 借阅日期为当天
                    returnDate: dueDate, // 归还日期为用户输入
                    borrowTime: now, // 借出时间（北京时间）
                    updatedAt: now,
                };

                // 同步返回到message集合
                console.log('准备更新message集合（确认借出），requestId:', requestId);
                console.log('更新数据:', JSON.stringify(updateData, null, 2));
                console.log('状态字段值:', updateData.status, '类型:', typeof updateData.status);

                const updateResult = await messageCollection.doc(requestId).update({
                    data: updateData
                });

                console.log('数据库更新结果（确认借出）:', updateResult);
                console.log('更新结果统计:', updateResult.stats);

                // 等待一小段时间确保更新完成
                await new Promise(resolve => setTimeout(resolve, 200));

                // 验证更新是否成功（重新查询确认）
                const verifyDoc = await messageCollection.doc(requestId).get();
                console.log('验证查询结果（确认借出）:', verifyDoc.data);
                console.log('期望状态:', BorrowRequestStatus.BORROWED, '实际状态:', verifyDoc.data?.status);

                if (!verifyDoc.data) {
                    console.error('验证失败（确认借出）：文档不存在');
                    throw new Error('数据库更新验证失败：文档不存在');
                }

                if (verifyDoc.data.status !== BorrowRequestStatus.BORROWED) {
                    console.error('数据库更新验证失败（确认借出）');
                    console.error('期望状态:', BorrowRequestStatus.BORROWED, '类型:', typeof BorrowRequestStatus.BORROWED);
                    console.error('实际状态:', verifyDoc.data.status, '类型:', typeof verifyDoc.data.status);
                    console.error('状态是否相等:', verifyDoc.data.status === BorrowRequestStatus.BORROWED);
                    throw new Error(`数据库更新验证失败：期望状态 ${BorrowRequestStatus.BORROWED}，实际状态 ${verifyDoc.data.status}`);
                }

                // 验证借阅日期和归还日期是否正确更新
                if (verifyDoc.data.borrowDate !== borrowDate) {
                    console.warn('借阅日期不匹配，期望:', borrowDate, '实际:', verifyDoc.data.borrowDate);
                }
                if (verifyDoc.data.returnDate !== dueDate) {
                    console.warn('归还日期不匹配，期望:', dueDate, '实际:', verifyDoc.data.returnDate);
                }

                console.log('数据库状态更新验证成功（确认借出），状态已更新为:', BorrowRequestStatus.BORROWED);

                // 构建完整的更新后记录
                const updatedRecord: BorrowRequestRecord = {
                    id: requestId,
                    bookId: originalData.bookId || '',
                    bookName: originalData.bookName || '',
                    openId: originalData.openId || '',
                    borrowDays: originalData.borrowDays || 7,
                    borrowDate: updateData.borrowDate,
                    returnDate: updateData.returnDate,
                    borrowTime: updateData.borrowTime,
                    returnTime: originalData.returnTime,
                    status: BorrowRequestStatus.BORROWED,
                    name: originalData.name,
                    phone: originalData.phone,
                    email: originalData.email,
                    studentId: originalData.studentId,
                    department: originalData.department,
                    reason: originalData.reason,
                    remark: originalData.remark,
                    adminOpenId: originalData.adminOpenId,
                    adminRemark: originalData.adminRemark,
                    createdAt: originalData.createdAt || '',
                    updatedAt: now,
                };

                // 同时更新本地存储以保持一致性
                const requests = wx.getStorageSync('borrow_requests') || [];
                const index = requests.findIndex((r: BorrowRequestRecord) => r.id === requestId);
                if (index >= 0) {
                    requests[index] = updatedRecord;
                } else {
                    requests.push(updatedRecord);
                }
                wx.setStorageSync('borrow_requests', requests);

                console.log('借出确认结果已同步到message集合:', {
                    requestId,
                    borrowDate: updateData.borrowDate,
                    returnDate: updateData.returnDate,
                });

                // 发送借阅成功订阅消息（不请求权限，因为应该在借阅申请时已授权）
                try {
                    if (updatedRecord.openId && updatedRecord.bookName) {
                        await sendBorrowSuccessNotification(
                            updatedRecord.openId,
                            updatedRecord.bookName,
                            updateData.borrowDate,
                            updateData.returnDate,
                            requestId, // 使用requestId作为借阅编号
                            'pages/myBorrows/myBorrows', // 点击后跳转到我的借阅页面
                            false // 不请求权限，因为应该在申请时已授权
                        ).catch(err => {
                            console.warn('发送借阅成功通知失败:', err);
                        });
                    }
                } catch (subscribeError) {
                    // 订阅消息发送失败不影响借出确认
                    console.warn('发送订阅消息失败:', subscribeError);
                }

                return {
                    success: true,
                    message: '借出确认成功',
                    data: updatedRecord,
                };
            } catch (dbError: any) {
                console.error('云数据库更新失败（确认借出）:', dbError);
                // 抛出错误，让外层处理
                throw dbError;
            }
        }

        // 更新本地存储
        const requests = wx.getStorageSync('borrow_requests') || [];
        const index = requests.findIndex((r: BorrowRequestRecord) => r.id === requestId);

        if (index >= 0) {
            const request = requests[index];
            request.status = BorrowRequestStatus.BORROWED;
            request.borrowDate = formatDateUtil(getBeijingTime());
            request.returnDate = dueDate;
            request.borrowTime = now; // 借出时间（北京时间）
            request.updatedAt = now;

            requests[index] = request;
            wx.setStorageSync('borrow_requests', requests);

            return {
                success: true,
                message: '借出确认成功',
            };
        } else {
            return {
                success: false,
                message: '申请不存在',
            };
        }
    } catch (error: any) {
        console.error('确认借出失败:', error);
        return {
            success: false,
            message: '确认借出失败，请稍后重试',
        };
    }
}

/**
 * 确认归还（管理员操作）
 * @param requestId 申请ID
 */
export async function confirmReturn(
    requestId: string
): Promise<{ success: boolean; message?: string; data?: BorrowRequestRecord }> {
    try {
        const openId = await getUserOpenId();
        if (!openId) {
            return {
                success: false,
                message: '请先登录',
            };
        }

        const db = initCloudDB();
        const now = getBeijingTimeISOString();

        // 如果云数据库可用，更新云数据库的 message 集合
        if (db) {
            try {
                console.log('更新云数据库 message 集合，确认归还');
                const messageCollection = db.collection('message');

                // 先获取原记录（从message集合提取完整时间信息）
                const doc = await messageCollection.doc(requestId).get();
                if (!doc.data) {
                    return {
                        success: false,
                        message: '申请不存在',
                    };
                }

                const originalData = doc.data;
                const updateData: any = {
                    status: BorrowRequestStatus.RETURNED,
                    returnTime: now, // 归还时间（北京时间）
                    updatedAt: now,
                };

                console.log('准备更新message集合（确认归还），requestId:', requestId, 'updateData:', updateData);
                const updateResult = await messageCollection.doc(requestId).update({
                    data: updateData
                });

                console.log('数据库更新结果（确认归还）:', updateResult);

                // 验证更新是否成功（重新查询确认）
                const verifyDoc = await messageCollection.doc(requestId).get();
                if (!verifyDoc.data || verifyDoc.data.status !== BorrowRequestStatus.RETURNED) {
                    console.error('数据库更新验证失败（确认归还），期望状态:', BorrowRequestStatus.RETURNED, '实际状态:', verifyDoc.data?.status);
                    throw new Error('数据库更新验证失败');
                }

                // 构建完整的记录信息（包含从message集合提取的时间信息）
                const updatedRecord: BorrowRequestRecord = {
                    id: requestId,
                    bookId: originalData.bookId || '',
                    bookName: originalData.bookName || '',
                    openId: originalData.openId || '',
                    borrowDays: originalData.borrowDays || 7,
                    borrowDate: originalData.borrowDate,
                    returnDate: originalData.returnDate,
                    borrowTime: originalData.borrowTime, // 从message集合提取的借出时间
                    returnTime: now, // 归还时间
                    status: BorrowRequestStatus.RETURNED,
                    name: originalData.name,
                    phone: originalData.phone,
                    email: originalData.email,
                    studentId: originalData.studentId,
                    department: originalData.department,
                    reason: originalData.reason,
                    remark: originalData.remark,
                    adminOpenId: originalData.adminOpenId,
                    adminRemark: originalData.adminRemark,
                    createdAt: originalData.createdAt || '',
                    updatedAt: now,
                };

                // 同时更新本地存储
                const requests = wx.getStorageSync('borrow_requests') || [];
                const index = requests.findIndex((r: BorrowRequestRecord) => r.id === requestId);
                if (index >= 0) {
                    requests[index] = updatedRecord;
                    wx.setStorageSync('borrow_requests', requests);
                }

                console.log('归还确认结果已同步到message集合:', {
                    requestId,
                    status: BorrowRequestStatus.RETURNED,
                });

                return {
                    success: true,
                    message: '归还确认成功',
                    data: updatedRecord,
                };
            } catch (dbError: any) {
                console.error('云数据库更新失败（确认归还）:', dbError);
                // 抛出错误，让外层处理
                throw dbError;
            }
        }

        // 更新本地存储
        const requests = wx.getStorageSync('borrow_requests') || [];
        const index = requests.findIndex((r: BorrowRequestRecord) => r.id === requestId);

        if (index >= 0) {
            const request = requests[index];
            request.status = BorrowRequestStatus.RETURNED;
            request.returnTime = now; // 归还时间（北京时间）
            request.updatedAt = now;

            requests[index] = request;
            wx.setStorageSync('borrow_requests', requests);

            return {
                success: true,
                message: '归还确认成功',
                data: request,
            };
        } else {
            return {
                success: false,
                message: '申请不存在',
            };
        }
    } catch (error: any) {
        console.error('确认归还失败:', error);
        return {
            success: false,
            message: '确认归还失败，请稍后重试',
        };
    }
}


