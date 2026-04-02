export const MAX_STUDY_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const ALLOWED_STUDY_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
export const ALLOWED_STUDY_FILE_EXTENSIONS = [".pdf", ".docx"];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function validateStudyFile(file: File): string | null {
  if (file.size > MAX_STUDY_FILE_SIZE) {
    return `File too large. Maximum size is ${formatFileSize(MAX_STUDY_FILE_SIZE)}.`;
  }
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  if (!ALLOWED_STUDY_FILE_EXTENSIONS.includes(ext) && !ALLOWED_STUDY_FILE_TYPES.includes(file.type)) {
    return "Only PDF and DOCX files are allowed.";
  }
  return null;
}
