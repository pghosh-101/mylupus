import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import type { ReportImage } from '@/lib/ai';

/** Claude reads text fine at this size; it keeps uploads small and under the API's image limits. */
const MAX_SIDE = 2000;

async function prepare(asset: ImagePicker.ImagePickerAsset): Promise<ReportImage> {
  const ctx = ImageManipulator.manipulate(asset.uri);
  const longest = Math.max(asset.width, asset.height);
  if (longest > MAX_SIDE) {
    const scale = MAX_SIDE / longest;
    ctx.resize({ width: Math.round(asset.width * scale), height: Math.round(asset.height * scale) });
  }
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!saved.base64) throw new Error("Couldn't process that image.");
  return { base64: saved.base64, mediaType: 'image/jpeg' };
}

/** Take a photo of a lab report. Returns null if cancelled. */
export async function photographReport(): Promise<ReportImage[] | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Camera access is off. Turn it on in Settings > Expo Go > Camera.');
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  return Promise.all(result.assets.map(prepare));
}

/** Pick up to 5 photos or screenshots of lab reports. Returns null if cancelled. */
export async function pickReportImages(): Promise<ReportImage[] | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: 5,
    quality: 1,
  });
  if (result.canceled) return null;
  return Promise.all(result.assets.map(prepare));
}
