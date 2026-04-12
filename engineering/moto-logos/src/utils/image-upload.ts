/**
 * 画像アップロードユーティリティ — Firebase Storage
 *
 * 1. expo-image-manipulator でリサイズ（max 1024px）& 圧縮（quality 0.7）
 * 2. Firebase Storage にアップロード
 * 3. 公開 URL を返す
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { getStorageInstance } from '../firebase/config';

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
  const compressed = await manipulateAsync(
    localUri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: JPEG_QUALITY, format: SaveFormat.JPEG },
  );

  // 2) Blob に変換
  const response = await fetch(compressed.uri);
  const blob = await response.blob();

  // 3) Storage にアップロード
  const storage = getStorageInstance();
  const filename = `reviews/${spotId}/${userId}_${Date.now()}.jpg`;
  const storageRef = ref(storage, filename);

  return new Promise<string>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob);

    task.on(
      'state_changed',
      (snapshot) => {
        const progress = snapshot.bytesTransferred / snapshot.totalBytes;
        onProgress?.(progress);
      },
      (error) => reject(error),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        resolve(url);
      },
    );
  });
}
