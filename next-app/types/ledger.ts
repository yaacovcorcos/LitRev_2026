export type StudyStatus = "pending" | "extracted";

export type Study = {
  id: string;
  title: string;
  authors: string;
  year: number;
  status: StudyStatus;
  quality: "High" | "Medium" | "Low" | "-";
};
