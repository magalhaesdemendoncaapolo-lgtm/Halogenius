import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";

const hasCloudinaryUrl = Boolean(process.env.CLOUDINARY_URL);
const hasCloudinaryCredentials = [
	process.env.CLOUDINARY_CLOUD_NAME,
	process.env.CLOUDINARY_API_KEY,
	process.env.CLOUDINARY_API_SECRET,
].every(Boolean);

if (hasCloudinaryCredentials && !hasCloudinaryUrl) {
	cloudinary.config({
		cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
		api_key: process.env.CLOUDINARY_API_KEY,
		api_secret: process.env.CLOUDINARY_API_SECRET,
	});
}

export const cloudinaryEnabled = hasCloudinaryUrl || hasCloudinaryCredentials;

export function uploadVideoToCloudinary(stream, originalFilename) {
	if (!cloudinaryEnabled) {
		throw new Error("Cloudinary não está configurado.");
	}

	return new Promise((resolve, reject) => {
		const uploadStream = cloudinary.uploader.upload_stream(
			{
				resource_type: "video",
				folder: "halogenius",
				filename_override: originalFilename,
			},
			(error, result) => {
				if (error) return reject(error);
				return resolve(result);
			},
		);

		stream.on("error", reject);
		stream.pipe(uploadStream);
	});
}

export async function deleteVideoFromCloudinary(publicId) {
	if (!cloudinaryEnabled || !publicId) return;

	await cloudinary.uploader.destroy(publicId, {
		resource_type: "video",
		invalidate: true,
	});
}
