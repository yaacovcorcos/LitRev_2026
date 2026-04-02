export type FileAssetKind = "source" | "export" | "attachment" | string;

export type FileAsset = {
  id: string;
  projectId: string;
  studyId?: string;
  kind: FileAssetKind;
  format?: string;
  filename: string;
  mimeType: string;
  size: number;
  publicUrl?: string;
  downloadUrl?: string;
  version: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};
