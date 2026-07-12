export type Progress = {
  solved: { add: number; subtract: number; multiply: number };
  attempts: number;
  streak: number;
  startedAt: string;
};
export const freshProgress = (): Progress => ({ solved: { add: 0, subtract: 0, multiply: 0 }, attempts: 0, streak: 0, startedAt: new Date().toISOString() });
export const loadProgress = (): Progress => {
  try { return { ...freshProgress(), ...JSON.parse(localStorage.getItem('folio-progress') ?? '') }; } catch { return freshProgress(); }
};
export const saveProgress = (progress: Progress) => localStorage.setItem('folio-progress', JSON.stringify(progress));
export const downloadProgress = (progress: Progress) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, progress }, null, 2)], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'folio-progress.json' }); link.click(); URL.revokeObjectURL(url);
};
