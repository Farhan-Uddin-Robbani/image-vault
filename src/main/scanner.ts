import * as fs from 'fs';
import * as path from 'path';

export interface ImageMetadata {
  width?: number;
  height?: number;
  dateTaken?: string;
  cameraMake?: string;
  cameraModel?: string;
  lens?: string;
  focalLength?: string;
  aperture?: string;
  shutterSpeed?: string;
  iso?: number;
  gpsLat?: number;
  gpsLng?: number;
}

export async function getImageMetadata(filePath: string): Promise<ImageMetadata> {
  try {
    const exifr = require('exifr');
    const output = await exifr.parse(filePath, {
      pick: [
        'DateTimeOriginal', 'CreateDate',
        'Make', 'Model', 'LensModel',
        'FocalLength', 'FNumber', 'ExposureTime',
        'ISO', 'GPSLatitude', 'GPSLongitude',
        'ImageWidth', 'ImageHeight',
      ],
      translateKeys: false,
    });

    if (!output) return {};

    const meta: ImageMetadata = {};
    if (output.ImageWidth) meta.width = output.ImageWidth;
    if (output.ImageHeight) meta.height = output.ImageHeight;
    if (output.DateTimeOriginal || output.CreateDate) {
      meta.dateTaken = (output.DateTimeOriginal || output.CreateDate).toISOString?.() || String(output.DateTimeOriginal || output.CreateDate);
    }
    if (output.Make) meta.cameraMake = String(output.Make).trim();
    if (output.Model) meta.cameraModel = String(output.Model).trim();
    if (output.LensModel) meta.lens = String(output.LensModel).trim();
    if (output.FocalLength) meta.focalLength = `${output.FocalLength}mm`;
    if (output.FNumber) meta.aperture = `f/${output.FNumber}`;
    if (output.ExposureTime) {
      meta.shutterSpeed = typeof output.ExposureTime === 'number' && output.ExposureTime < 1
        ? `1/${Math.round(1 / output.ExposureTime)}s`
        : `${output.ExposureTime}s`;
    }
    if (output.ISO) meta.iso = output.ISO;
    if (output.GPSLatitude) meta.gpsLat = output.GPSLatitude;
    if (output.GPSLongitude) meta.gpsLng = output.GPSLongitude;

    return meta;
  } catch {
    return {};
  }
}
