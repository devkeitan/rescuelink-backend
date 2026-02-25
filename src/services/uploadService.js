const supabase = require('../config/supabase');
const path = require('path');

/**
 * Upload a file to Supabase Storage
 * @param {Object} options - Upload options
 * @param {Buffer} options.fileBuffer - File buffer from multer
 * @param {string} options.originalName - Original file name (for extension)
 * @param {string|number} options.userId - User ID (used in filename)
 * @param {string} options.bucket - Supabase storage bucket name (default: 'alert-images')
 * @param {string} options.folder - Optional subfolder inside bucket (default: 'alerts')
 * @param {string} options.contentType - MIME type of the file (default: from multer)
 * @returns {Promise<string>} - Public URL of the uploaded file
 * @throws {Error} - If upload fails
 */
const uploadFile = async ({
  fileBuffer,
  originalName,
  userId,
  bucket = 'alert-images',
  folder = 'alerts',
  contentType
}) => {
  try {
    // Generate a unique filename: userId_timestamp.extension
    const fileExt = path.extname(originalName);
    const fileName = `${userId}_${Date.now()}${fileExt}`;
    const filePath = folder ? `${folder}/${fileName}` : fileName;

    // Upload to Supabase
    const { error } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileBuffer, {
        contentType: contentType || 'application/octet-stream',
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error('Supabase storage upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Upload service error:', error);
    throw error;
  }
};

module.exports = {
  uploadFile
};