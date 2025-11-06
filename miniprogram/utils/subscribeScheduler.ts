/**
 * 订阅消息定时调度工具
 * 用于在指定时间发送订阅消息（如归还日期提醒）
 */

import {
    SubscribeMessageType,
    checkSubscribeStatus,
} from './subscribeMessage';
import {
    sendReturnReminderNotification,
    sendOverdueReminderNotification,
} from './subscribeService';
import { BorrowRequestStatus } from './borrowRequestService';

// 初始化云数据库（如果使用云开发）
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

// 借阅记录接口
export interface BorrowRecord {
    id: string;
    bookName: string;
    borrowDate: string; // 借阅日期，格式：YYYY-MM-DD
    returnDate: string; // 归还日期，格式：YYYY-MM-DD
    borrowTime?: string; // 借出时间（ISO 字符串，北京时间）
    returnTime?: string; // 归还时间（ISO 字符串，北京时间）
    borrowNumber?: string;
    openId: string;
    status: string;
}

/**
 * 检查并发送归还提醒
 * 在归还日期前3天、1天发送提醒
 * 从message集合读取数据
 */
export async function checkAndSendReturnReminders(): Promise<void> {
    try {
        const records = await getBorrowRecordsFromMessage();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // 获取已发送提醒的记录（避免重复发送）
        const sentReminders = wx.getStorageSync('sent_return_reminders') || {};
        const todayStr = formatDate(today);

        for (const record of records) {
            // 只处理已借出状态的记录
            if (record.status !== BorrowRequestStatus.BORROWED) {
                continue;
            }

            if (!record.returnDate || !record.openId) {
                continue;
            }

            const returnDate = new Date(record.returnDate);
            returnDate.setHours(0, 0, 0, 0);

            // 检查是否已过期
            if (returnDate < today) {
                // 已过期，发送逾期提醒
                const overdueDays = Math.floor((today.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24));
                if (overdueDays > 0) {
                    // 检查今天是否已发送过逾期提醒
                    const reminderKey = `${record.id}_overdue_${todayStr}`;
                    if (!sentReminders[reminderKey]) {
                        // 检查用户是否已授权逾期提醒订阅消息
                        if (checkSubscribeStatus(SubscribeMessageType.OVERDUE_REMINDER)) {
                            try {
                                await sendOverdueReminderNotification(
                                    record.openId,
                                    record.bookName,
                                    record.returnDate,
                                    overdueDays,
                                    record.borrowNumber,
                                    'pages/myBorrows/myBorrows',
                                    false // 不请求权限，只在已授权时发送
                                );

                                // 记录已发送
                                sentReminders[reminderKey] = true;
                                wx.setStorageSync('sent_return_reminders', sentReminders);
                                console.log(`已发送逾期提醒: ${record.bookName}, 逾期${overdueDays}天`);
                            } catch (err) {
                                console.error('发送逾期提醒失败:', err);
                            }
                        } else {
                            console.log(`用户未授权逾期提醒，跳过: ${record.bookName}`);
                        }
                    }
                }
            } else {
                // 未过期，检查是否需要发送归还提醒
                const daysLeft = Math.floor((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                // 在归还日期前3天、1天发送提醒
                if ([1, 3].includes(daysLeft)) {
                    // 检查今天是否已发送过该提醒
                    const reminderKey = `${record.id}_${daysLeft}days_${todayStr}`;
                    if (!sentReminders[reminderKey]) {
                        // 检查用户是否已授权归还提醒订阅消息
                        if (checkSubscribeStatus(SubscribeMessageType.RETURN_REMINDER)) {
                            try {
                                await sendReturnReminderNotification(
                                    record.openId,
                                    record.bookName,
                                    record.returnDate,
                                    daysLeft,
                                    record.borrowNumber,
                                    'pages/myBorrows/myBorrows',
                                    false // 不请求权限，只在已授权时发送
                                );

                                // 记录已发送
                                sentReminders[reminderKey] = true;
                                wx.setStorageSync('sent_return_reminders', sentReminders);
                                console.log(`已发送归还提醒: ${record.bookName}, 还剩${daysLeft}天`);
                            } catch (err) {
                                console.error('发送归还提醒失败:', err);
                            }
                        } else {
                            console.log(`用户未授权归还提醒，跳过: ${record.bookName}`);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('检查归还提醒失败:', error);
    }
}

/**
 * 格式化日期为 YYYY-MM-DD 格式
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 从message集合获取借阅记录
 * 提取时间信息（borrowTime, returnTime, returnDate等）
 * 只从message集合读取，不同步本地存储
 */
async function getBorrowRecordsFromMessage(): Promise<BorrowRecord[]> {
    try {
        const db = initCloudDB();

        // 如果云数据库可用，从message集合读取
        if (db) {
            try {
                console.log('从message集合获取借阅记录（用于订阅消息）');
                const messageCollection = db.collection('message');

                // 获取所有已借出的记录（只处理未归还的）
                const result = await messageCollection
                    .where({
                        status: BorrowRequestStatus.BORROWED
                    })
                    .get();

                console.log(`从message集合获取到${result.data.length}条借阅记录`);

                const records: BorrowRecord[] = result.data.map((item: any) => ({
                    id: item._id,
                    bookName: item.bookName || '',
                    borrowDate: item.borrowDate || '',
                    returnDate: item.returnDate || '',
                    borrowTime: item.borrowTime, // 从message集合提取的借出时间
                    returnTime: item.returnTime, // 从message集合提取的归还时间
                    borrowNumber: item.id || item._id,
                    openId: item.openId || '',
                    status: item.status || '',
                }));

                return records;
            } catch (dbError: any) {
                console.error('从message集合读取失败:', dbError);
                // 如果数据库读取失败，返回空数组，不再降级到本地存储
                return [];
            }
        }

        // 如果云数据库不可用，返回空数组
        console.warn('云数据库不可用，无法从message集合读取借阅记录');
        return [];
    } catch (error) {
        console.error('获取借阅记录失败:', error);
        return [];
    }
}

/**
 * 获取借阅记录（兼容旧版本）
 * 从本地存储或服务器获取
 */
function getBorrowRecords(): BorrowRecord[] {
    try {
        // 这里可以从本地存储获取，或者调用API从服务器获取
        const records = wx.getStorageSync('borrow_records') || [];
        return records;
    } catch (error) {
        console.error('获取借阅记录失败:', error);
        return [];
    }
}

/**
 * 保存借阅记录
 */
export function saveBorrowRecord(record: BorrowRecord): void {
    try {
        const records = getBorrowRecords();
        const index = records.findIndex(r => r.id === record.id);

        if (index >= 0) {
            records[index] = record;
        } else {
            records.push(record);
        }

        wx.setStorageSync('borrow_records', records);
    } catch (error) {
        console.error('保存借阅记录失败:', error);
    }
}

/**
 * 删除借阅记录
 */
export function removeBorrowRecord(recordId: string): void {
    try {
        const records = getBorrowRecords();
        const filtered = records.filter(r => r.id !== recordId);
        wx.setStorageSync('borrow_records', filtered);
    } catch (error) {
        console.error('删除借阅记录失败:', error);
    }
}

/**
 * 初始化定时检查
 * 在小程序启动时调用，定时检查需要发送的提醒
 */
export function initSubscribeScheduler(): void {
    // 立即检查一次（异步）
    checkAndSendReturnReminders().catch(err => {
        console.error('初始化订阅消息调度器失败:', err);
    });

    // 每天检查一次（在指定时间，如早上9点）
    // 注意：小程序无法使用setInterval长期运行，这里需要在app.ts的onShow中调用
    // 或者使用云函数定时触发器
}

/**
 * 测试：检查归还提醒（带详细日志）
 * 返回检查结果，用于测试和调试
 */
export async function testCheckAndSendReturnReminders(): Promise<{
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
}> {
    const result = {
        success: true,
        totalRecords: 0,
        recordsChecked: 0,
        remindersToSend: [] as Array<{
            bookName: string;
            returnDate: string;
            daysLeft: number;
            openId: string;
            alreadySent: boolean;
            authorized: boolean;
        }>,
        sentCount: 0,
        message: '',
    };

    try {
        const records = await getBorrowRecordsFromMessage();
        result.totalRecords = records.length;

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = formatDate(today);

        // 获取已发送提醒的记录
        const sentReminders = wx.getStorageSync('sent_return_reminders') || {};

        for (const record of records) {
            // 只处理已借出状态的记录
            if (record.status !== BorrowRequestStatus.BORROWED) {
                continue;
            }

            if (!record.returnDate || !record.openId) {
                continue;
            }

            result.recordsChecked++;

            const returnDate = new Date(record.returnDate);
            returnDate.setHours(0, 0, 0, 0);

            // 检查是否已过期
            if (returnDate < today) {
                const overdueDays = Math.floor((today.getTime() - returnDate.getTime()) / (1000 * 60 * 60 * 24));
                const reminderKey = `${record.id}_overdue_${todayStr}`;
                const alreadySent = !!sentReminders[reminderKey];
                const authorized = checkSubscribeStatus(SubscribeMessageType.OVERDUE_REMINDER);

                result.remindersToSend.push({
                    bookName: record.bookName,
                    returnDate: record.returnDate,
                    daysLeft: -overdueDays, // 负数表示逾期
                    openId: record.openId.substring(0, 8) + '...', // 只显示前8位
                    alreadySent,
                    authorized,
                });

                if (!alreadySent && authorized) {
                    try {
                        await sendOverdueReminderNotification(
                            record.openId,
                            record.bookName,
                            record.returnDate,
                            overdueDays,
                            record.borrowNumber,
                            'pages/myBorrows/myBorrows',
                            false
                        );
                        sentReminders[reminderKey] = true;
                        wx.setStorageSync('sent_return_reminders', sentReminders);
                        result.sentCount++;
                    } catch (err) {
                        console.error('发送逾期提醒失败:', err);
                    }
                }
            } else {
                // 未过期，检查是否需要发送归还提醒
                const daysLeft = Math.floor((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

                // 在归还日期前3天、1天发送提醒
                if ([1, 3].includes(daysLeft)) {
                    const reminderKey = `${record.id}_${daysLeft}days_${todayStr}`;
                    const alreadySent = !!sentReminders[reminderKey];
                    const authorized = checkSubscribeStatus(SubscribeMessageType.RETURN_REMINDER);

                    result.remindersToSend.push({
                        bookName: record.bookName,
                        returnDate: record.returnDate,
                        daysLeft,
                        openId: record.openId.substring(0, 8) + '...',
                        alreadySent,
                        authorized,
                    });

                    if (!alreadySent && authorized) {
                        try {
                            await sendReturnReminderNotification(
                                record.openId,
                                record.bookName,
                                record.returnDate,
                                daysLeft,
                                record.borrowNumber,
                                'pages/myBorrows/myBorrows',
                                false
                            );
                            sentReminders[reminderKey] = true;
                            wx.setStorageSync('sent_return_reminders', sentReminders);
                            result.sentCount++;
                        } catch (err) {
                            console.error('发送归还提醒失败:', err);
                        }
                    }
                }
            }
        }

        result.message = `检查完成：共${result.totalRecords}条记录，检查了${result.recordsChecked}条，找到${result.remindersToSend.length}条需要提醒的记录，已发送${result.sentCount}条`;
    } catch (error: any) {
        result.success = false;
        result.message = `检查失败: ${error.message}`;
        console.error('测试检查归还提醒失败:', error);
    }

    return result;
}


