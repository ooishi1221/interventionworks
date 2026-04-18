/**
 * usePhotoPicker — Promise-based 写真選択フック
 *
 * `showPicker()` を呼ぶとボトムシートが表示され、
 * ユーザーが撮影/フォルダ選択/キャンセルした結果を
 * Promise<string | null> で返す。
 */
import React, { useCallback, useRef, useState } from 'react';
import { pickPhotoFromCamera, pickPhotoFromLibrary } from '../utils/photoPicker';
import { PhotoPickerSheet } from '../components/PhotoPickerSheet';

type Resolver = (value: string | null) => void;

export function usePhotoPicker() {
  const [visible, setVisible] = useState(false);
  const resolverRef = useRef<Resolver | null>(null);

  const resolve = useCallback((value: string | null) => {
    setVisible(false);
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const showPicker = useCallback((): Promise<string | null> => {
    return new Promise<string | null>((res) => {
      resolverRef.current = res;
      setVisible(true);
    });
  }, []);

  const handleCamera = useCallback(async () => {
    setVisible(false);
    const uri = await pickPhotoFromCamera();
    resolve(uri);
  }, [resolve]);

  const handleLibrary = useCallback(async () => {
    setVisible(false);
    const uri = await pickPhotoFromLibrary();
    resolve(uri);
  }, [resolve]);

  const handleCancel = useCallback(() => {
    resolve(null);
  }, [resolve]);

  const PickerSheet = useCallback(
    () => (
      <PhotoPickerSheet
        visible={visible}
        onCamera={handleCamera}
        onLibrary={handleLibrary}
        onCancel={handleCancel}
      />
    ),
    [visible, handleCamera, handleLibrary, handleCancel],
  );

  return { showPicker, PickerSheet };
}
