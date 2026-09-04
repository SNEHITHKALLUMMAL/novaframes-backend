/**
 * Standard success envelope, matching the SRS api_architecture.response_format:
 * { success: true, message, data }
 */
export function sendSuccess(res, { statusCode = 200, message = 'Success', data = {} } = {}) {
  return res.status(statusCode).json({ success: true, message, data });
}
