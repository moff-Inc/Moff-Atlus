import { redirect } from "next/navigation";

// テンプレート一覧は廃止。各テンプレートはライブラリの所属フォルダ（AX / CD など）に表示する。
// 旧リンク・ブックマーク用にホームへ転送する。
export default function GeneratePickerPage() {
  redirect("/");
}
