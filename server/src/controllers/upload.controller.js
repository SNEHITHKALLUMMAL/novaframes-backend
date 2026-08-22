import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import * as uploadService from '../services/upload.service.js';

export const uploadImage = asyncHandler(async (req, res) => {
  const { uploadedFile, url } = await uploadService.validateAndStoreImage(req.user._id, req.file);
  sendSuccess(res, {
    statusCode: HTTP_STATUS.CREATED,
    message: 'Image uploaded successfully',
    data: { file: uploadedFile, url },
  });
});
