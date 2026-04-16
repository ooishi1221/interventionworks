/**
 * 画像アップロードユーティリティ — Firebase Storage
 *
 * 1. expo-image-manipulator でリサイズ（max 1024px）& 圧縮（quality 0.7）
 * 2. fetch で Blob 取得（RN の fetch は file:// URI から Blob を正しく生成できる）
 * 3. uploadBytes に Blob を直接渡す（Uint8Array は RN 非対応のため Blob 経由）
 * 4. 公開 URL を返す
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { getStorageInstance } from '../firebase/config';
import { captureError } from './sentry';

const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.7;

/**
 * ローカル画像を圧縮して Firebase Storage にアップロードし、
 * 公開ダウンロード URL を返す。
 */
export async function uploadReviewPhoto(
  localUri: string,
  userId: string,
  spotId: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  // 1) 圧縮・リサイズ
  let compressedUri: string;
  try {
    const compressed = await manipulateAsync(
      localUri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: JPEG_QUALITY, format: SaveFormat.JPEG },
    );
    compressedUri = compressed.uri;
  } catch (e) {
    captureError(e, { context: 'image_compress', localUri });
    throw new Error(`画像の圧縮に失敗しました`);
  }

  // 2) fetch で Blob を取得（RN は file:// URI → Blob を正しく処理できる）
  let blob: Blob;
  try {
    const response = await fetch(compressedUri);
    blob = await response.blob();
  } catch (e) {
    captureError(e, { context: 'image_read', compressedUri });
    throw new Error(`画像ファイルの読み取りに失敗しました`);
  }

  // 3) uploadBytes に Blob を直接渡す
  //    ※ uploadBytesResumable は RN で hang するため uploadBytes を使用
  //    ※ Uint8Array は RN で "Creating blobs from ArrayBuffer not supported" になるため Blob 経由
  const storage = getStorageInstance();
  const filename = `reviews/${spotId}/${userId}_${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);

  try {
    const snapshot = await uploadBytes(storageRef, blob, {
      contentType: 'image/jpeg',
    });
    onProgress?.(1);
    return await getDownloadURL(snapshot.ref);
  } catch (e: unknown) {
    captureError(e, { context: 'image_upload', filename });
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`写真アップロード失敗: ${msg}`);
  }
}
