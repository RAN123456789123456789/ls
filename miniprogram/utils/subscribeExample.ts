/**
 * 订阅消息使用示例
 * 展示如何在借阅、归还等场景中使用订阅消息
 */

import {
    SubscribeMessageType,
    requestSubscribeBeforeAction,
} from './subscribeMessage';
import {
    sendBorrowSuccessNotification,
    sendReturnSuccessNotification,
} from './subscribeService';
import {
    saveBorrowRecord,
    removeBorrowRecord,
    BorrowRecord,
} from './subscribeScheduler';

/**
 * 示例：借阅图书时发送订阅消息
 */
export async function borrowBookExample(
    bookName: string,
    borrowDays: number = 7
): Promise<{ success: boolean; message?: string }> {
    // 1. 在借阅前请求订阅授权
    const authorized = await requestSubscribeBeforeAction([
        SubscribeMessageType.BORROW_SUCCESS,
        SubscribeMessageType.RETURN_REMINDER,
    ]);

    if (!authorized) {
        wx.showToast({
            title: '建议开启订阅以接收通知',
            icon: 'none',
        });
    }

    // 2. 执行借阅操作（这里需要替换为实际的借阅API调用）
    // const borrowResult = await yourBorrowAPI(bookName);

    // 3. 模拟借阅成功
    const borrowDate = new Date();
    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + borrowDays);

    const borrowDateStr = formatDate(borrowDate);
    const returnDateStr = formatDate(returnDate);

    // 4. 获取用户openId（需要从登录接口获取）
    const openId = await getUserOpenId(); // 需要实现获取openId的方法

    // 5. 发送借阅成功通知
    if (authorized && openId) {
        const sendResult = await sendBorrowSuccessNotification(
            openId,
            bookName,
            borrowDateStr,
            returnDateStr,
            `BR${Date.now()}` // 借阅编号
        );

        if (!sendResult.success) {
            console.warn('发送借阅成功通知失败:', sendResult.message);
        }
    }

    // 6. 保存借阅记录（用于定时提醒）
    const record: BorrowRecord = {
        id: `record_${Date.now()}`,
        bookName,
        borrowDate: borrowDateStr,
        returnDate: returnDateStr,
        borrowNumber: `BR${Date.now()}`,
        openId: openId || '',
    };
    saveBorrowRecord(record);

    return {
        success: true,
        message: '借阅成功',
    };
}

/**
 * 示例：归还图书时发送订阅消息
 */
export async function returnBookExample(
    recordId: string,
    bookName: string
): Promise<{ success: boolean; message?: string }> {
    // 1. 执行归还操作（这里需要替换为实际的归还API调用）
    // const returnResult = await yourReturnAPI(recordId);

    // 2. 获取用户openId
    const openId = await getUserOpenId();

    // 3. 发送归还成功通知
    if (openId) {
        const returnDate = formatDate(new Date());
        const sendResult = await sendReturnSuccessNotification(
            openId,
            bookName,
            returnDate,
            `BR${Date.now()}`
        );

        if (!sendResult.success) {
            console.warn('发送归还成功通知失败:', sendResult.message);
        }
    }

    // 4. 删除借阅记录
    removeBorrowRecord(recordId);

    return {
        success: true,
        message: '归还成功',
    };
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 获取用户openId
 * 需要根据实际的后端接口实现
 */
async function getUserOpenId(): Promise<string> {
    return new Promise((resolve, reject) => {
        wx.login({
            success: async (res) => {
                // 这里需要调用后端API获取openId
                // const response = await wx.request({
                //   url: 'https://your-api.com/getOpenId',
                //   data: { code: res.code },
                // });
                // resolve(response.data.openId);

                // 临时返回空字符串，需要替换为实际实现
                resolve('');
            },
            fail: reject,
        });
    });
}


