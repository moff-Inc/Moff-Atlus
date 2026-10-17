// ダウンロードをトリガ
export function downloadSvg(filename: string, svgText: string) {
  const blob = new Blob([svgText], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
