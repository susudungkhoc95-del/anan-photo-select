import AppKit
import WebKit

private let appURL = URL(string: "https://ananstudio.vercel.app/")!
private let workflowURL = URL(string: "https://ananstudio.vercel.app/workflow")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate {
  private var window: NSWindow?
  private var statusLabels: [ObjectIdentifier: NSTextField] = [:]

  func applicationDidFinishLaunching(_ notification: Notification) {
    NSWindow.allowsAutomaticWindowTabbing = true
    installMenu()
    window = makeWindow(url: appURL)
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  private func makeWindow(url: URL) -> NSWindow {
    let configuration = WKWebViewConfiguration()
    configuration.websiteDataStore = .default()
    let scrollbarStyle = """
      const style = document.createElement('style');
      style.textContent = 'html, body { scrollbar-color: #496a85 #0a2034 !important; } ::-webkit-scrollbar { width: 10px !important; height: 10px !important; } ::-webkit-scrollbar-track { background: #0a2034 !important; } ::-webkit-scrollbar-thumb { background: #496a85 !important; border: 2px solid #0a2034 !important; border-radius: 999px !important; }';
      document.head.appendChild(style);
    """
    configuration.userContentController.addUserScript(WKUserScript(source: scrollbarStyle, injectionTime: .atDocumentEnd, forMainFrameOnly: true))

    let webView = WKWebView(frame: .zero, configuration: configuration)
    webView.navigationDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.wantsLayer = true
    webView.appearance = NSAppearance(named: .darkAqua)
    webView.layer?.backgroundColor = NSColor(calibratedRed: 0.93, green: 0.96, blue: 1, alpha: 1).cgColor
    webView.load(URLRequest(url: url))

    let content = NSView(frame: NSRect(x: 0, y: 0, width: 1240, height: 820))
    content.wantsLayer = true
    content.layer?.backgroundColor = NSColor(calibratedRed: 0.93, green: 0.96, blue: 1, alpha: 1).cgColor
    webView.translatesAutoresizingMaskIntoConstraints = false
    content.addSubview(webView)
    NSLayoutConstraint.activate([
      webView.leadingAnchor.constraint(equalTo: content.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: content.trailingAnchor),
      webView.topAnchor.constraint(equalTo: content.topAnchor),
      webView.bottomAnchor.constraint(equalTo: content.bottomAnchor)
    ])
    let statusLabel = NSTextField(labelWithString: "Đang mở ANAN STUDIO…")
    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.font = NSFont.systemFont(ofSize: 16, weight: .semibold)
    statusLabel.textColor = NSColor(calibratedRed: 0.08, green: 0.2, blue: 0.34, alpha: 1)
    statusLabel.alignment = .center
    statusLabel.drawsBackground = true
    statusLabel.backgroundColor = NSColor(calibratedRed: 0.93, green: 0.96, blue: 1, alpha: 0.96)
    content.addSubview(statusLabel)
    NSLayoutConstraint.activate([
      statusLabel.centerXAnchor.constraint(equalTo: content.centerXAnchor),
      statusLabel.centerYAnchor.constraint(equalTo: content.centerYAnchor)
    ])
    statusLabels[ObjectIdentifier(webView)] = statusLabel

    let window = NSWindow(
      contentRect: content.frame,
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "ANAN STUDIO by DPlab"
    window.titleVisibility = .visible
    window.tabbingIdentifier = "ANAN-STUDIO"
    window.tabbingMode = .preferred
    window.minSize = NSSize(width: 720, height: 560)
    window.contentView = content
    window.center()
    return window
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    statusLabels[ObjectIdentifier(webView)]?.isHidden = true
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    showLoadError(for: webView)
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    showLoadError(for: webView)
  }

  private func showLoadError(for webView: WKWebView) {
    guard let label = statusLabels[ObjectIdentifier(webView)] else { return }
    label.stringValue = "Không thể tải DP Select. Hãy kiểm tra kết nối Internet rồi thử lại."
    label.isHidden = false
  }

  @objc private func openSelectTab(_ sender: Any?) { openTab(url: appURL) }
  @objc private func openWorkflowTab(_ sender: Any?) { openTab(url: workflowURL) }

  private func openTab(url: URL) {
    let newWindow = makeWindow(url: url)
    let current = NSApp.keyWindow ?? window
    if let current {
      current.addTabbedWindow(newWindow, ordered: .above)
    }
    newWindow.makeKeyAndOrderFront(nil)
  }

  private func installMenu() {
    let mainMenu = NSMenu()
    let appMenuItem = NSMenuItem()
    let appMenu = NSMenu(title: "ANAN STUDIO by DPlab")
    appMenu.addItem(withTitle: "Thoát ANAN STUDIO by DPlab", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appMenuItem.submenu = appMenu
    mainMenu.addItem(appMenuItem)

    let fileMenuItem = NSMenuItem()
    let fileMenu = NSMenu(title: "Tệp")
    fileMenu.addItem(NSMenuItem(title: "Tab DP Select mới", action: #selector(openSelectTab(_:)), keyEquivalent: "t"))
    fileMenu.addItem(NSMenuItem(title: "Tab DP Workflow mới", action: #selector(openWorkflowTab(_:)), keyEquivalent: "T"))
    fileMenu.addItem(.separator())
    fileMenu.addItem(withTitle: "Đóng tab", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    fileMenuItem.submenu = fileMenu
    mainMenu.addItem(fileMenuItem)
    NSApp.mainMenu = mainMenu
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
    let host = url.host ?? ""
    if host == "ananstudio.vercel.app" || host.hasSuffix(".vercel.app") || url.scheme == "about" {
      decisionHandler(.allow)
    } else {
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
