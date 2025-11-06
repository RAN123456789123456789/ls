export const formatTime = (date: Date) => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return (
    [year, month, day].map(formatNumber).join('/') +
    ' ' +
    [hour, minute, second].map(formatNumber).join(':')
  )
}

const formatNumber = (n: number) => {
  const s = n.toString()
  return s[1] ? s : '0' + s
}

/**
 * 获取北京时间（UTC+8）
 * @returns 北京时间的 Date 对象
 */
export function getBeijingTime(): Date {
  const now = new Date();
  // 获取 UTC 时间
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  // 加上8小时（北京时间 = UTC + 8小时）
  const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
  return beijingTime;
}

/**
 * 获取北京时间的 ISO 字符串
 * @returns 北京时间的 ISO 字符串（格式：YYYY-MM-DDTHH:mm:ss.sssZ）
 */
export function getBeijingTimeISOString(): string {
  const beijingTime = getBeijingTime();
  // 转换为 ISO 字符串，但保持北京时间
  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');
  const hours = String(beijingTime.getHours()).padStart(2, '0');
  const minutes = String(beijingTime.getMinutes()).padStart(2, '0');
  const seconds = String(beijingTime.getSeconds()).padStart(2, '0');
  const milliseconds = String(beijingTime.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}+08:00`;
}

/**
 * 格式化日期为 YYYY-MM-DD（使用北京时间）
 * @param date Date 对象
 * @returns 格式化的日期字符串
 */
export function formatDate(date: Date): string {
  const beijingTime = getBeijingTimeFromDate(date);
  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 将 Date 对象转换为北京时间
 * @param date Date 对象
 * @returns 北京时间的 Date 对象
 */
export function getBeijingTimeFromDate(date: Date): Date {
  const utcTime = date.getTime() + (date.getTimezoneOffset() * 60 * 1000);
  const beijingTime = new Date(utcTime + (8 * 60 * 60 * 1000));
  return beijingTime;
}

/**
 * 获取今天的日期（北京时间，格式：YYYY-MM-DD）
 * @returns 今天的日期字符串
 */
export function getTodayBeijingDate(): string {
  return formatDate(getBeijingTime());
}
