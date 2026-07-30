import { describe, expect, it } from "vitest";
import { extractFolderId, matchesAlbumSearch, normalizeSearchText } from "@/lib/google";

describe("extractFolderId", () => {
  const id = "1AbC_defGhijkLMNopQRstuVWXyz";

  it("đọc ID từ link thư mục Drive", () => {
    expect(extractFolderId(`https://drive.google.com/drive/folders/${id}?usp=sharing`)).toBe(id);
  });

  it("đọc ID từ query id", () => {
    expect(extractFolderId(`https://drive.google.com/open?id=${id}`)).toBe(id);
  });

  it("chấp nhận ID thuần và từ chối input không hợp lệ", () => {
    expect(extractFolderId(id)).toBe(id);
    expect(extractFolderId("không phải link Drive")).toBe("");
  });
});

describe("tìm kiếm album thông minh", () => {
  const title = "19/7 Hồng Ngọc & Trần Quang";

  it("khớp từ nằm giữa tên album", () => {
    expect(matchesAlbumSearch(title, "Hồng Ngọc")).toBe(true);
  });

  it("không phân biệt dấu, hoa thường và thứ tự khoảng trắng", () => {
    expect(matchesAlbumSearch(title, "  hong   NGOC ")).toBe(true);
    expect(matchesAlbumSearch(title, "tran quang")).toBe(true);
  });

  it("khớp nhiều phần ở các vị trí khác nhau", () => {
    expect(matchesAlbumSearch(title, "19 ngọc quang")).toBe(true);
    expect(matchesAlbumSearch(title, "minh ngọc")).toBe(false);
  });

  it("chuẩn hoá chữ đ và dấu câu", () => {
    expect(normalizeSearchText("Đặng-Hà")).toBe("dang ha");
  });
});
