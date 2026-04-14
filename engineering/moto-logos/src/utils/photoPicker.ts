/**
 * photoPicker — 写真ピッキングの共通ユーティリティ (#91)
 *
 * カメラ／ライブラリのパーミッション処理と起動を一箇所に集約。
 * グローブ操作を想定し、最小ステップで写真URIを返す。
 */
import * as ImagePicker from 'expo-image-picker';

/** カメラを起動し、非対応（シミュレータ等）の場合はライブラリにフォールバック。 */
export async function pickPhotoFromCamera(): Promise<string | null> {
  // カメラを試す
  try {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status === 'granted') {
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
      });
      if (!result.canceled && result.assets?.length) {
        return result.assets[0].uri;
      }
      // ユーザーがキャンセルした場合
      if (result.canceled) return null;
    }
  } catch {
    // カメラ非対応 → ライブラリにフォールバック
  }

  // フォールバック: ライブラリから選択
  return pickPhotoFromLibrary();
}

/** ライブラリから写真を選択する。 */
export async function pickPhotoFromLibrary(): Promise<string | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    quality: 0.7,
    allowsEditing: false,
  });
  if (!result.canceled && result.assets?.length) {
    return result.assets[0].uri;
  }
  return null;
}
