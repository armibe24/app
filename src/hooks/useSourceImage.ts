import { useSyncExternalStore } from 'react';
import { getSourceImage, onSourceImageChange } from '../image/source';

export function useSourceImage() {
  return useSyncExternalStore(onSourceImageChange, getSourceImage);
}
