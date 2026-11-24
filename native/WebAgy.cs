using System;
using System.IO;
using System.Net;
using System.Text;
using System.Drawing;
using System.Threading;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Windows.Forms;

internal static class WebAgy
{
    private static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    private const string Address = "http://127.0.0.1:3008";
    private static string language = "en";
    private static string NormalizeLanguage(object value) { return Convert.ToString(value) == "zh-CN" ? "zh-CN" : "en"; }
    private static string T(string chinese, string english) { return language == "en" ? english : chinese; }
    private static string WindowTitle { get { return T("WebAgy — Gemini 本地工作台", "WebAgy — Local Workspace for Gemini"); } }
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr FindWindow(string className, string title);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] private static extern bool ShowWindow(IntPtr handle, int command);

    private sealed class LocalClient : WebClient
    {
        public LocalClient() { Proxy = null; Encoding = Encoding.UTF8; }
        protected override WebRequest GetWebRequest(Uri address) { var request = base.GetWebRequest(address); request.Timeout = 2000; return request; }
    }
    private static bool Healthy()
    {
        try { using (var client = new LocalClient()) {
            var health = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(client.DownloadString(Address + "/healthz"));
            object value; if (health.TryGetValue("language", out value)) language = NormalizeLanguage(value);
            if (!health.TryGetValue("app", out value)) return false;
            var app = Convert.ToString(value);
            return app == "webagy" || app == "gemini-workspace";
        } }
        catch { return false; }
    }
    private static bool StartBackend()
    {
        var launch = Path.Combine(Root, "Launch.ps1");
        var shell = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe");
        var info = new ProcessStartInfo(shell, "-NoProfile -NonInteractive -File \"" + launch + "\" -NoWindow");
        info.WorkingDirectory = Root; info.UseShellExecute = false; info.CreateNoWindow = true; info.WindowStyle = ProcessWindowStyle.Hidden;
        info.RedirectStandardOutput = true; info.RedirectStandardError = true;
        using (var process = Process.Start(info))
        {
            process.BeginOutputReadLine(); process.BeginErrorReadLine();
            if (!process.WaitForExit(20000)) { try { process.Kill(); } catch { } return false; }
            return process.ExitCode == 0 && Healthy();
        }
    }
    private static void OpenPanel()
    {
        try { using (var client = new LocalClient()) {
            var saved = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(client.DownloadString(Address + "/api/state"));
            client.Headers["Content-Type"] = "application/json";
            client.Headers["X-Workspace-Csrf"] = Convert.ToString(saved["csrf"]);
            client.UploadString(Address + "/api/startup/restore", "POST", "{}");
        } } catch { }
        var window = FindWindow(null, WindowTitle);
        if (window == IntPtr.Zero) window = FindWindow(null, T("WebAgy — Local Workspace for Gemini", "WebAgy — Gemini 本地工作台"));
        if (window != IntPtr.Zero) { ShowWindow(window, 9); SetForegroundWindow(window); return; }
        var edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\Edge\\Application\\msedge.exe");
        if (!File.Exists(edge)) edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\Edge\\Application\\msedge.exe");
        if (File.Exists(edge)) Process.Start(new ProcessStartInfo(edge, "--app=" + Address + " --window-size=1440,1040") { UseShellExecute = true });
        else Process.Start(Address);
    }
    private static bool StopBackend()
    {
        if (!Healthy()) return true;
        try
        {
            using (var client = new LocalClient())
            {
                var state = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(client.DownloadString(Address + "/api/state"));
                client.Headers["Content-Type"] = "application/json";
                client.Headers["X-Workspace-Csrf"] = Convert.ToString(state["csrf"]);
                client.UploadString(Address + "/api/shutdown", "POST", "{}");
            }
            for (var i = 0; i < 15; i++) { Thread.Sleep(100); if (!Healthy()) return true; }
        }
        catch { return !Healthy(); }
        return false;
    }
    private sealed class TrayContext : ApplicationContext
    {
        private readonly NotifyIcon tray;
        private readonly System.Windows.Forms.Timer timer;
        private int missed;
        public TrayContext()
        {
            var menu = new ContextMenuStrip();
            var openItem = menu.Items.Add(T("打开 WebAgy", "Open WebAgy"), null, (sender, args) => { if (Healthy() || StartBackend()) OpenPanel(); });
            menu.Items.Add(new ToolStripSeparator());
            var stopItem = menu.Items.Add(T("停止服务并退出", "Stop service and quit"), null, (sender, args) => {
                if (StopBackend()) ExitThread();
                else MessageBox.Show(T("服务暂时未能停止，请稍后重试。工作台仍保留在托盘中。", "The service has not stopped yet. Please retry; WebAgy remains in the system tray."), "WebAgy", MessageBoxButtons.OK, MessageBoxIcon.Information);
            });
            tray = new NotifyIcon { Text = T("WebAgy · Gemini 本地工作台", "WebAgy · Local Workspace for Gemini"), Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), ContextMenuStrip = menu, Visible = true };
            tray.DoubleClick += (sender, args) => { if (Healthy() || StartBackend()) OpenPanel(); };
            timer = new System.Windows.Forms.Timer { Interval = 1800 };
            timer.Tick += (sender, args) => {
                if (Healthy()) missed = 0; else if (++missed >= 3) ExitThread();
                openItem.Text = T("打开 WebAgy", "Open WebAgy");
                stopItem.Text = T("停止服务并退出", "Stop service and quit");
                tray.Text = T("WebAgy · Gemini 本地工作台", "WebAgy · Local Workspace for Gemini");
            };
            timer.Start(); OpenPanel();
        }
        protected override void ExitThreadCore() { timer.Stop(); timer.Dispose(); tray.Visible = false; tray.Dispose(); base.ExitThreadCore(); }
    }
    [STAThread]
    private static int Main()
    {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        try {
            var saved = new JavaScriptSerializer().Deserialize<Dictionary<string, object>>(File.ReadAllText(Path.Combine(Root, ".local", "state", "config.json")));
            object value; if (saved.TryGetValue("language", out value)) language = NormalizeLanguage(value);
        } catch { }
        bool created;
        using (var mutex = new Mutex(true, "Local\\WebAgy-LocalWorkspace", out created))
        {
            bool ownsMutex = created;
            try
            {
                if (!StartBackend()) { MessageBox.Show(T("WebAgy 未能启动。请确认文件已完整解压；源码版请先运行“安装依赖.cmd”。\n\n运行日志位于 .local\\state。", "WebAgy could not start. Fully extract the package; for a source build, run Setup.ps1 first.\n\nLogs are in .local\\state."), "WebAgy", MessageBoxButtons.OK, MessageBoxIcon.Information); return 1; }
                if (!ownsMutex)
                {
                    try { ownsMutex = mutex.WaitOne(0); }
                    catch (AbandonedMutexException) { ownsMutex = true; }
                }
                if (!ownsMutex) { OpenPanel(); return 0; }
                Application.Run(new TrayContext()); return 0;
            }
            catch { MessageBox.Show(T("启动未完成，请重新打开 WebAgy。请保留软件目录和 .local 中的运行依赖。", "Startup did not finish. Reopen WebAgy and keep its software folder and .local runtime dependencies together."), "WebAgy", MessageBoxButtons.OK, MessageBoxIcon.Information); return 1; }
            finally { if (ownsMutex) mutex.ReleaseMutex(); }
        }
    }
}
