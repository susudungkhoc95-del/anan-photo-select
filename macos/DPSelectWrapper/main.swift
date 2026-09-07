import AppKit
import WebKit

private let appURL = URL(string: "https://anan-photo-select.onrender.com/")!
private let workflowURL = URL(string: "https://anan-photo-select.onrender.com/workflow")!
private let showURL = URL(string: "https://anan-photo-select.onrender.com/show")!
private let vercelAppURL = URL(string: "https://ananstudio.vercel.app/")!
private let vercelWorkflowURL = URL(string: "https://ananstudio.vercel.app/workflow")!
private let vercelShowURL = URL(string: "https://ananstudio.vercel.app/show")!

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, NSWindowDelegate {
  private var window: NSWindow?
  // Keep every tab alive explicitly. Relying only on AppKit's tab group can
  // leave a released window behind when one tab is closed.
  private var tabWindows: [NSWindow] = []
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
    let statusLabel = NSTextField(labelWithString: "Đang mở DP WORKFLOW…")
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
    let environment = url.host == "anan-photo-select.onrender.com" ? "Render" : "Vercel"
    window.title = "DP Workflow · \(environment)"
    window.delegate = self
    window.titleVisibility = .visible
    window.tabbingIdentifier = "ANAN-STUDIO"
    window.tabbingMode = .preferred
    window.minSize = NSSize(width: 720, height: 560)
    window.contentView = content
    window.center()
    tabWindows.append(window)
    return window
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func windowWillClose(_ notification: Notification) {
    guard let closingWindow = notification.object as? NSWindow else { return }
    tabWindows.removeAll { $0 === closingWindow }
    if window === closingWindow {
      window = tabWindows.first
    }
  }

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

  @objc private func openSelectTab(_ sender: Any?) { openTab(url: appURL, from: NSApp.keyWindow ?? window) }
  @objc private func openWorkflowTab(_ sender: Any?) { openTab(url: workflowURL, from: NSApp.keyWindow ?? window) }
  @objc private func openShowTab(_ sender: Any?) { openTab(url: showURL, from: NSApp.keyWindow ?? window) }
  @objc private func openVercelSelectTab(_ sender: Any?) { openTab(url: vercelAppURL, from: NSApp.keyWindow ?? window) }
  @objc private func openVercelWorkflowTab(_ sender: Any?) { openTab(url: vercelWorkflowURL, from: NSApp.keyWindow ?? window) }
  @objc private func openVercelShowTab(_ sender: Any?) { openTab(url: vercelShowURL, from: NSApp.keyWindow ?? window) }

  private func openTab(url: URL, from sourceWindow: NSWindow? = nil) {
    let newWindow = makeWindow(url: url)
    let current = sourceWindow ?? NSApp.keyWindow ?? window
    if let current {
      // Attach the new web view as a native macOS tab in the same window,
      // like a browser tab, instead of leaving it as a separate window.
      current.addTabbedWindow(newWindow, ordered: .above)
    }
    newWindow.makeKeyAndOrderFront(nil)
  }

  private func installMenu() {
    let mainMenu = NSMenu()
    let appMenuItem = NSMenuItem()
    let appMenu = NSMenu(title: "DP Workflow")
    appMenu.addItem(withTitle: "Thoát DP Workflow", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    appMenuItem.submenu = appMenu
    mainMenu.addItem(appMenuItem)

    let fileMenuItem = NSMenuItem()
    let fileMenu = NSMenu(title: "Tệp")
    let renderMenu = NSMenu(title: "Render")
    renderMenu.addItem(NSMenuItem(title: "DP Select", action: #selector(openSelectTab(_:)), keyEquivalent: "t"))
    renderMenu.addItem(NSMenuItem(title: "DP Workflow", action: #selector(openWorkflowTab(_:)), keyEquivalent: "T"))
    renderMenu.addItem(NSMenuItem(title: "SHOW", action: #selector(openShowTab(_:)), keyEquivalent: "s"))
    let renderItem = fileMenu.addItem(withTitle: "Mở tab Render", action: nil, keyEquivalent: "")
    fileMenu.setSubmenu(renderMenu, for: renderItem)
    let vercelMenu = NSMenu(title: "Vercel")
    vercelMenu.addItem(NSMenuItem(title: "DP Select", action: #selector(openVercelSelectTab(_:)), keyEquivalent: "") )
    vercelMenu.addItem(NSMenuItem(title: "DP Workflow", action: #selector(openVercelWorkflowTab(_:)), keyEquivalent: "") )
    vercelMenu.addItem(NSMenuItem(title: "SHOW", action: #selector(openVercelShowTab(_:)), keyEquivalent: "") )
    let vercelItem = fileMenu.addItem(withTitle: "Mở tab Vercel", action: nil, keyEquivalent: "")
    fileMenu.setSubmenu(vercelMenu, for: vercelItem)
    fileMenu.addItem(.separator())
    fileMenu.addItem(withTitle: "Đóng tab", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    fileMenuItem.submenu = fileMenu
    mainMenu.addItem(fileMenuItem)

    // Keep the standard macOS text-editing commands available to WKWebView.
    // Without an Edit menu, Cmd+C/V can be swallowed by the wrapper instead
    // of being dispatched to the focused input/textarea.
    let editMenuItem = NSMenuItem()
    let editMenu = NSMenu(title: "Sửa")
    editMenu.addItem(NSMenuItem(title: "Hoàn tác", action: Selector(("undo:")), keyEquivalent: "z"))
    editMenu.addItem(NSMenuItem(title: "Làm lại", action: Selector(("redo:")), keyEquivalent: "Z"))
    editMenu.addItem(.separator())
    editMenu.addItem(NSMenuItem(title: "Cắt", action: Selector(("cut:")), keyEquivalent: "x"))
    editMenu.addItem(NSMenuItem(title: "Sao chép", action: Selector(("copy:")), keyEquivalent: "c"))
    editMenu.addItem(NSMenuItem(title: "Dán", action: Selector(("paste:")), keyEquivalent: "v"))
    editMenu.addItem(NSMenuItem(title: "Chọn tất cả", action: Selector(("selectAll:")), keyEquivalent: "a"))
    editMenuItem.submenu = editMenu
    mainMenu.addItem(editMenuItem)
    NSApp.mainMenu = mainMenu
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
    let host = url.host ?? ""
    let isAppHost = host == "anan-photo-select.onrender.com" || host == "ananstudio.vercel.app" || host.hasSuffix(".vercel.app")
    // App links (Render/Vercel) open in a native tab. Other links stay in the
    // default browser, avoiding recursive WebKit tabs for external redirects.
    if navigationAction.targetFrame == nil {
      if isAppHost {
        openTab(url: url, from: webView.window)
      } else {
        NSWorkspace.shared.open(url)
      }
      decisionHandler(.cancel)
      return
    }
    if isAppHost || url.scheme == "about" {
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
