import AppKit
import WebKit

// Each web view owns its own preview. JavaScript never receives filesystem paths.
final class ClassifierBridge: NSObject, WKScriptMessageHandlerWithReply {
  private struct Planned {
    let name: String
    let group: String
    let source: URL?
    let status: String
  }
  private let groups = ["ANH PHONG", "ANH DE BAN", "ANH SUA"]
  private var directory: URL?
  private var plan: [Planned] = []
  private var working = false

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage, replyHandler: @escaping (Any?, String?) -> Void) {
    let origin = message.frameInfo.securityOrigin
    guard message.frameInfo.isMainFrame, origin.protocol == "https", ["ananstudio.vercel.app", "anan-photo-select.onrender.com"].contains(origin.host),
          let body = message.body as? [String: Any], let action = body["action"] as? String else {
      replyHandler(nil, "Yêu cầu không hợp lệ."); return
    }
    guard !working else { replyHandler(nil, "Đang phân loại ảnh."); return }
    if action == "prepare" {
      directory = nil; plan = []
      guard let rows = body["rows"] as? [[String: String]], rows.count <= 10000,
            rows.allSatisfy({ ($0["name"]?.count ?? 0) > 0 && ($0["name"]?.count ?? 0) <= 255 && groups.contains($0["group"] ?? "") }) else {
        replyHandler(nil, "Danh sách ảnh không hợp lệ."); return
      }
      let panel = NSOpenPanel()
      panel.title = "Chọn thư mục ảnh gốc"
      panel.canChooseDirectories = true; panel.canChooseFiles = false; panel.allowsMultipleSelection = false
      guard panel.runModal() == .OK, let root = panel.url else { replyHandler(nil, "Đã hủy chọn thư mục."); return }
      working = true
      DispatchQueue.global(qos: .userInitiated).async {
        let result = self.makePlan(root: root, rows: rows)
        DispatchQueue.main.async {
          self.working = false
          switch result {
          case .success(let entries):
            self.directory = root; self.plan = entries
            replyHandler(["directory": root.lastPathComponent, "items": self.response(entries)], nil)
          case .failure(let error): replyHandler(nil, error.localizedDescription)
          }
        }
      }
    } else if action == "run" {
      guard let root = directory, !plan.isEmpty else { replyHandler(nil, "Hãy chọn thư mục và kiểm tra trước."); return }
      let alert = NSAlert()
      alert.messageText = "Di chuyển ảnh đã chọn?"
      alert.informativeText = "Ảnh sẽ được di chuyển trong thư mục \(root.lastPathComponent). Các file trùng hoặc đã tồn tại sẽ được bỏ qua."
      alert.addButton(withTitle: "Di chuyển"); alert.addButton(withTitle: "Hủy")
      guard alert.runModal() == .alertFirstButtonReturn else { replyHandler(nil, "Đã hủy phân loại."); return }
      let current = plan
      plan = []; working = true
      DispatchQueue.global(qos: .userInitiated).async {
        let entries = self.execute(root: root, entries: current)
        DispatchQueue.main.async { self.working = false; replyHandler(["items": self.response(entries)], nil) }
      }
    } else { replyHandler(nil, "Tác vụ không hợp lệ.") }
  }

  private func key(_ name: String) -> String {
    let ext = (name as NSString).pathExtension.lowercased()
    let stem = ["jpg", "jpeg"].contains(ext) ? (name as NSString).deletingPathExtension : name
    return stem.precomposedStringWithCanonicalMapping.trimmingCharacters(in: .whitespacesAndNewlines).folding(options: .caseInsensitive, locale: Locale(identifier: "en_US_POSIX"))
  }
  private func response(_ entries: [Planned]) -> [[String: String]] {
    entries.map { ["name": $0.name, "group": $0.group, "status": $0.status, "path": $0.source?.lastPathComponent ?? $0.name] }
  }
  private func makePlan(root: URL, rows: [[String: String]]) -> Result<[Planned], Error> {
    let fm = FileManager.default
    var sources: [String: [URL]] = [:]
    var scanError: Error?
    guard let enumerator = fm.enumerator(at: root, includingPropertiesForKeys: [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey], options: [], errorHandler: { _, error in scanError = error; return false }) else {
      return .failure(NSError(domain: "Classifier", code: 1, userInfo: [NSLocalizedDescriptionKey: "Không đọc được thư mục ảnh."]))
    }
    for case let url as URL in enumerator {
      do {
        let values = try url.resourceValues(forKeys: [.isDirectoryKey, .isRegularFileKey, .isSymbolicLinkKey])
        if values.isSymbolicLink == true { enumerator.skipDescendants(); continue }
        if values.isDirectory == true && groups.contains(url.lastPathComponent.uppercased()) { enumerator.skipDescendants(); continue }
        if values.isRegularFile == true && ["jpg", "jpeg"].contains(url.pathExtension.lowercased()) { sources[key(url.lastPathComponent), default: []].append(url) }
      } catch { return .failure(error) }
    }
    if let scanError { return .failure(scanError) }
    var counts: [String: Int] = [:]
    for row in rows { counts[key(row["name"]!), default: 0] += 1 }
    return .success(rows.map { row in
      let name = row["name"]!, group = row["group"]!, matches = sources[key(name)] ?? []
      let source = matches.count == 1 ? matches[0] : nil
      var status = counts[key(name), default: 0] > 1 ? "Trùng trong Sheet" : matches.count > 1 ? "Trùng file nguồn" : matches.isEmpty ? "Thiếu file" : "Sẵn sàng"
      if let source, fm.fileExists(atPath: root.appendingPathComponent(group).appendingPathComponent(source.lastPathComponent).path) { status = "Đã có file đích" }
      return Planned(name: name, group: group, source: source, status: status)
    })
  }
  private func execute(root: URL, entries: [Planned]) -> [Planned] {
    let fm = FileManager.default
    return entries.map { item in
      guard item.status == "Sẵn sàng", let source = item.source else { return item }
      do {
        let targetDir = root.appendingPathComponent(item.group, isDirectory: true)
        if fm.fileExists(atPath: targetDir.path) {
          let attributes = try fm.attributesOfItem(atPath: targetDir.path)
          guard attributes[.type] as? FileAttributeType == .typeDirectory else {
            throw NSError(domain: "Classifier", code: 2, userInfo: [NSLocalizedDescriptionKey: "Thư mục đích không hợp lệ."])
          }
        } else {
          try fm.createDirectory(at: targetDir, withIntermediateDirectories: false)
        }
        // moveItem refuses to replace an existing destination, including races.
        try fm.moveItem(at: source, to: targetDir.appendingPathComponent(source.lastPathComponent))
        return Planned(name: item.name, group: item.group, source: source, status: "Đã di chuyển")
      } catch {
        return Planned(name: item.name, group: item.group, source: source, status: "Lỗi: \(error.localizedDescription)")
      }
    }
  }
}
