const axios = require('axios');
const FormData = require('form-data');

/**
 * Uploads a base64 image string to ImgBB and returns the URL.
 * If the input is already a URL, it just returns it.
 * @param {string} imageData - Base64 string or URL
 * @returns {Promise<string>} - The uploaded image URL or original URL
 */
exports.uploadToImgBB = async (imageData) => {
  if (!imageData || !imageData.startsWith('data:image')) {
    return imageData;
  }

  const IMGBB_KEY = process.env.IMGBB_KEY;
  if (!IMGBB_KEY) {
    console.warn('⚠️  IMGBB_KEY missing in .env, returning original data');
    return imageData;
  }

  try {
    const base64Content = imageData.split(',')[1] || imageData;
    const form = new FormData();
    form.append('image', base64Content);

    const response = await axios.post(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, form, {
      headers: form.getHeaders(),
    });

    if (response.data && response.data.success) {
      return response.data.data.url;
    }
    return imageData;
  } catch (error) {
    console.error('❌ ImgBB Upload Error:', error.message);
    return imageData;
  }
};
